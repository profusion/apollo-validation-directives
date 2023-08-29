import type {
  GraphQLFieldResolver,
  GraphQLResolveInfo,
  GraphQLSchema,
  GraphQLDirective,
  GraphQLInputObjectType,
  GraphQLArgument,
  GraphQLObjectType,
} from 'graphql';
import {
  DirectiveLocation,
  GraphQLEnumType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLString,
  isInputObjectType,
} from 'graphql';

import isEqual from 'lodash.isequal';

import EasyDirectiveVisitor from './EasyDirectiveVisitor';
import ForbiddenError from './errors/ForbiddenError';

import type { ValidateFunction } from './ValidateDirectiveVisitor';
import ValidateDirectiveVisitor, {
  ValidateDirectivePolicy,
} from './ValidateDirectiveVisitor';

const isDebug = !!(
  process &&
  process.env &&
  process.env.NODE_ENV !== 'production'
);

type ResolverArgs<TContext extends object = object> = Parameters<
  GraphQLFieldResolver<unknown, TContext>
>;

export interface MissingPermissionsResolverInfo extends GraphQLResolveInfo {
  missingPermissions?: string[];
}

export type CheckMissingPermissions<TContext extends object = object> = (
  requiredPermissions: string[],
  cacheKey: string,
  ...args: ResolverArgs<TContext>
) => null | string[];

export type HasPermissionsContext<TContext extends object = object> = {
  checkMissingPermissions: CheckMissingPermissions<TContext>;
};

export type FilterMissingPermissions = (
  grantedPermissions: Set<string> | undefined,
  requiredPermissions: string[],
) => null | string[];

// gather all missing permissions, only useful during debug since it's slower
// but lists everything at once, which helps debug
export const debugFilterMissingPermissions = (
  grantedPermissions: Set<string> | undefined,
  requiredPermissions: string[],
): null | string[] => {
  if (!grantedPermissions) {
    return requiredPermissions;
  }
  const missing = requiredPermissions.filter(p => !grantedPermissions.has(p));
  if (missing.length === 0) return null;
  return missing;
};

// faster version that fails on the first missing permission, reports only that
export const prodFilterMissingPermissions = (
  grantedPermissions: Set<string> | undefined,
  requiredPermissions: string[],
): null | string[] => {
  if (!grantedPermissions) {
    return requiredPermissions;
  }
  const missing = requiredPermissions.find(p => !grantedPermissions.has(p));
  if (!missing) return null;
  return [missing];
};

/* istanbul ignore next */
const defaultFilterMissingPermissions = isDebug
  ? debugFilterMissingPermissions
  : prodFilterMissingPermissions;

export type GetErrorMessage = (missingPermissions: string[]) => string;

const errorMessage = 'Missing Permissions';

export const debugGetErrorMessage = (missingPermissions: string[]): string =>
  `${errorMessage}: ${missingPermissions.join(', ')}`;

export const prodGetErrorMessage = (): string => errorMessage;

export type HasPermissionsDirectiveArgs = {
  permissions: string[];
  policy: ValidateDirectivePolicy;
};

const defaultPolicyOutsideClass: ValidateDirectivePolicy =
  ValidateDirectivePolicy.THROW;

export const getDefaultValue = (
  container: GraphQLArgument | GraphQLInputObjectType | GraphQLObjectType,
  path?: Array<string>,
): unknown => {
  if ('defaultValue' in container) {
    return container.defaultValue;
  }
  if (isInputObjectType(container) && path && path.length > 0) {
    const fieldName = path[path.length - 1];
    const field = container.getFields()[fieldName];
    return field.defaultValue;
  }
  return undefined;
};

export class HasPermissionsDirectiveVisitor<
  TArgs extends HasPermissionsDirectiveArgs,
  TContext extends HasPermissionsContext,
> extends ValidateDirectiveVisitor<TArgs, TContext> {
  public static readonly defaultName: string = 'hasPermissions';

  public static readonly defaultPolicy: ValidateDirectivePolicy =
    defaultPolicyOutsideClass;

  public readonly applyValidationToOutputTypesAfterOriginalResolver: Boolean =
    false;

  public static readonly config: typeof ValidateDirectiveVisitor['config'] = {
    args: {
      permissions: {
        description:
          'All permissions required by this field (or object). All must be fulfilled',
        type: new GraphQLNonNull(
          new GraphQLList(new GraphQLNonNull(GraphQLString)),
        ),
      },
      policy: {
        defaultValue: defaultPolicyOutsideClass,
        description: 'How to handle missing permissions',
        type: new GraphQLEnumType({
          name: 'HasPermissionsDirectivePolicy',
          values: {
            RESOLVER: {
              description:
                'Field resolver is responsible to evaluate it using `missingPermissions` injected argument',
              value: ValidateDirectivePolicy.RESOLVER,
            },
            THROW: {
              description:
                'Field resolver is not called if permissions are missing, it throws `ForbiddenError`',
              value: ValidateDirectivePolicy.THROW,
            },
          },
        }),
      },
    },
    description: 'ensures it has permissions before calling the resolver',
    locations: [
      DirectiveLocation.ARGUMENT_DEFINITION,
      DirectiveLocation.FIELD_DEFINITION,
      DirectiveLocation.INPUT_FIELD_DEFINITION,
      DirectiveLocation.INPUT_OBJECT,
      DirectiveLocation.OBJECT,
    ],
  };

  public static getDirectiveDeclaration(
    givenDirectiveName?: string,
    schema?: GraphQLSchema,
  ): GraphQLDirective {
    return EasyDirectiveVisitor.getDirectiveDeclaration.apply(this, [
      givenDirectiveName,
      schema,
    ]);
  }

  public static createDirectiveContext({
    grantedPermissions: rawGrantedPermissions,
    filterMissingPermissions = defaultFilterMissingPermissions,
  }: {
    grantedPermissions: string[] | undefined;
    filterMissingPermissions?: FilterMissingPermissions;
  }): HasPermissionsContext {
    const grantedPermissions = rawGrantedPermissions
      ? new Set(rawGrantedPermissions)
      : undefined;

    const missingPermissionsCache: { [key: string]: string[] | null } = {};

    const checkMissingPermissions = (
      requiredPermissions: string[],
      cacheKey: string,
    ): string[] | null => {
      let missingPermissions = missingPermissionsCache[cacheKey];
      if (missingPermissions === undefined) {
        missingPermissions = filterMissingPermissions(
          grantedPermissions,
          requiredPermissions,
        );
        missingPermissionsCache[cacheKey] = missingPermissions;
      }
      return missingPermissions;
    };
    return { checkMissingPermissions };
  }

  /* istanbul ignore next */
  public getErrorMessage: GetErrorMessage = isDebug
    ? debugGetErrorMessage
    : prodGetErrorMessage;

  public getValidationForArgs(
    location: DirectiveLocation,
    // args: TArgs,
  ): ValidateFunction<TContext> | undefined {
    const { permissions, policy } = this.args;
    const cacheKey = JSON.stringify(Array.from(permissions).sort());
    const isUsedOnInputOrArgument =
      location === DirectiveLocation.INPUT_FIELD_DEFINITION ||
      location === DirectiveLocation.INPUT_OBJECT ||
      location === DirectiveLocation.ARGUMENT_DEFINITION;

    const hasPermissionsValidateFunction: ValidateFunction<TContext> = (
      value: unknown,
      _: unknown,
      container: GraphQLArgument | GraphQLInputObjectType | GraphQLObjectType,
      context: TContext,
      resolverInfo: Record<string, unknown>,
      resolverSource: unknown,
      resolverArgs: Record<string, unknown>,
      path?: Array<string>,
    ): unknown => {
      if (isUsedOnInputOrArgument) {
        if (value === undefined) {
          return value;
        }

        const defaultValue = getDefaultValue(container, path);
        if (isEqual(value, defaultValue)) {
          return value;
        }
      }

      if (!permissions || !permissions.length) {
        return value;
      }

      const { checkMissingPermissions } = context;
      let missingPermissions = checkMissingPermissions.apply(this, [
        permissions,
        cacheKey,
        resolverSource,
        resolverArgs,
        context,
        resolverInfo as unknown as GraphQLResolveInfo,
      ]);
      if (!(missingPermissions && missingPermissions.length > 0)) {
        missingPermissions = null;
      }

      if (policy === ValidateDirectivePolicy.THROW && missingPermissions) {
        throw new ForbiddenError(this.getErrorMessage(missingPermissions));
      }

      /*
        If any missing permissions existed from other hasPermissions that
        were executed before it, then pass or extend that array with the new
        permissions
      */
      const existingMissingPermissions = resolverInfo.missingPermissions;
      if (existingMissingPermissions) {
        if (!Array.isArray(existingMissingPermissions)) {
          throw new Error('The missingPermissions field is not an array!');
        }
        if (!missingPermissions) {
          missingPermissions = existingMissingPermissions;
        } else {
          missingPermissions = missingPermissions.concat(
            existingMissingPermissions,
          );
        }
      }
      // eslint-disable-next-line no-param-reassign
      resolverInfo.missingPermissions = missingPermissions;

      return value;
    };

    return hasPermissionsValidateFunction;
  }
}

export default HasPermissionsDirectiveVisitor;

/*
  graphql-tools changed the typing for SchemaDirectiveVisitor and if you define a type for TArgs and TContext,
  you'll get this error: "Type 'typeof Your_Directive_Class' is not assignable to type 'typeof SchemaDirectiveVisitor'.".
  If you are using the old graphql-tools, you can use:
  extends EasyDirectiveVisitor<Record<string, never>, TContext>
*/
export const HasPermissionsDirectiveVisitorNonTyped: typeof HasPermissionsDirectiveVisitor<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
> = HasPermissionsDirectiveVisitor;
