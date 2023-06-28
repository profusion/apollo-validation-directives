import { graphql, GraphQLBoolean, GraphQLObjectType } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import gql from 'graphql-tag';

import createValidateDirectiveVisitor from './createValidateDirectiveVisitor';
import ValidateDirectiveVisitor from './ValidateDirectiveVisitor';

describe('createValidateDirectiveVisitor', (): void => {
  const validate = jest.fn((x: unknown): unknown =>
    typeof x === 'number' ? x * 2 : x,
  );
  const createValidate = jest.fn(() => validate);
  const defaultName = 'testDirective';

  beforeEach((): void => {
    validate.mockClear();
    createValidate.mockClear();
  });

  it('defaults work', async (): Promise<void> => {
    const directive = createValidateDirectiveVisitor({
      createValidate,
      defaultName,
    });
    const schema = makeExecutableSchema({
      schemaDirectives: {
        [defaultName]: directive,
      },
      typeDefs: [
        ...directive.getTypeDefs(),
        gql`
        type Query {
          item: Int @${defaultName}
          list: [Int] @${defaultName}
        }
      `,
      ],
    });
    const rootValue = { item: 2, list: [3, 4] };

    expect(directive.name).toBe('TestDirectiveDirectiveVisitor');
    expect(directive.defaultName).toBe(defaultName);
    expect(directive.commonTypes).toBe(ValidateDirectiveVisitor.commonTypes);
    expect(directive.config).toBe(ValidateDirectiveVisitor.config);

    const result = await graphql(schema, '{ item list }', rootValue);
    expect(result).toEqual({
      data: {
        item: rootValue.item * 2,
        list: rootValue.list.map(x => x * 2),
      },
    });
    expect(validate).toBeCalledTimes(3);
    expect(createValidate).toBeCalledTimes(2);
  });

  it('custom', async (): Promise<void> => {
    const extraCommonTypes = [
      new GraphQLObjectType({
        fields: {
          field: { type: GraphQLBoolean },
        },
        name: 'CustomObject',
      }),
    ];
    const directiveConfig = {
      args: {
        arg: { type: GraphQLBoolean },
      },
    };
    const directive = createValidateDirectiveVisitor({
      createValidate,
      defaultName,
      directiveConfig,
      extraCommonTypes,
      isValidateArrayOrValue: false,
    });
    const schema = makeExecutableSchema({
      schemaDirectives: {
        [defaultName]: directive,
      },
      typeDefs: [
        ...directive.getTypeDefs(),
        gql`
        type Query {
          item: Int @${defaultName}(arg: true)
          list: [Int] @${defaultName}(arg: true)
        }
      `,
      ],
    });
    const rootValue = { item: 2, list: [3, 4] };

    expect(directive.name).toBe('TestDirectiveDirectiveVisitor');
    expect(directive.defaultName).toBe(defaultName);
    expect(directive.commonTypes).toEqual([
      ...ValidateDirectiveVisitor.commonTypes,
      ...extraCommonTypes,
    ]);
    expect(directive.config).toEqual({
      ...ValidateDirectiveVisitor.config,
      ...directiveConfig,
      args: {
        ...directiveConfig.args,
        ...ValidateDirectiveVisitor.config.args,
      },
    });

    const result = await graphql(schema, '{ item list }', rootValue);
    expect(result).toEqual({
      data: {
        item: rootValue.item * 2,
        list: rootValue.list,
      },
    });
    expect(validate).toBeCalledTimes(2);
    expect(createValidate).toBeCalledTimes(2);
  });
});
