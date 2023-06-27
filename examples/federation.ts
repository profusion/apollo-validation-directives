import type {
  GraphQLSchema,
  DocumentNode,
  GraphQLFieldResolver,
} from 'graphql';
import { ApolloServer, gql } from 'apollo-server';
import { ApolloGateway } from '@apollo/gateway';
import { buildFederatedSchema } from '@apollo/federation';
import type { GraphQLResolverMap } from 'apollo-graphql';
import { SchemaDirectiveVisitor } from 'graphql-tools';

import { ValidateDirectiveVisitor, range, stringLength } from '../lib';

/*
  When using apollo federation all
  directives should be available to all
  federated nodes.
*/
const directives = {
  range,
  stringLength,
};

const buildSchema = (
  resolvers: GraphQLResolverMap<{}>,
  typeDefs: DocumentNode,
): GraphQLSchema => {
  const finalTypeDefs = [
    typeDefs,
    ...ValidateDirectiveVisitor.getMissingCommonTypeDefs(),
    ...Object.values(directives).reduce<DocumentNode[]>(
      (acc, d) => acc.concat(d.getTypeDefs()),
      [],
    ),
  ];
  const schema = buildFederatedSchema({ resolvers, typeDefs: finalTypeDefs });
  SchemaDirectiveVisitor.visitSchemaDirectives(schema, directives);
  ValidateDirectiveVisitor.addValidationResolversToSchema(schema);
  return schema;
};

interface ServicesSetup {
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
    services.map(({ resolvers, typeDefs, port }) =>
      new ApolloServer({
        schema: buildSchema(resolvers, typeDefs),
      }).listen({ port }),
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
    engine: false,
    gateway: apolloGateway,
    subscriptions: false,
  });

  const { url } = await server.listen();
  // eslint-disable-next-line no-console
  console.log(`🚀  Server ready at ${url}`);
};

// eslint-disable-next-line no-console
start().catch(console.error);
