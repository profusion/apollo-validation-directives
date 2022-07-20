import type { GraphQLSchema } from 'graphql';
import gql from 'graphql-tag';
import { makeExecutableSchema } from 'graphql-tools';

import cleanupPattern from './cleanupPattern';
import capitalize from './capitalize';

import type { CreateSchemaConfig, ExpectedTestResult } from './test-utils.test';
import {
  testEasyDirective,
  validationDirectivePolicyArgs,
} from './test-utils.test';

type RootValue = {
  arrayTest?: (string | null)[] | null;
  test?: string | null;
  number?: number;
  bool?: boolean;
  obj?: { toString(): string };
};

const createSchema = ({
  name,
  testCase: { directiveArgs },
}: CreateSchemaConfig<RootValue>): GraphQLSchema =>
  cleanupPattern.addValidationResolversToSchema(
    makeExecutableSchema({
      schemaDirectives: { [name]: cleanupPattern },
      typeDefs: [
        ...cleanupPattern.getTypeDefs(name, undefined, true, true),
        gql`
                type Query {
                  test: String @${name}${directiveArgs}
                }
              `,
      ],
    }),
  );

const expectedResult = (
  value: string,
  key: keyof RootValue = 'test',
): ExpectedTestResult<RootValue> => ({
  data: { [key]: value },
});

const name = 'cleanupPattern';

const noNumbers = 'No Numbers';

testEasyDirective({
  createSchema,
  DirectiveVisitor: cleanupPattern,
  expectedArgsTypeDefs: `\
(
  flags: String
  regexp: String!
  replaceWith: String! = ""
  ${validationDirectivePolicyArgs(capitalize(name))}
)`,
  name,
  testCases: [
    {
      directiveArgs: `(regexp: "\\\\d", flags: "g", replaceWith:"${noNumbers}")`,
      operation: '{ test }',
      tests: [
        { rootValue: { test: noNumbers } },
        {
          expected: expectedResult(noNumbers.repeat(3)),
          rootValue: { test: '123' },
        },
        {
          expected: expectedResult(`${noNumbers} abc, cd`),
          rootValue: { test: '1 abc, cd' },
        },
      ],
    },
    {
      directiveArgs: '(regexp: "")',
      operation: '{ test }',
      tests: [{ rootValue: { test: 'abc' } }, { rootValue: { test: '123' } }],
    },
    {
      directiveArgs: '(regexp: "[a-z]+")',
      operation: '{ test }',
      tests: [
        { expected: expectedResult(''), rootValue: { test: 'abc' } },
        { rootValue: { test: '123' } },
        { rootValue: { test: '+-*/5' } },
        {
          expected: expectedResult('!@#$%¨&'),
          rootValue: { test: '!@#$%¨&a' },
        },
      ],
    },
  ],
});
