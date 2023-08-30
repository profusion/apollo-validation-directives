import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { gql } from 'graphql-tag';

import type { MissingPermissionsResolverInfo } from '../lib/index.js';
import { applyDirectivesToSchema, hasPermissions, auth } from '../lib/index.js';

const yourTypeDefs = [
  gql`
    type Query {
      authenticated: Boolean @auth
      throwIfMissingPermissions: Int @hasPermissions(permissions: ["x", "y"])
      handleMissingPermissions: [String!]
        @hasPermissions(permissions: ["x", "y"], policy: RESOLVER)
    }
    type Mutation {
      setAuthenticated(isAuthenticated: Boolean): Boolean!
      setPermissions(permissions: [String!]): [String!]
    }
  `,
];

const state: {
  grantedPermissions: string[] | null;
  isAuthenticated: boolean | null;
} = {
  grantedPermissions: null,
  isAuthenticated: null,
};

const schema = applyDirectivesToSchema(
  [hasPermissions, auth],
  makeExecutableSchema({
    resolvers: {
      Mutation: {
        setAuthenticated: (
          _,
          { isAuthenticated }: { isAuthenticated: boolean | null },
        ): boolean | null => {
          state.isAuthenticated = isAuthenticated;
          return isAuthenticated;
        },
        setPermissions: (
          _,
          { permissions }: { permissions: string[] | null },
        ): string[] | null => {
          state.grantedPermissions = permissions;
          return permissions;
        },
      },
      Query: {
        authenticated: (): boolean => state.isAuthenticated || false,
        handleMissingPermissions: (
          _,
          __,
          ___,
          { missingPermissions }: MissingPermissionsResolverInfo,
        ): string[] | null => missingPermissions || null,
        throwIfMissingPermissions: (): number => 123,
      },
    },
    typeDefs: [
      ...yourTypeDefs,
      ...auth.getTypeDefs(),
      ...hasPermissions.getTypeDefs(),
    ],
  }),
);

type Context = ReturnType<typeof auth.createDirectiveContext> &
  ReturnType<typeof hasPermissions.createDirectiveContext>;

const server = new ApolloServer({
  schema,
});

startStandaloneServer(server, {
  context: async (expressContext): Promise<Context> => {
    // This example allows for state to be passed in the headers:
    //  - authorization: any value results in authenticated
    //  - permissions: json-serialized array of strings or null
    //
    // However to make it easier to test using the built-in playground
    // one can use the mutations to set state:
    //  - setAuthenticated(isAuthenticated: Boolean)
    //  - setPermissions(permissions: [String!])

    if (state.isAuthenticated === null) {
      const { authorization } = expressContext.req.headers;
      state.isAuthenticated = !!authorization;
    }
    if (state.grantedPermissions === null) {
      const { permissions } = expressContext.req.headers;
      state.grantedPermissions = permissions
        ? JSON.parse(Array.isArray(permissions) ? permissions[0] : permissions)
        : null;
    }
    return {
      ...auth.createDirectiveContext({
        isAuthenticated: state.isAuthenticated,
      }),
      ...hasPermissions.createDirectiveContext({
        grantedPermissions: state.grantedPermissions || undefined,
      }),
    };
  },
  listen: { port: 4000 },
}).then(({ url }) => {
  // eslint-disable-next-line no-console
  console.log(`🚀 Server ready at ${url}`);
});
