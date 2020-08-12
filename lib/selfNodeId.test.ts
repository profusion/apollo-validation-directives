import { graphql } from 'graphql';
import { print } from 'graphql/language/printer';
import { gql, makeExecutableSchema } from 'apollo-server';
import { ValidationError } from 'apollo-server-errors';

import SelfNodeId from './selfNodeId';

const toNodeId = (name: string, id: string): string =>
  Buffer.from(`${name}:${id}`).toString('base64');

describe('@selfNodeId()', (): void => {
  const name = 'selfNodeId';
  const directiveTypeDefs = SelfNodeId.getTypeDefs(name);

  it('exports correct typeDefs', (): void => {
    expect(directiveTypeDefs.map(print)).toEqual([
      `\
"""ensures that the ID is converted to a global ID"""
directive @${name} on FIELD_DEFINITION | OBJECT
`,
    ]);
  });

  it('defaultName is correct', (): void => {
    expect(directiveTypeDefs.map(print)).toEqual(
      SelfNodeId.getTypeDefs().map(print),
    );
  });

  describe('createDirectiveContext()', (): void => {
    it('supports function', (): void => {
      const ctx = SelfNodeId.createDirectiveContext({
        toNodeId,
      });
      expect(ctx.toNodeId).toBe(toNodeId);
    });
  });

  describe('fails on object definition', (): void => {
    it('ID field not provided', async (): Promise<void> => {
      expect.assertions(1);
      const typeName = 'TypeWithNoId';
      expect(() =>
        SelfNodeId.addValidationResolversToSchema(
          makeExecutableSchema({
            schemaDirectives: {
              selfNodeId: SelfNodeId,
            },
            typeDefs: [
              ...directiveTypeDefs,
              gql`
                type ${typeName} @selfNodeId {
                  field: ID!
                  anotherField: Float
                }
                type Query {
                  test: ${typeName}
                }
              `,
            ],
          }),
        ),
      ).toThrow(new ValidationError(`id field was not found in ${typeName}`));
    });
  });

  describe('works on field and object definitions', (): void => {
    const type1 = 'Type1';
    const type2 = 'Type2';
    const type4 = 'Type4';
    const type1Id = 'ThisIsAnId';
    const type2Id = 'ThisIsAnotherId';
    const type4Id = 'type4Id';
    const schema = SelfNodeId.addValidationResolversToSchema(
      makeExecutableSchema({
        schemaDirectives: {
          selfNodeId: SelfNodeId,
        },
        typeDefs: [
          ...directiveTypeDefs,
          gql`
          type ${type1} {
            id: ID! @selfNodeId
          }
          type ${type2} {
            id: ID! @selfNodeId
          }
          type Type3 {
            id: ID!
          }
          type TypeNullable {
            id: ID @selfNodeId # test nullable
          }
          type ${type4} @selfNodeId {
            id: ID!
            anotherField: Float!
            yetAnotherField: String!
          }
          type ShouldFail {
            float: Float @selfNodeId
            array: [String] @selfNodeId
          }
          type Test {
            type1: ${type1}
            type2: ${type2}
            type3: Type3
            type4: ${type4}
            typeNullable: TypeNullable
            shouldFail: ShouldFail
          }
          type Query {
            test: Test
          }
        `,
        ],
      }),
    );
    const source = print(gql`
      query {
        test {
          type1 {
            id
          }
          type2 {
            id
          }
          type3 {
            id
          }
          type4 {
            id
            anotherField
            yetAnotherField
          }
          typeNullable {
            id
          }
          shouldFail {
            float
            array
          }
        }
      }
    `);
    const rootValue = {
      test: {
        shouldFail: {
          array: ['1', '2'],
          float: 2.3,
        },
        type1: {
          id: type1Id,
        },
        type2: {
          id: type2Id,
        },
        type3: {
          id: '2',
        },
        type4: {
          anotherField: 5.2,
          id: type4Id,
          yetAnotherField: 'asd',
        },
        typeNullable: {
          id: null,
        },
      },
    };

    it('Correctly converts to node ID', async (): Promise<void> => {
      const context = SelfNodeId.createDirectiveContext({
        toNodeId,
      });
      const result = await graphql(schema, source, rootValue, context);
      expect(result).toEqual({
        data: {
          test: {
            shouldFail: {
              array: null,
              float: null,
            },
            type1: {
              id: toNodeId(type1, type1Id),
            },
            type2: {
              id: toNodeId(type2, type2Id),
            },
            type3: {
              id: rootValue.test.type3.id,
            },
            type4: {
              anotherField: rootValue.test.type4.anotherField,
              id: toNodeId(type4, type4Id),
              yetAnotherField: rootValue.test.type4.yetAnotherField,
            },
            typeNullable: {
              id: null,
            },
          },
        },
        errors: [
          new ValidationError('selfNodeId directive only works on strings'),
          new ValidationError('selfNodeId directive only works on strings'),
        ],
      });
    });

    it('Correctly converts to node ID', async (): Promise<void> => {
      const context = SelfNodeId.createDirectiveContext({
        toNodeId: () => null,
      });
      const result = await graphql(schema, source, rootValue, context);
      expect(result).toEqual({
        data: {
          test: {
            shouldFail: {
              array: null,
              float: null,
            },
            type1: null,
            type2: null,
            type3: {
              id: '2',
            },
            type4: null,
            typeNullable: {
              id: null,
            },
          },
        },
        errors: [
          new ValidationError('selfNodeId directive only works on strings'),
          new ValidationError('selfNodeId directive only works on strings'),
          new ValidationError(`Could not encode ID to typename ${type1}`),
          new ValidationError(`Could not encode ID to typename ${type2}`),
          new ValidationError(`Could not encode ID to typename ${type4}`),
        ],
      });
    });
  });
});
