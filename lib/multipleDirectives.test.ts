import { graphql, GraphQLError, type GraphQLSchema } from 'graphql';
import { gql } from 'graphql-tag';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { buildSubgraphSchema } from '@apollo/subgraph';

import range from './range.js';
import trim from './trim.js';
import stringLength from './stringLength.js';
import applyDirectivesToSchema from './utils/applyDirectivesToSchema.js';
import listLength from './listLength.js';
import ValidateDirectiveVisitor from './ValidateDirectiveVisitor.js';
import print from './utils/printer.js';

interface MyType {
  int: number;
  list: number[];
}

const build = (isFederated: boolean): GraphQLSchema => {
  const buildSchema = isFederated ? buildSubgraphSchema : makeExecutableSchema;
  return buildSchema({
    resolvers: {
      Query: {
        myType: (): MyType => ({ int: 2, list: [2] }),
      },
    },
    typeDefs: [
      ...ValidateDirectiveVisitor.getMissingCommonTypeDefs(),
      ...listLength.getTypeDefs(),
      ...range.getTypeDefs(),
      gql`
        type MyType {
          int: Int! @range(min: 20, policy: THROW)
          list: [Int!]! @listLength(min: 1, policy: THROW)
        }
        type Query {
          myType: MyType!
        }
      `,
    ],
  });
};

describe('Multiple Directives', () => {
  it('Should work with buildSubgraphSchema', () => {
    expect(() => build(true)).not.toThrow();
  });
  it('Should work with makeExecutableSchema', () => {
    expect(() => build(false)).not.toThrow();
  });

  describe('execution order over the same field', () => {
    it('should call directives in the order they are mapped', async () => {
      const baseSchema = makeExecutableSchema({
        resolvers: {
          Query: {
            item: (_, { arg }): string => arg,
          },
        },
        typeDefs: [
          ...trim.getTypeDefs(),
          ...stringLength.getTypeDefs(),
          gql`
            type Query {
              item(arg: String!): String! @stringLength(max: 5) @trim
            }
          `,
        ],
      });
      const trimFirstSchema = applyDirectivesToSchema(
        // trim directive will be called first, then stringLength, does not matter the order defined in the schema
        [trim, stringLength],
        baseSchema,
      );
      // arg value has a string length greater than allowed by stringLength directive
      // but, if trimmed, it will be less than 5 chars
      const source = print(gql`
        {
          item(arg: "  1234  ")
        }
      `);
      // since trim is called first, the string will be first trimmed to "1234" and then stringLength will not throw
      let result = await graphql({
        contextValue: {},
        schema: trimFirstSchema,
        source,
      });

      expect(result).toEqual({
        data: {
          item: '1234',
        },
      });

      const stringLengthFirstSchema = applyDirectivesToSchema(
        [stringLength, trim],
        baseSchema,
      );

      // stringLength is called before trim(), so the stringLength validation should throw
      result = await graphql({
        contextValue: {},
        schema: stringLengthFirstSchema,
        source,
      });
      expect(result).toEqual({
        data: null,
        errors: [new GraphQLError('String Length is More than 5')],
      });
    });
  });
});
