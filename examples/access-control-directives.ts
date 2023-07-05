import { ApolloServer } from 'apollo-server';
import type { ExpressContext } from 'apollo-server-express';
import { makeExecutableSchema } from '@graphql-tools/schema';
import gql from 'graphql-tag';

import type { MissingPermissionsResolverInfo } from '../lib';
import { v3Auth, v3HasPermissions } from '../lib';

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

const schema = makeExecutableSchema({
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
      authenticated: (): boolean => true,
      handleMissingPermissions: (
        _,
        __,
        ___,
        { missingPermissions }: MissingPermissionsResolverInfo,
      ): string[] | null => missingPermissions || null,
      throwIfMissingPermissions: (): number => 123,
    },
  },
  schemaDirectives: {
    v3Auth,
    v3HasPermissions,
  },
  typeDefs: [
    ...yourTypeDefs,
    ...v3Auth.getTypeDefs(),
    ...v3HasPermissions.getTypeDefs(),
  ],
});

type Context = ReturnType<typeof v3Auth.createDirectiveContext> &
  ReturnType<typeof v3HasPermissions.createDirectiveContext>;

const server = new ApolloServer({
  context: (expressContext: ExpressContext): Context => {
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
      ...v3Auth.createDirectiveContext({
        isAuthenticated: state.isAuthenticated,
      }),
      ...v3HasPermissions.createDirectiveContext({
        grantedPermissions: state.grantedPermissions || undefined,
      }),
    };
  },
  schema,
});
server.listen().then(({ url }) => {
  // eslint-disable-next-line no-console
  console.log(`🚀 Server ready at ${url}`);
});
