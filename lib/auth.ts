import { defaultFieldResolver, DirectiveLocation } from 'graphql';
import type {
  GraphQLField,
  GraphQLFieldResolver,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLFieldConfig,
  GraphQLSchema,
} from 'graphql';

import { getDirective } from '@graphql-tools/utils';

import EasyDirectiveVisitor from './EasyDirectiveVisitor';
import AuthenticationError from './errors/AuthenticationError';

type ResolverArgs<TContext extends object = object> = Parameters<
  GraphQLFieldResolver<unknown, TContext>
>;

export type AuthContext<TContext extends object = object> = {
  isAuthenticated: (...args: ResolverArgs<TContext>) => boolean;
};

class AuthDirectiveVisitor<
  TContext extends AuthContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
> extends EasyDirectiveVisitor<any, TContext> {
  public errorMessage = 'Unauthenticated';

  public static readonly config: typeof EasyDirectiveVisitor['config'] = {
    description: 'ensures is authenticated before calling the resolver',
    locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
  };

  public static readonly defaultName: string = 'auth';

  public static createDirectiveContext({
    isAuthenticated,
  }: {
    isAuthenticated: boolean | ((...args: ResolverArgs) => boolean);
  }): AuthContext {
    return {
      isAuthenticated:
        typeof isAuthenticated === 'function'
          ? isAuthenticated
          : (): boolean => !!isAuthenticated,
    };
  }

  public visitObject(object: GraphQLObjectType | GraphQLInterfaceType): void {
    Object.values(object.getFields()).forEach(field => {
      this.visitFieldDefinition(field);
    });
  }

  public visitFieldDefinition(
    field:
      | GraphQLFieldConfig<unknown, TContext>
      | GraphQLField<unknown, TContext>,
  ): void {
    const { resolve = defaultFieldResolver } = field;
    const { errorMessage } = this;

    // eslint-disable-next-line no-param-reassign
    field.resolve = function (...args): unknown {
      const { isAuthenticated } = args[2];
      if (!isAuthenticated.apply(this, args)) {
        throw new AuthenticationError(errorMessage);
      }

      return resolve.apply(this, args);
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public visitQuery(
    query: GraphQLObjectType<unknown, TContext>,
    schema: GraphQLSchema,
    directiveName: string,
  ): void {
    const fields = Object.values(query.getFields());
    fields.forEach(field => {
      const [directive] = getDirective(schema, field, directiveName) ?? [];
      if (directive) {
        this.visitFieldDefinition(field);
      }
    });
  }
}

export default AuthDirectiveVisitor;

/*
  graphql-tools changed the typing for SchemaDirectiveVisitor and if you define a type for TArgs and TContext,
  you'll get this error: "Type 'typeof Your_Directive_Class' is not assignable to type 'typeof SchemaDirectiveVisitor'.".
  If you are using the old graphql-tools, you can use:
  extends EasyDirectiveVisitor<Record<string, never>, TContext>
*/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AuthDirectiveVisitorNonTyped: typeof AuthDirectiveVisitor<any> =
  AuthDirectiveVisitor;
