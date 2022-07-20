import type { GraphQLSchema } from 'graphql';
import gql from 'graphql-tag';
import { makeExecutableSchema } from 'graphql-tools';
import { ValidationError } from 'apollo-server-errors';

import range from './range';
import capitalize from './capitalize';

import type { CreateSchemaConfig, ExpectedTestResult } from './test-utils.test';
import {
  testEasyDirective,
  validationDirectivePolicyArgs,
} from './test-utils.test';

type RootValue = {
  arrayTest?: (number | null)[] | null;
  test?: number | null;
};

const createSchema = ({
  name,
  testCase: { directiveArgs },
}: CreateSchemaConfig<RootValue>): GraphQLSchema =>
  range.addValidationResolversToSchema(
    makeExecutableSchema({
      schemaDirectives: { [name]: range },
      typeDefs: [
        ...range.getTypeDefs(name, undefined, true, true),
        gql`
                type Query {
                  test: Int @${name}${directiveArgs}
                  arrayTest: [Int] @${name}${directiveArgs}
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

const name = 'range';

testEasyDirective({
  createSchema,
  DirectiveVisitor: range,
  expectedArgsTypeDefs: `\
(
  """The maximum value (inclusive) to allow. If null, no upper limit is applied"""
  max: Float = null
  """The minimum value (inclusive) to allow. If null, no lower limit is applied"""
  min: Float = null
  ${validationDirectivePolicyArgs(capitalize(name))}
)`,
  name,
  testCases: [
    {
      directiveArgs: '(min: 0, max: 100)',
      operation: '{ test }',
      tests: [
        { rootValue: { test: 50 } },
        { rootValue: { test: 0 } },
        { rootValue: { test: 100 } },
        {
          expected: expectedValidationError('Less than 0'),
          rootValue: { test: -1 },
        },
        {
          expected: expectedValidationError('More than 100'),
          rootValue: { test: 101 },
        },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '(min: 0)',
      operation: '{ test }',
      tests: [
        { rootValue: { test: 50 } },
        { rootValue: { test: 0 } },
        { rootValue: { test: 100 } },
        {
          expected: expectedValidationError('Less than 0'),
          rootValue: { test: -1 },
        },
        { rootValue: { test: 101 } },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '(max: 100)',
      operation: '{ test }',
      tests: [
        { rootValue: { test: 50 } },
        { rootValue: { test: 0 } },
        { rootValue: { test: 100 } },
        { rootValue: { test: -1 } },
        {
          expected: expectedValidationError('More than 100'),
          rootValue: { test: 101 },
        },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '',
      operation: '{ test }',
      tests: [
        { rootValue: { test: 50 } },
        { rootValue: { test: 0 } },
        { rootValue: { test: 100 } },
        { rootValue: { test: -1 } },
        { rootValue: { test: 101 } },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '(min: 100, max: 0)',
      error: new RangeError('@range(max) must be at least equal to min'),
    },
    {
      // arrays should work the same, just repeat for min+max
      directiveArgs: '(min: 0, max: 100)',
      operation: '{ arrayTest }',
      tests: [
        { rootValue: { arrayTest: [50] } },
        { rootValue: { arrayTest: [0] } },
        { rootValue: { arrayTest: [100] } },
        {
          expected: expectedValidationError('Less than 0', 'arrayTest'),
          rootValue: { arrayTest: [-1] },
        },
        {
          expected: expectedValidationError('More than 100', 'arrayTest'),
          rootValue: { arrayTest: [101] },
        },
        { rootValue: { arrayTest: [null] } },
        { rootValue: { arrayTest: null } },
      ],
    },
  ],
});
