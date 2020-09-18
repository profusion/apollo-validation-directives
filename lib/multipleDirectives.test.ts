import { GraphQLSchema } from 'graphql';
import gql from 'graphql-tag';
import { makeExecutableSchema } from 'graphql-tools';
import { buildFederatedSchema } from '@apollo/federation';

import range from './range';
import listLength from './listLength';
import ValidateDirectiveVisitor from './ValidateDirectiveVisitor';

interface MyType {
  int: number;
  list: number[];
}

const build = (isFederated: boolean): GraphQLSchema => {
  const buildSchema = isFederated ? buildFederatedSchema : makeExecutableSchema;
  return ValidateDirectiveVisitor.addValidationResolversToSchema(
    buildSchema({
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
    }),
  );
};

describe('Multiple Directives', () => {
  it('Should work with buildFederatedSchema', () => {
    expect(() => build(true)).not.toThrow();
  });
  it('Should work with makeExecutableSchema', () => {
    expect(() => build(false)).not.toThrow();
  });
});
