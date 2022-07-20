import type { GraphQLSchema } from 'graphql';
import { graphql } from 'graphql';
import { print } from 'graphql/language/printer';
import type { ExecutionResult } from 'graphql/execution/execute';
import gql from 'graphql-tag';

import type EasyDirectiveVisitor from './EasyDirectiveVisitor';
import capitalize from './capitalize';

export const minimalTypeDef = gql`
  type T {
    i: Int
  }
`;

export type CreateSchemaConfig<TValue, TResult = TValue> = {
  DirectiveVisitor: typeof EasyDirectiveVisitor;
  name: string;
  testCase: TestCase<TValue, TResult>;
};
export type CreateSchema<TValue, TResult = TValue> = (
  config: CreateSchemaConfig<TValue, TResult>,
) => GraphQLSchema;

export type ExpectedTestResult<TData> = ExecutionResult<TData>;

export type TestCase<TValue, TResult = TValue> = {
  directiveArgs: string;
  // if provided then createSchema() is expected to fail
  error?: Error;
  // must be provided if tests do not provide one (used as fallback)
  operation?: string;
  // must be provided if tests do not provide one (used as fallback)
  rootValue?: TValue;
  // defaults to no test case (usually when createSchema() is expected to fail)
  tests?: {
    // if expected is undefined, then assume: { data: { rootValue } }
    expected?: ExpectedTestResult<TResult>;
    // if undefined, use TestCase.operation
    operation?: string;
    rootValue: TValue;
  }[];
};

export const validationDirectionEnumTypeDefs = (name: string): string => `\
enum ${name}ValidateDirectivePolicy {
  """Field resolver is responsible to evaluate it using \`validationErrors\` injected in GraphQLResolverInfo"""
  RESOLVER
  """Field resolver is not called if occurs a validation error, it throws \`UserInputError\`"""
  THROW
}`;

export const validationDirectivePolicyArgs = (name: string): string => `\
"""How to handle validation errors"""
  policy: ${name}ValidateDirectivePolicy = RESOLVER`;

export const testEasyDirective = <TValue, TResult>({
  createSchema,
  name,
  DirectiveVisitor,
  expectedArgsTypeDefs = '',
  expectedUnknownTypeDefs = validationDirectionEnumTypeDefs(capitalize(name)),
  testCases,
}: {
  createSchema: CreateSchema<TValue, TResult>;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DirectiveVisitor: any;
  expectedArgsTypeDefs?: string;
  expectedUnknownTypeDefs?: string;
  testCases: TestCase<TValue, TResult>[];
}): void => {
  describe(`directive @${name}`, (): void => {
    const { locations } = DirectiveVisitor.config;
    const locationsStr = locations.join(' | ');
    const directiveTypeDefs = DirectiveVisitor.getTypeDefs(name)
      .map(print)
      .join('');

    it('exports correct typeDefs', (): void => {
      const { description } = DirectiveVisitor.config;
      const expectedDescription = description ? `"""${description}"""\n` : '';
      expect(directiveTypeDefs).toBe(`\
${expectedDescription}\
directive @${name}${expectedArgsTypeDefs} \
on ${locationsStr}
${expectedUnknownTypeDefs}\

`);
    });

    it('defaultName is correct', (): void => {
      expect(directiveTypeDefs).toEqual(
        DirectiveVisitor.getTypeDefs().map(print).join(''),
      );
    });

    describe('validate works', (): void => {
      testCases.forEach((testCase: TestCase<TValue, TResult>): void => {
        const {
          directiveArgs,
          error,
          tests = [],
          operation: fallbackOperation = '',
          rootValue: fallbackRootValue,
        } = testCase;
        describe(directiveArgs || '<no arguments>', (): void => {
          if (error) {
            expect(() =>
              createSchema({ DirectiveVisitor, name, testCase }),
            ).toThrowError(error);
          } else {
            const schema = createSchema({
              DirectiveVisitor,
              name,
              testCase,
            });
            tests.forEach(
              ({
                rootValue: itemRootValue,
                expected: itemExpected,
                operation: itemOperation,
              }): void => {
                const rootValue = itemRootValue || fallbackRootValue;
                const operation = itemOperation || fallbackOperation;
                const expected = itemExpected || {
                  data: rootValue as unknown as TResult,
                };
                const { errors } = expected || {};
                it(`value ${JSON.stringify(rootValue)} ${
                  errors
                    ? `fails with: ${errors.map(e => e.message).join(', ')}`
                    : 'works'
                }`, async (): Promise<void> => {
                  const result = await graphql(
                    schema,
                    itemOperation || operation,
                    itemRootValue || rootValue,
                  );
                  expect(result).toEqual({ data: null, ...expected });
                });
              },
            );
          }
        });
      });
    });
  });
};
