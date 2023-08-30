import type { GraphQLResolveInfo } from 'graphql';
import { graphql } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import gql from 'graphql-tag';

import print from './utils/printer';

import AuthDirective from './auth';
import AuthenticationError from './errors/AuthenticationError';

describe('@auth()', (): void => {
  const name = 'auth';
  const directiveTypeDefs = AuthDirective.getTypeDefs(name);

  it('exports correct typeDefs', (): void => {
    expect(directiveTypeDefs.map(print)).toEqual([
      `\
"""ensures is authenticated before calling the resolver"""
directive @${name} on OBJECT | FIELD_DEFINITION
`,
    ]);
  });

  it('defaultName is correct', (): void => {
    expect(directiveTypeDefs).toEqual(AuthDirective.getTypeDefs());
  });

  describe('createDirectiveContext()', (): void => {
    it('supports function', (): void => {
      const isAuthenticated = (): boolean => true;
      const ctx = AuthDirective.createDirectiveContext({
        isAuthenticated,
      });
      expect(ctx.isAuthenticated).toBe(isAuthenticated);
    });

    it('supports constant', (): void => {
      const isAuthenticated = false;
      const ctx = AuthDirective.createDirectiveContext({
        isAuthenticated,
      });
      expect(ctx.isAuthenticated({}, {}, {}, {} as GraphQLResolveInfo)).toBe(
        isAuthenticated,
      );
    });
  });

  describe('works on object field', (): void => {
    const auth = new AuthDirective();
    const schema = auth.applyToSchema(
      makeExecutableSchema({
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            type SomeObject {
              authenticatedField: Int @auth
              publicField: String
            }
            type Query {
              test: SomeObject
            }
          `,
        ],
      }),
    );
    const source = print(gql`
      query {
        test {
          authenticatedField
          publicField
        }
      }
    `);
    const rootValue = {
      test: {
        authenticatedField: 42,
        publicField: 'hello',
      },
    };

    it('if authenticated, returns all', async (): Promise<void> => {
      const contextValue = AuthDirective.createDirectiveContext({
        isAuthenticated: true,
      });
      const result = await graphql({
        contextValue,
        rootValue,
        schema,
        source,
      });
      expect(result).toEqual({
        data: rootValue,
      });
    });

    it('if NOT authenticated, returns partial', async (): Promise<void> => {
      const contextValue = AuthDirective.createDirectiveContext({
        isAuthenticated: false,
      });
      const result = await graphql({ contextValue, rootValue, schema, source });
      expect(result).toEqual({
        data: {
          test: {
            authenticatedField: null,
            publicField: rootValue.test.publicField,
          },
        },
        errors: [new AuthenticationError('Unauthenticated')],
      });
    });
  });

  describe('works on whole object', (): void => {
    const auth = new AuthDirective();
    const schema = auth.applyToSchema(
      makeExecutableSchema({
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            type MyAuthenticatedObject @auth {
              authenticatedField: Int # behaves as @auth
              anotherAuthenticatedField: String # behaves as @auth
            }
            type Query {
              test: MyAuthenticatedObject
            }
          `,
        ],
      }),
    );
    const source = print(gql`
      query {
        test {
          authenticatedField
          anotherAuthenticatedField
        }
      }
    `);
    const rootValue = {
      test: {
        anotherAuthenticatedField: 'hello',
        authenticatedField: 42,
      },
    };

    it('if authenticated, returns all', async (): Promise<void> => {
      const contextValue = AuthDirective.createDirectiveContext({
        isAuthenticated: true,
      });
      const result = await graphql({
        contextValue,
        rootValue,
        schema,
        source,
      });
      expect(result).toEqual({
        data: rootValue,
      });
    });

    it('if NOT authenticated, returns partial', async (): Promise<void> => {
      const contextValue = AuthDirective.createDirectiveContext({
        isAuthenticated: false,
      });
      const result = await graphql({
        contextValue,
        rootValue,
        schema,
        source,
      });
      expect(result).toEqual({
        data: {
          test: {
            anotherAuthenticatedField: null,
            authenticatedField: null,
          },
        },
        errors: [
          new AuthenticationError('Unauthenticated'),
          new AuthenticationError('Unauthenticated'),
        ],
      });
    });
  });

  describe('works on query field', (): void => {
    const auth = new AuthDirective();
    const schema = auth.applyToSchema(
      makeExecutableSchema({
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            type MyAuthenticatedObject {
              authenticatedField: Int
              anotherAuthenticatedField: String
            }
            type Query {
              test: MyAuthenticatedObject @${name}
            }
          `,
        ],
      }),
    );
    const source = print(gql`
      query {
        test {
          authenticatedField
          anotherAuthenticatedField
        }
      }
    `);
    const rootValue = {
      test: {
        anotherAuthenticatedField: 'hello',
        authenticatedField: 42,
      },
    };

    it('if authenticated, returns value', async (): Promise<void> => {
      const contextValue = AuthDirective.createDirectiveContext({
        isAuthenticated: true,
      });
      const result = await graphql({
        contextValue,
        rootValue,
        schema,
        source,
      });
      expect(result).toEqual({
        data: rootValue,
      });
    });

    it('if NOT authenticated, returns partial', async (): Promise<void> => {
      const contextValue = AuthDirective.createDirectiveContext({
        isAuthenticated: false,
      });
      const result = await graphql({
        contextValue,
        rootValue,
        schema,
        source,
      });
      expect(result).toEqual({
        data: {
          test: null,
        },
        errors: [new AuthenticationError('Unauthenticated')],
      });
    });
  });

  describe('works on mutation fields', (): void => {
    const mockResolver = jest.fn().mockReturnValue(42);
    const schema = new AuthDirective().applyToSchema(
      makeExecutableSchema({
        resolvers: {
          Mutation: {
            testMutation: mockResolver,
          },
        },
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            type Query {
              test: Int
            }
            type Mutation {
              testMutation: Int @${name}
            }
          `,
        ],
      }),
    );
    const source = print(gql`
      mutation {
        testMutation
      }
    `);
    const rootValue = {
      test: 0,
    };

    beforeEach(() => {
      mockResolver.mockClear();
    });

    it('if authenticated, performs mutation', async (): Promise<void> => {
      const contextValue = AuthDirective.createDirectiveContext({
        isAuthenticated: true,
      });
      const result = await graphql({
        contextValue,
        rootValue,
        schema,
        source,
      });
      expect(result).toEqual({
        data: {
          testMutation: 42,
        },
      });
      expect(mockResolver).toHaveBeenCalledTimes(1);
    });

    it('if NOT authenticated, throws error and does not call the resolver', async (): Promise<void> => {
      const contextValue = AuthDirective.createDirectiveContext({
        isAuthenticated: false,
      });
      const result = await graphql({
        contextValue,
        rootValue,
        schema,
        source,
      });
      expect(result).toEqual({
        data: {
          testMutation: null,
        },
        errors: [new AuthenticationError('Unauthenticated')],
      });
      expect(mockResolver).not.toHaveBeenCalled();
    });
  });
});
