import type {
  GraphQLSchema,
  DocumentNode,
  GraphQLFieldResolver,
} from 'graphql';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { ApolloGateway } from '@apollo/gateway';
import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';
import type { GraphQLResolverMap } from '@apollo/subgraph/dist/schema-helper';

import {
  ValidateDirectiveVisitor,
  range,
  stringLength,
  applyDirectivesToSchema,
} from '../lib';

/*
  When using apollo federation all
  directives should be available to all
  federated nodes.
*/

type Directive = typeof range;

const buildSchema = (
  resolvers: GraphQLResolverMap<{}>,
  typeDefs: DocumentNode,
  directives: Directive[],
): GraphQLSchema => {
  const finalTypeDefs = [
    typeDefs,
    ...ValidateDirectiveVisitor.getMissingCommonTypeDefs(),
    ...directives.reduce<DocumentNode[]>(
      (acc, d) => acc.concat(d.getTypeDefs()),
      [],
    ),
  ];
  const schema = applyDirectivesToSchema(
    directives,
    buildSubgraphSchema({
      resolvers: resolvers as GraphQLResolverMap<unknown>,
      typeDefs: finalTypeDefs,
    }),
  );
  return schema;
};

interface ServicesSetup {
  directives: Directive[];
  port: number;
  resolvers: {
    [typeName: string]: {
      [fieldName: string]: GraphQLFieldResolver<unknown, {}>;
    };
  };
  typeDefs: DocumentNode;
}

const services: ServicesSetup[] = [
  {
    directives: [range],
    port: 4001,
    resolvers: {
      Query: {
        myNumber: (_: unknown, { args }): number => args,
      },
    },
    typeDefs: gql`
      type Query {
        myNumber(args: Int @range(max: 100, policy: THROW)): Int
          @range(min: 2, policy: THROW)
      }
    `,
  },
  {
    directives: [stringLength],
    port: 4002,
    resolvers: {
      Query: {
        myString: (_: unknown, { args }): string => args,
      },
    },
    typeDefs: gql`
      type Query {
        myString(args: String @stringLength(max: 200, policy: THROW)): String
          @stringLength(min: 3, policy: THROW)
      }
    `,
  },
];

const start = async (): Promise<void> => {
  const runningString = await Promise.all(
    services.map(({ resolvers, typeDefs, port, directives }) =>
      startStandaloneServer(
        new ApolloServer({
          schema: buildSchema(resolvers, typeDefs, directives),
        }),
        { listen: { port } },
      ),
    ),
  );
  // eslint-disable-next-line no-console
  console.log(runningString.map(({ url }) => url).join('\n'));
  const apolloGateway = new ApolloGateway({
    serviceList: [
      {
        name: 'string-service',
        url: 'http://localhost:4002',
      },
      {
        name: 'number-service',
        url: 'http://localhost:4001',
      },
    ],
  });
  const server = new ApolloServer({
    gateway: apolloGateway,
  });

  const { url } = await startStandaloneServer(server);
  // eslint-disable-next-line no-console
  console.log(`🚀  Server ready at ${url}`);
};

// eslint-disable-next-line no-console
start().catch(console.error);
