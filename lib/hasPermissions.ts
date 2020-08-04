import { ForbiddenError } from 'apollo-server-errors';
import {
  defaultFieldResolver,
  DirectiveLocation,
  GraphQLEnumType,
  GraphQLField,
  GraphQLFieldResolver,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
  GraphQLResolveInfo,
} from 'graphql';

import EasyDirectiveVisitor from './EasyDirectiveVisitor';

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

export enum HasPermissionsDirectivePolicy {
  RESOLVER = 'RESOLVER',
  THROW = 'THROW',
}

export type HasPermissionsDirectiveArgs = {
  permissions: string[];
  policy?: HasPermissionsDirectivePolicy;
};
const defaultPolicy: HasPermissionsDirectivePolicy =
  HasPermissionsDirectivePolicy.THROW;

export class HasPermissionsDirectiveVisitor<
  TContext extends HasPermissionsContext
> extends EasyDirectiveVisitor<HasPermissionsDirectiveArgs> {
  public static readonly config: typeof EasyDirectiveVisitor['config'] = {
    args: {
      permissions: {
        description:
          'All permissions required by this field (or object). All must be fulfilled',
        type: new GraphQLNonNull(
          new GraphQLList(new GraphQLNonNull(GraphQLString)),
        ),
      },
      policy: {
        defaultValue: defaultPolicy,
        description: 'How to handle missing permissions',
        type: new GraphQLEnumType({
          name: 'HasPermissionsDirectivePolicy',
          values: {
            RESOLVER: {
              description:
                'Field resolver is responsible to evaluate it using `missingPermissions` injected argument',
              value: HasPermissionsDirectivePolicy.RESOLVER,
            },
            THROW: {
              description:
                'Field resolver is not called if permissions are missing, it throws `ForbiddenError`',
              value: HasPermissionsDirectivePolicy.THROW,
            },
          },
        }),
      },
    },
    description: 'ensures it has permissions before calling the resolver',
    locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
  };

  public static readonly defaultName: string = 'hasPermissions';

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

  public visitObject(object: GraphQLObjectType | GraphQLInterfaceType): void {
    Object.values(object.getFields()).forEach(field => {
      this.visitFieldDefinition(field);
    });
  }

  public visitFieldDefinition(field: GraphQLField<unknown, TContext>): void {
    const { resolve = defaultFieldResolver } = field;
    /* istanbul ignore next (directives that do not declare a default policy) */
    const { permissions, policy = defaultPolicy } = this.args;
    if (!permissions || !permissions.length) {
      return;
    }
    const cacheKey = JSON.stringify(Array.from(permissions).sort());

    const { getErrorMessage } = this;

    // eslint-disable-next-line no-param-reassign
    field.resolve = function (
      obj,
      args,
      context,
      info: MissingPermissionsResolverInfo,
    ): Promise<unknown> {
      const { checkMissingPermissions } = context;
      let missingPermissions = checkMissingPermissions.apply(this, [
        permissions,
        cacheKey,
        obj,
        args,
        context,
        info,
      ]);
      if (!(missingPermissions && missingPermissions.length > 0)) {
        missingPermissions = null;
      }

      if (
        policy === HasPermissionsDirectivePolicy.THROW &&
        missingPermissions
      ) {
        throw new ForbiddenError(getErrorMessage(missingPermissions));
      }
      /*
        If any missing permissions existed from other hasPermissions that
        were executed before it, then pass or extend that array with the new
        permissions
      */
      const existingMissingPermissions = info.missingPermissions;
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

      const enhancedInfo = {
        ...info,
        missingPermissions,
      };

      return resolve.apply(this, [obj, args, context, enhancedInfo]);
    };
  }
}

export default HasPermissionsDirectiveVisitor;
