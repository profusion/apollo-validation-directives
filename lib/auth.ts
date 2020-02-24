// eslint-disable-next-line filenames/match-exported
import { AuthenticationError } from 'apollo-server-errors';

import {
  defaultFieldResolver,
  DirectiveLocation,
  GraphQLField,
  GraphQLFieldResolver,
  GraphQLInterfaceType,
  GraphQLObjectType,
} from 'graphql';

import EasyDirectiveVisitor from './EasyDirectiveVisitor';

type ResolverArgs<TContext extends object = object> = Parameters<
  GraphQLFieldResolver<unknown, TContext>
>;

export type AuthContext<TContext extends object = object> = {
  isAuthenticated: (...args: ResolverArgs<TContext>) => boolean;
};

export class AuthDirectiveVisitor<
  TContext extends AuthContext
> extends EasyDirectiveVisitor<{}> {
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

  public visitFieldDefinition(field: GraphQLField<unknown, TContext>): void {
    const { resolve = defaultFieldResolver } = field;
    const { errorMessage } = this;

    // eslint-disable-next-line no-param-reassign
    field.resolve = function(...args): Promise<unknown> {
      const { isAuthenticated } = args[2];
      if (!isAuthenticated.apply(this, args)) {
        throw new AuthenticationError(errorMessage);
      }

      return resolve.apply(this, args);
    };
  }
}

export default AuthDirectiveVisitor;
