import { graphql } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { gql } from 'graphql-tag';

import print from './utils/printer.js';
import type { ToNodeId } from './foreignNodeId.js';
import ForeignNodeId from './foreignNodeId.js';
import {
  validationDirectivePolicyArgs,
  validationDirectionEnumTypeDefs,
} from './test-utils.test.js';
import capitalize from './capitalize.js';
import ValidationError from './errors/ValidationError.js';

describe('@foreignNodeId()', (): void => {
  const toNodeId = (typenane: string, id: string): string =>
    Buffer.from(`${typenane}:${id}`).toString('base64');
  const fromNodeId = (id: string): ReturnType<ToNodeId<string>> => {
    const r = Buffer.from(id, 'base64').toString('ascii').split(':');
    return {
      id: r[1],
      typename: r[0],
    };
  };
  const name = 'foreignNodeId';
  const capitalizedName = capitalize(name);
  const directiveTypeDefs = ForeignNodeId.getTypeDefs(name);

  it('exports correct typeDefs', (): void => {
    expect(directiveTypeDefs.map(print)).toEqual([
      `\
"""Converts a global unique ID to a type ID"""
directive @${name}(
  """The typename that this ID should match"""
  typename: String!
  ${validationDirectivePolicyArgs(capitalizedName)}
) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION
`,
      `\
${validationDirectionEnumTypeDefs(capitalizedName)}
`,
    ]);
  });

  it('defaultName is correct', (): void => {
    expect(directiveTypeDefs.map(print)).toEqual(
      ForeignNodeId.getTypeDefs().map(print),
    );
  });

  it('createDirectiveContext()', (): void => {
    const ctx = ForeignNodeId.createDirectiveContext({
      fromNodeId,
    });
    expect(ctx.fromNodeId).toBe(fromNodeId);
  });

  it('should not work if fromNodeId returns null', async (): Promise<void> => {
    const typename = 'X';
    const schema = new ForeignNodeId().applyToSchema(
      makeExecutableSchema({
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            type Query {
              work(arg: ID! @foreignNodeId(typename: "${typename}")): Boolean
            }
          `,
        ],
      }),
    );
    const source = print(gql`
      query MyQuery($arg: ID!) {
        work(arg: $arg)
      }
    `);
    const variableValues = {
      arg: '1',
    };
    const contextValue = ForeignNodeId.createDirectiveContext({
      fromNodeId: () => null,
    });
    const result = await graphql({
      contextValue,
      schema,
      source,
      variableValues,
    });
    expect(result).toEqual({
      data: { work: null },
      errors: [new ValidationError(`Could not decode ID to ${typename}`)],
    });
  });

  it('should not work on non string types', async (): Promise<void> => {
    const schema = new ForeignNodeId().applyToSchema(
      makeExecutableSchema({
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            input Input1 {
              typeId: Int! @foreignNodeId(typename: "A")
            }
            type Query {
              work(input: Input1!): Boolean
            }
          `,
        ],
      }),
    );
    const source = print(gql`
      query MyQuery($input: Input1!) {
        work(input: $input)
      }
    `);
    const variableValues = {
      input: {
        typeId: 1,
      },
    };
    const contextValue = ForeignNodeId.createDirectiveContext({
      fromNodeId,
    });
    const result = await graphql({
      contextValue,
      schema,
      source,
      variableValues,
    });
    expect(result).toEqual({
      data: { work: null },
      errors: [
        new ValidationError('foreignNodeId directive only works on strings'),
      ],
    });
  });

  it('typename does not match', async (): Promise<void> => {
    const wrongName = 'wrong';
    const typename = 'typename';
    const schema = new ForeignNodeId().applyToSchema(
      makeExecutableSchema({
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            type Query {
              work(arg: ID! @foreignNodeId(typename: "${typename}")): Boolean
            }
          `,
        ],
      }),
    );
    const source = print(gql`
      query MyQuery($arg: ID!) {
        work(arg: $arg)
      }
    `);
    const variableValues = {
      arg: toNodeId(wrongName, '1'),
    };
    const contextValue = ForeignNodeId.createDirectiveContext({
      fromNodeId,
    });
    const result = await graphql({
      contextValue,
      schema,
      source,
      variableValues,
    });
    expect(result).toEqual({
      data: { work: null },
      errors: [
        new ValidationError(
          `Converted ID typename does not match. Expected: ${typename}`,
        ),
      ],
    });
  });

  it('correctly convert types', async (): Promise<void> => {
    const idsMap = [
      { id: 'bbb', typeName: 'Type1' },
      { id: 'id2', typeName: 'Type2' },
      { id: 'id3', typeName: 'Type3' },
      { id: 'id4', typeName: 'Type4' },
      { id: 'aaaaa', typeName: 'Type5' },
    ];
    const schema = new ForeignNodeId().applyToSchema(
      makeExecutableSchema({
        resolvers: {
          Query: {
            work: (_, { arg, input }) => [
              arg,
              input.typeId,
              input.typeId2,
              input.typeId3,
              input.typeId4,
              input.typeId5,
            ],
          },
        },
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            input Input1 {
              typeId: ID! @foreignNodeId(typename: "${idsMap[1].typeName}")
              typeId2: ID! @foreignNodeId(typename: "${idsMap[2].typeName}")
              typeId3: ID! @foreignNodeId(typename: "${idsMap[3].typeName}")
              typeId4: String! @foreignNodeId(typename: "${idsMap[4].typeName}")
              typeId5: String @foreignNodeId(typename: "${idsMap[4].typeName}")
            }
            type Query {
              work(
                input: Input1!
                arg: ID! @foreignNodeId(typename: "${idsMap[0].typeName}")
              ): [String]!
            }
          `,
        ],
      }),
    );
    const source = print(gql`
      query MyQuery($input: Input1!, $arg: ID!) {
        work(input: $input, arg: $arg)
        secondWork: work(input: $input, arg: $arg)
      }
    `);
    const variableValues = {
      arg: toNodeId(idsMap[0].typeName, idsMap[0].id),
      input: {
        typeId: toNodeId(idsMap[1].typeName, idsMap[1].id),
        typeId2: toNodeId(idsMap[2].typeName, idsMap[2].id),
        typeId3: toNodeId(idsMap[3].typeName, idsMap[3].id),
        typeId4: toNodeId(idsMap[4].typeName, idsMap[4].id),
        typeId5: null,
      },
    };
    const workResult = idsMap
      .map(({ id }) => id as string | null)
      .concat([null]);
    const rootValue = {
      secondWork: workResult,
      work: workResult,
    };

    const contextValue = ForeignNodeId.createDirectiveContext({
      fromNodeId,
    });
    const result = await graphql({
      contextValue,
      rootValue,
      schema,
      source,
      variableValues,
    });
    expect(result).toEqual({ data: rootValue });
  });

  it('should decode arguments in type field argument', async (): Promise<void> => {
    const schema = new ForeignNodeId().applyToSchema(
      makeExecutableSchema({
        resolvers: {
          Query: {},
          TestType: {
            typeIds: (_, { ids }) => {
              return ids;
            },
          },
        },
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            type TestType {
              typeIds(
                ids: [ID!]! @foreignNodeId(typename: "TypeID")
                otherArgs: String
              ): [String!]!
            }
            type Query {
              testType: TestType!
              unusedQuery: TestType!
            }
          `,
        ],
      }),
    );
    const source = print(gql`
      query MyQuery($typeIds: [ID!]!) {
        testType {
          typeIds(ids: $typeIds)
        }
      }
    `);
    const decodedIds = ['123', '345', '678', '910'];
    const encodedIds = decodedIds.map(id => toNodeId('TypeID', id));
    const variableValues = {
      typeIds: encodedIds,
    };
    const rootValue = {
      testType: {},
    };

    const contextValue = ForeignNodeId.createDirectiveContext({
      fromNodeId,
    });
    const spy = jest.spyOn(contextValue, 'fromNodeId');
    const result = await graphql({
      contextValue,
      rootValue,
      schema,
      source,
      variableValues,
    });
    expect(spy).toHaveBeenCalledTimes(encodedIds.length);
    expect(result).toEqual({
      data: {
        testType: {
          typeIds: decodedIds,
        },
      },
    });
  });

  it('should work when used on mutation inputs', async (): Promise<void> => {
    const mockResolver = jest.fn().mockReturnValue('return value');
    const typeName = 'MyType';
    const decodedId = 'abc';
    const encodedId = toNodeId('MyType', decodedId);
    const schema = new ForeignNodeId().applyToSchema(
      makeExecutableSchema({
        resolvers: {
          Mutation: {
            testDirective: mockResolver,
          },
          Query: {
            dummy: () => '',
          },
        },
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            input Input1 {
              typeId: ID! @foreignNodeId(typename: "${typeName}")
            }
            type Query {
              dummy: String
            }
            type Mutation {
              testDirective(input: Input1): String
            }
          `,
        ],
      }),
    );
    const source = print(gql`
      mutation Testing($input: Input1!) {
        testDirective(input: $input)
      }
    `);
    const contextValue = ForeignNodeId.createDirectiveContext({
      fromNodeId,
    });

    await graphql({
      contextValue,
      schema,
      source,
      variableValues: {
        input: {
          typeId: encodedId,
        },
      },
    });
    expect(mockResolver).toHaveBeenCalledTimes(1);
    expect(mockResolver).toHaveBeenCalledWith(
      undefined,
      {
        input: {
          typeId: decodedId,
        },
      },
      contextValue,
      expect.any(Object),
    );
  });

  it('should not duplicate validation when same type is used on Query and Mutation', async () => {
    const mockResolver = jest.fn().mockReturnValue('return value');
    const typeName = 'MyType';
    const decodedId = 'abc';
    const encodedId = toNodeId('MyType', decodedId);
    const schema = new ForeignNodeId().applyToSchema(
      makeExecutableSchema({
        resolvers: {
          Mutation: {
            testDirective: mockResolver,
          },
          Query: {
            dummy: () => '',
          },
        },
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            input Input1 {
              typeId: ID! @foreignNodeId(typename: "${typeName}")
            }
            type Query {
              dummy(input: Input1): String
            }
            type Mutation {
              testDirective(input: Input1): String
              otherMutation(input: Input1): String
            }
          `,
        ],
      }),
    );
    const source = print(gql`
      mutation Testing($input: Input1!) {
        testDirective(input: $input)
      }
    `);
    const contextValue = ForeignNodeId.createDirectiveContext({
      fromNodeId,
    });
    const fromNodeIdSpy = jest.spyOn(contextValue, 'fromNodeId');

    await graphql({
      contextValue,
      schema,
      source,
      variableValues: {
        input: {
          typeId: encodedId,
        },
      },
    });

    expect(fromNodeIdSpy).toHaveBeenCalledTimes(1);
    expect(fromNodeIdSpy).toHaveBeenCalledWith(encodedId);
  });
});
