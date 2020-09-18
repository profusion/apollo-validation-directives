import { graphql } from 'graphql';
import { print } from 'graphql/language/printer';
import { makeExecutableSchema } from 'graphql-tools';
import gql from 'graphql-tag';
import { ValidationError } from 'apollo-server-errors';

import { ValidateFunction } from './ValidateDirectiveVisitor';
import ForeignNodeIdDirective, {
  ForeignNodeIdContext,
  ToNodeId,
} from './foreignNodeId';
import {
  validationDirectivePolicyArgs,
  validationDirectionEnumTypeDefs,
} from './test-utils.test';
import capitalize from './capitalize';

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
  const directiveTypeDefs = ForeignNodeIdDirective.getTypeDefs(name);

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
      ForeignNodeIdDirective.getTypeDefs().map(print),
    );
  });

  it('createDirectiveContext()', (): void => {
    const ctx = ForeignNodeIdDirective.createDirectiveContext({
      fromNodeId,
    });
    expect(ctx.fromNodeId).toBe(fromNodeId);
  });

  it('should not work if fromNodeId returns null', async (): Promise<void> => {
    const typename = 'X';
    const schema = ForeignNodeIdDirective.addValidationResolversToSchema(
      makeExecutableSchema({
        schemaDirectives: {
          foreignNodeId: ForeignNodeIdDirective,
        },
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
    const variables = {
      arg: '1',
    };
    const context = ForeignNodeIdDirective.createDirectiveContext({
      fromNodeId: () => null,
    });
    const result = await graphql(schema, source, null, context, variables);
    expect(result).toEqual({
      data: { work: null },
      errors: [new ValidationError(`Could not decode ID to ${typename}`)],
    });
  });

  it('should not work on non string types', async (): Promise<void> => {
    const schema = ForeignNodeIdDirective.addValidationResolversToSchema(
      makeExecutableSchema({
        schemaDirectives: {
          foreignNodeId: ForeignNodeIdDirective,
        },
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
    const variables = {
      input: {
        typeId: 1,
      },
    };
    const context = ForeignNodeIdDirective.createDirectiveContext({
      fromNodeId,
    });
    const result = await graphql(schema, source, null, context, variables);
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
    const schema = ForeignNodeIdDirective.addValidationResolversToSchema(
      makeExecutableSchema({
        schemaDirectives: {
          foreignNodeId: ForeignNodeIdDirective,
        },
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
    const variables = {
      arg: toNodeId(wrongName, '1'),
    };
    const context = ForeignNodeIdDirective.createDirectiveContext({
      fromNodeId,
    });
    const result = await graphql(schema, source, null, context, variables);
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
    const jestMocks: jest.Mock[] = [];
    class TestDirective extends ForeignNodeIdDirective<
      string,
      ForeignNodeIdContext
    > {
      public getValidationForArgs():
        | ValidateFunction<ForeignNodeIdContext>
        | undefined {
        const func = super.getValidationForArgs();
        if (func) {
          const mock = jest.fn(func);
          jestMocks.push(mock);
          return mock;
        }
        return undefined;
      }
    }
    const schema = TestDirective.addValidationResolversToSchema(
      makeExecutableSchema({
        schemaDirectives: {
          foreignNodeId: TestDirective,
        },
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            input Input1 {
              typeId: ID! @foreignNodeId(typename: "${idsMap[1].typeName}")
              typeId2: ID! @foreignNodeId(typename: "${idsMap[2].typeName}")
              typeId3: ID! @foreignNodeId(typename: "${idsMap[3].typeName}")
              typeId4: String! @foreignNodeId(typename: "${idsMap[4].typeName}")
            }
            type Query {
              work(
                input: Input1!
                arg: ID! @foreignNodeId(typename: "${idsMap[0].typeName}")
              ): Boolean
            }
          `,
        ],
      }),
    );
    const source = print(gql`
      query MyQuery($input: Input1!, $arg: ID!) {
        work(input: $input, arg: $arg)
      }
    `);
    const variables = {
      arg: toNodeId(idsMap[0].typeName, idsMap[0].id),
      input: {
        typeId: toNodeId(idsMap[1].typeName, idsMap[1].id),
        typeId2: toNodeId(idsMap[2].typeName, idsMap[2].id),
        typeId3: toNodeId(idsMap[3].typeName, idsMap[3].id),
        typeId4: toNodeId(idsMap[4].typeName, idsMap[4].id),
      },
    };
    const rootValue = {
      work: true,
    };

    const context = ForeignNodeIdDirective.createDirectiveContext({
      fromNodeId,
    });
    const result = await graphql(schema, source, rootValue, context, variables);
    expect(result).toEqual({ data: rootValue });
    jestMocks.forEach(({ mock: { results } }, i): void => {
      expect(results[0].value).toEqual(idsMap[i].id);
    });
  });
});
