import type { GraphQLSchema } from 'graphql';
import { gql } from 'graphql-tag';
import { makeExecutableSchema } from '@graphql-tools/schema';

import type { IResolvers } from '@graphql-tools/utils';

import Pattern from './pattern.js';
import capitalize from './capitalize.js';

import type {
  CreateSchemaConfig,
  ExpectedTestResult,
} from './test-utils.test.js';
import {
  testEasyDirective,
  validationDirectivePolicyArgs,
} from './test-utils.test.js';
import ValidationError from './errors/ValidationError.js';

type RootValue = {
  arrayTest?: (string | null)[] | null;
  test?: string | null;
  number?: number;
  bool?: boolean;
  obj?: { toString(): string };
};

type ResultValue = Omit<RootValue, 'obj'> & {
  obj?: { toString: string };
};

const createSchema = ({
  name,
  testCase: { directiveArgs },
}: CreateSchemaConfig<RootValue, ResultValue>): GraphQLSchema =>
  new Pattern().applyToSchema(
    makeExecutableSchema({
      resolvers: {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        SomeObj: {
          toString: (obj: object): string => obj.toString(),
        } as IResolvers,
      },
      typeDefs: [
        ...Pattern.getTypeDefs(name, undefined, true, true),
        gql`
                type SomeObj {
                  toString: String
                }
                type Query {
                  test: String @${name}${directiveArgs}
                  arrayTest: [String] @${name}${directiveArgs}
                  number: Int @${name}${directiveArgs}
                  bool: Boolean @${name}${directiveArgs}
                  obj: SomeObj @${name}${directiveArgs}
                }
              `,
      ],
    }),
  );

const expectedValidationError = (
  message: string,
  key: keyof RootValue = 'test',
): ExpectedTestResult<ResultValue> => ({
  data: { [key]: null },
  errors: [new ValidationError(message)],
});

const name = 'pattern';

testEasyDirective({
  createSchema,
  DirectiveVisitor: Pattern,
  expectedArgsTypeDefs: `\
(
  flags: String
  regexp: String!
  ${validationDirectivePolicyArgs(capitalize(name))}
)`,
  name,
  testCases: [
    {
      directiveArgs: '(regexp: "[a-z]+", flags: "i")',
      operation: '{ test }',
      tests: [
        { rootValue: { test: 'abc' } },
        { rootValue: { test: 'a' } },
        { rootValue: { test: 'A' } },
        {
          expected: expectedValidationError(
            'Does not match pattern: /[a-z]+/i',
          ),
          rootValue: { test: '' },
        },
        {
          expected: expectedValidationError(
            'Does not match pattern: /[a-z]+/i',
          ),
          rootValue: { test: '0' },
        },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '(regexp: "[a-z]+")',
      operation: '{ test }',
      tests: [
        { rootValue: { test: 'abc' } },
        { rootValue: { test: 'a' } },
        {
          expected: expectedValidationError('Does not match pattern: /[a-z]+/'),
          rootValue: { test: 'A' },
        },
        {
          expected: expectedValidationError('Does not match pattern: /[a-z]+/'),
          rootValue: { test: '' },
        },
        {
          expected: expectedValidationError('Does not match pattern: /[a-z]+/'),
          rootValue: { test: '0' },
        },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '(regexp: "")',
      operation: '{ test }',
      tests: [
        { rootValue: { test: 'abc' } },
        { rootValue: { test: 'a' } },
        { rootValue: { test: 'A' } },
        { rootValue: { test: '' } },
        { rootValue: { test: '0' } },
        { rootValue: { test: null } },
      ],
    },
    {
      directiveArgs: '(regexp: "[")',
      error: new SyntaxError(
        'Invalid regular expression: /[/: Unterminated character class',
      ),
    },
    {
      // arrays should work the same, just repeat for simple pattern
      directiveArgs: '(regexp: "[a-z]+", flags: "i")',
      operation: '{ arrayTest }',
      tests: [
        { rootValue: { arrayTest: ['abc'] } },
        { rootValue: { arrayTest: ['a'] } },
        { rootValue: { arrayTest: ['A'] } },
        {
          expected: expectedValidationError(
            'Does not match pattern: /[a-z]+/i',
            'arrayTest',
          ),
          rootValue: { arrayTest: [''] },
        },
        {
          expected: expectedValidationError(
            'Does not match pattern: /[a-z]+/i',
            'arrayTest',
          ),
          rootValue: { arrayTest: ['0'] },
        },
        { rootValue: { arrayTest: [null] } },
        { rootValue: { arrayTest: null } },
      ],
    },
    {
      directiveArgs: '(regexp: "[0-9]+")',
      operation: '{ number }',
      tests: [
        { expected: { data: { number: 12 } }, rootValue: { number: 12 } },
      ],
    },
    {
      directiveArgs: '(regexp: "true")',
      operation: '{ bool }',
      tests: [
        { expected: { data: { bool: true } }, rootValue: { bool: true } },
      ],
    },
    {
      directiveArgs: '(regexp: "obj.toString result")',
      operation: '{ obj { toString }}',
      tests: [
        {
          expected: {
            data: {
              obj: { toString: 'obj.toString result' },
            },
          },
          rootValue: {
            obj: {
              toString: (): string => 'obj.toString result',
            },
          },
        },
      ],
    },
  ],
});
