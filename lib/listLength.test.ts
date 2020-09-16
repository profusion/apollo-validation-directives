import { GraphQLSchema } from 'graphql';
import gql from 'graphql-tag';
import { makeExecutableSchema } from 'graphql-tools';
import { ValidationError } from 'apollo-server-errors';

import listLength from './listLength';

import {
  CreateSchemaConfig,
  ExpectedTestResult,
  testEasyDirective,
  validationDirectivePolicyArgs,
} from './test-utils.test';

type RootValue = {
  test?: (string | null)[] | null;
  stringTest?: string | null;
};

const createSchema = ({
  name,
  testCase: { directiveArgs },
}: CreateSchemaConfig<RootValue>): GraphQLSchema =>
  listLength.addValidationResolversToSchema(
    makeExecutableSchema({
      schemaDirectives: { [name]: listLength },
      typeDefs: [
        ...listLength.getTypeDefs(name, undefined, true, true),
        gql`
                type Query {
                  test: [String] @${name}${directiveArgs}
                  stringTest: String @${name}${directiveArgs}
                }
              `,
      ],
    }),
  );

const expectedValidationError = (
  message: string,
  key: keyof RootValue = 'test',
): ExpectedTestResult<RootValue> => ({
  data: { [key]: null },
  errors: [new ValidationError(message)],
});

testEasyDirective({
  createSchema,
  DirectiveVisitor: listLength,
  expectedArgsTypeDefs: `\
(
  """The maximum list length (inclusive) to allow. If null, no upper limit is applied"""
  max: Float = null
  """The minimum list length (inclusive) to allow. If null, no lower limit is applied"""
  min: Float = null
  ${validationDirectivePolicyArgs}
)`,
  name: 'listLength',
  testCases: [
    {
      directiveArgs: '(min: 1, max: 3)',
      operation: '{ test }',
      tests: [
        { rootValue: { test: ['a', 'b'] } },
        { rootValue: { test: ['a'] } },
        { rootValue: { test: ['a', 'b', 'c'] } },
        {
          expected: expectedValidationError('List Length is Less than 1'),
          rootValue: { test: [] },
        },
        {
          expected: expectedValidationError('List Length is More than 3'),
          rootValue: { test: ['a', 'b', 'c', 'd'] },
        },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '(min: 1)',
      operation: '{ test }',
      tests: [
        { rootValue: { test: ['a', 'b'] } },
        { rootValue: { test: ['a'] } },
        { rootValue: { test: ['a', 'b', 'c'] } },
        {
          expected: expectedValidationError('List Length is Less than 1'),
          rootValue: { test: [] },
        },
        { rootValue: { test: ['a', 'b', 'c', 'd'] } },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '(max: 3)',
      operation: '{ test }',
      tests: [
        { rootValue: { test: ['a', 'b'] } },
        { rootValue: { test: ['a'] } },
        { rootValue: { test: ['a', 'b', 'c'] } },
        { rootValue: { test: [] } },
        {
          expected: expectedValidationError('List Length is More than 3'),
          rootValue: { test: ['a', 'b', 'c', 'd'] },
        },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '',
      operation: '{ test }',
      tests: [
        { rootValue: { test: ['a', 'b'] } },
        { rootValue: { test: ['a'] } },
        { rootValue: { test: ['a', 'b', 'c'] } },
        { rootValue: { test: [] } },
        { rootValue: { test: ['a', 'b', 'c', 'd'] } },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '(min: 100, max: 0)',
      error: new RangeError('@listLength(max) must be at least equal to min'),
    },
    {
      directiveArgs: '(min: -1, max: 1)',
      error: new RangeError('@listLength(min) must be at least 0'),
    },
    {
      directiveArgs: '(min: -1)',
      error: new RangeError('@listLength(min) must be at least 0'),
    },
    {
      directiveArgs: '(max: -1)',
      error: new RangeError('@listLength(max) must be at least 0'),
    },
    {
      // strings are ignored
      directiveArgs: '(min: 1, max: 3)',
      operation: '{ stringTest }',
      tests: [
        { rootValue: { stringTest: 'ab' } },
        { rootValue: { stringTest: 'a' } },
        { rootValue: { stringTest: 'abc' } },
        { rootValue: { stringTest: '' } },
        { rootValue: { stringTest: 'abcd' } },
      ],
    },
  ],
});
