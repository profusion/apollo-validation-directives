import { makeExecutableSchema, ApolloServer } from 'apollo-server';
import gql from 'graphql-tag';

import { auth, hasPermissions } from '../lib';

const yourTypeDefs = [
  gql`
    type Query {
      authenticated: Boolean @auth
      throwIfMissingPermissions: Int @hasPermissions(permissions: ["x", "y"])
      handleMissingPermissions(
        # the following argument is injected by @hasPermissions():
        missingPermissions: [String!] = null
      ): [String!] @hasPermissions(permissions: ["x", "y"], policy: RESOLVER)
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
      handleMissingPermissions: (_, { missingPermissions }): string[] | null =>
        missingPermissions,
      throwIfMissingPermissions: (): number => 123,
    },
  },
  schemaDirectives: { auth, hasPermissions },
  typeDefs: [
    ...yourTypeDefs,
    ...auth.getTypeDefs(),
    ...hasPermissions.getTypeDefs(),
  ],
});

type Context = ReturnType<typeof auth.createDirectiveContext> &
  ReturnType<typeof hasPermissions.createDirectiveContext>;

const server = new ApolloServer({
  context: (expressContext): Context => {
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
  schema,
});
server.listen().then(({ url }) => {
  // eslint-disable-next-line no-console
  console.log(`🚀 Server ready at ${url}`);
});
