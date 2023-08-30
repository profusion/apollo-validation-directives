import { graphql, GraphQLBoolean, GraphQLObjectType } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { gql } from 'graphql-tag';

import createValidateDirectiveVisitor from './createValidateDirectiveVisitor.js';
import ValidateDirectiveVisitor from './ValidateDirectiveVisitor.js';

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
    const Directive = createValidateDirectiveVisitor({
      createValidate,
      defaultName,
    });
    const schema = new Directive().applyToSchema(
      makeExecutableSchema({
        typeDefs: [
          ...Directive.getTypeDefs(),
          gql`
          type Query {
            item: Int @${defaultName}
            list: [Int] @${defaultName}
          }
        `,
        ],
      }),
    );
    const rootValue = { item: 2, list: [3, 4] };

    expect(Directive.name).toBe('TestDirectiveDirectiveVisitor');
    expect(Directive.defaultName).toBe(defaultName);
    expect(Directive.commonTypes).toBe(ValidateDirectiveVisitor.commonTypes);
    expect(Directive.config).toBe(ValidateDirectiveVisitor.config);

    const result = await graphql({
      rootValue,
      schema,
      source: '{ item list }',
    });
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
    const Directive = createValidateDirectiveVisitor({
      createValidate,
      defaultName,
      directiveConfig,
      extraCommonTypes,
      isValidateArrayOrValue: false,
    });
    const schema = new Directive().applyToSchema(
      makeExecutableSchema({
        typeDefs: [
          ...Directive.getTypeDefs(),
          gql`
          type Query {
            item: Int @${defaultName}(arg: true)
            list: [Int] @${defaultName}(arg: true)
          }
        `,
        ],
      }),
    );
    const rootValue = { item: 2, list: [3, 4] };

    expect(Directive.name).toBe('TestDirectiveDirectiveVisitor');
    expect(Directive.defaultName).toBe(defaultName);
    expect(Directive.commonTypes).toEqual([
      ...ValidateDirectiveVisitor.commonTypes,
      ...extraCommonTypes,
    ]);
    expect(Directive.config).toEqual({
      ...ValidateDirectiveVisitor.config,
      ...directiveConfig,
      args: {
        ...directiveConfig.args,
        ...ValidateDirectiveVisitor.config.args,
      },
    });

    const result = await graphql({
      rootValue,
      schema,
      source: '{ item list }',
    });
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
