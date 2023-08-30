import type { GraphQLSchema } from 'graphql';
import { gql } from 'graphql-tag';
import { makeExecutableSchema } from '@graphql-tools/schema';

import Trim, {
  createValidate as createTrimDirectiveValidate,
  DEFAULT_TRIM_MODE,
  trimDirectiveSchemaEnumName,
  TrimMode,
} from './trim.js';
import capitalize from './capitalize.js';

import type {
  CreateSchemaConfig,
  ExpectedTestResult,
  TestCase,
} from './test-utils.test.js';
import {
  testEasyDirective,
  validationDirectionEnumTypeDefs,
  validationDirectivePolicyArgs,
} from './test-utils.test.js';
import { ValidateDirectivePolicy } from './ValidateDirectiveVisitor.js';

type RootValue = {
  arrayTest?: (string | null)[] | null;
  test?: string | null;
  number?: number;
  bool?: boolean;
  obj?: { toString(): string };
};

const directiveName = 'trim';

const createSchema = ({
  name,
  testCase: { directiveArgs },
}: CreateSchemaConfig<RootValue>): GraphQLSchema =>
  new Trim().applyToSchema(
    makeExecutableSchema({
      typeDefs: [
        ...Trim.getTypeDefs(name, undefined, true, true),
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

const stringToTrim =
  '  \r\n  \n  \t \r string with whitespaces at both start and end \n \r \r\n \t ';

const noTrimmableWhitespaces = 'No Spaces';

const whiteSpacesAtTheEnd = 'White spaces at the end \n  \r  \r\n \t';

const whiteSpacesAtTheStart = ' \r \r\n \t \n White spaces at the start';

const generateTestCase: (
  value: string,
  trimFn: (stringToTrim: string) => string,
) => NonNullable<TestCase<RootValue>['tests']>[0] = (value, trimFn) => ({
  expected: expectedResult(trimFn(value)),
  rootValue: { test: value },
});

const trimAll = (value: { toString: () => string }): string =>
  value.toString().trim();

const trimEnd = (value: { toString: () => string }): string =>
  value.toString().trimRight();

const trimStart = (value: { toString: () => string }): string =>
  value.toString().trimLeft();

describe('directive @trim error tests', () => {
  // this should never happen due to schema validation, but is added to achieve 100% coverage
  it.each([
    [ValidateDirectivePolicy.RESOLVER],
    [ValidateDirectivePolicy.THROW],
  ])('should throw an error when "mode" is invalid - policy: %s', policy => {
    const invalidMode = 'INVALID_MODE' as TrimMode;
    try {
      createTrimDirectiveValidate({
        mode: invalidMode,
        policy,
      });
      expect(true).toBeFalsy();
    } catch (err) {
      expect(err).toEqual(
        new TypeError(
          `The value ${invalidMode} is not accepted by this argument`,
        ),
      );
    }
  });
});

testEasyDirective({
  createSchema,
  DirectiveVisitor: Trim,
  expectedArgsTypeDefs: `\
(
  mode: ${trimDirectiveSchemaEnumName}! = ${DEFAULT_TRIM_MODE}
  ${validationDirectivePolicyArgs(capitalize(directiveName))}
)`,
  expectedUnknownTypeDefs: `enum ${trimDirectiveSchemaEnumName} {
  """
  The value of this field will have both start and end of the string trimmed
  """
  ${TrimMode.TRIM_ALL}
  """The value of this field will have only the end of the string trimmed"""
  ${TrimMode.TRIM_END}
  """The value of this field will have only the start of the string trimmed"""
  ${TrimMode.TRIM_START}
}
${validationDirectionEnumTypeDefs(capitalize(directiveName))}`,
  name: directiveName,
  testCases: [
    {
      directiveArgs: `(mode: ${TrimMode.TRIM_ALL} )`,
      operation: '{ test }',
      tests: [
        generateTestCase(noTrimmableWhitespaces, trimAll),
        generateTestCase(stringToTrim, trimAll),
        generateTestCase(whiteSpacesAtTheEnd, trimAll),
        generateTestCase(whiteSpacesAtTheStart, trimAll),
      ],
    },
    {
      directiveArgs: '',
      operation: '{ test }',
      tests: [
        generateTestCase(noTrimmableWhitespaces, trimAll),
        generateTestCase(stringToTrim, trimAll),
        generateTestCase(whiteSpacesAtTheEnd, trimAll),
        generateTestCase(whiteSpacesAtTheStart, trimAll),
      ],
    },
    {
      directiveArgs: `(mode: ${TrimMode.TRIM_END})`,
      operation: '{ test }',
      tests: [
        generateTestCase(noTrimmableWhitespaces, trimEnd),
        generateTestCase(stringToTrim, trimEnd),
        generateTestCase(whiteSpacesAtTheEnd, trimEnd),
        generateTestCase(whiteSpacesAtTheStart, trimEnd),
      ],
    },
    {
      directiveArgs: `(mode: ${TrimMode.TRIM_START})`,
      operation: '{ test }',
      tests: [
        generateTestCase(noTrimmableWhitespaces, trimStart),
        generateTestCase(stringToTrim, trimStart),
        generateTestCase(whiteSpacesAtTheEnd, trimStart),
        generateTestCase(whiteSpacesAtTheStart, trimStart),
      ],
    },
  ],
});
