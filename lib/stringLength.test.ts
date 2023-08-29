import type { GraphQLSchema } from 'graphql';
import gql from 'graphql-tag';
import { makeExecutableSchema } from '@graphql-tools/schema';

import StringLength from './stringLength';
import capitalize from './capitalize';

import type { CreateSchemaConfig, ExpectedTestResult } from './test-utils.test';
import {
  testEasyDirective,
  validationDirectivePolicyArgs,
} from './test-utils.test';
import ValidationError from './errors/ValidationError';

type RootValue = {
  arrayTest?: (string | null)[] | null;
  test?: string | null;
};

const createSchema = ({
  name,
  testCase: { directiveArgs },
}: CreateSchemaConfig<RootValue>): GraphQLSchema =>
  new StringLength().applyToSchema(
    makeExecutableSchema({
      typeDefs: [
        ...StringLength.getTypeDefs(name, undefined, true, true),
        gql`
                type Query {
                  test: String @${name}${directiveArgs}
                  arrayTest: [String] @${name}${directiveArgs}
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

const name = 'stringLength';

testEasyDirective({
  createSchema,
  DirectiveVisitor: StringLength,
  expectedArgsTypeDefs: `\
(
  """
  The maximum string length (inclusive) to allow. If null, no upper limit is applied
  """
  max: Float = null
  """
  The minimum string length (inclusive) to allow. If null, no lower limit is applied
  """
  min: Float = null
  ${validationDirectivePolicyArgs(capitalize(name))}
)`,
  name,
  testCases: [
    {
      directiveArgs: '(min: 1, max: 3)',
      operation: '{ test }',
      tests: [
        { rootValue: { test: 'ab' } },
        { rootValue: { test: 'a' } },
        { rootValue: { test: 'abc' } },
        {
          expected: expectedValidationError('String Length is Less than 1'),
          rootValue: { test: '' },
        },
        {
          expected: expectedValidationError('String Length is More than 3'),
          rootValue: { test: 'abcd' },
        },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '(min: 1)',
      operation: '{ test }',
      tests: [
        { rootValue: { test: 'ab' } },
        { rootValue: { test: 'a' } },
        { rootValue: { test: 'abc' } },
        {
          expected: expectedValidationError('String Length is Less than 1'),
          rootValue: { test: '' },
        },
        { rootValue: { test: 'abcd' } },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '(max: 3)',
      operation: '{ test }',
      tests: [
        { rootValue: { test: 'ab' } },
        { rootValue: { test: 'a' } },
        { rootValue: { test: 'abc' } },
        { rootValue: { test: '' } },
        {
          expected: expectedValidationError('String Length is More than 3'),
          rootValue: { test: 'abcd' },
        },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '',
      operation: '{ test }',
      tests: [
        { rootValue: { test: 'ab' } },
        { rootValue: { test: 'a' } },
        { rootValue: { test: 'abc' } },
        { rootValue: { test: '' } },
        { rootValue: { test: 'abcd' } },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '(min: 100, max: 0)',
      error: new RangeError('@stringLength(max) must be at least equal to min'),
    },
    {
      directiveArgs: '(min: -1, max: 1)',
      error: new RangeError('@stringLength(min) must be at least 0'),
    },
    {
      directiveArgs: '(min: -1)',
      error: new RangeError('@stringLength(min) must be at least 0'),
    },
    {
      directiveArgs: '(max: -1)',
      error: new RangeError('@stringLength(max) must be at least 0'),
    },
    {
      // arrays should work the same, just repeat for min+max
      directiveArgs: '(min: 1, max: 3)',
      operation: '{ arrayTest }',
      tests: [
        { rootValue: { arrayTest: ['ab'] } },
        { rootValue: { arrayTest: ['a'] } },
        { rootValue: { arrayTest: ['abc'] } },
        {
          expected: expectedValidationError(
            'String Length is Less than 1',
            'arrayTest',
          ),
          rootValue: { arrayTest: [''] },
        },
        {
          expected: expectedValidationError(
            'String Length is More than 3',
            'arrayTest',
          ),
          rootValue: { arrayTest: ['abcd'] },
        },
        { rootValue: { arrayTest: [null] } },
        { rootValue: { arrayTest: null } },
      ],
    },
  ],
});
