import { graphql, GraphQLSchema } from 'graphql';
import { print } from 'graphql/language/printer';
import {
  ExecutionResultDataDefault,
  ExecutionResult,
} from 'graphql/execution/execute';
import gql from 'graphql-tag';

import EasyDirectiveVisitor from './EasyDirectiveVisitor';

export const minimalTypeDef = gql`
  type T {
    i: Int
  }
`;

export type CreateSchemaConfig<TValue> = {
  DirectiveVisitor: typeof EasyDirectiveVisitor;
  name: string;
  testCase: TestCase<TValue>;
};
export type CreateSchema<TValue> = (
  config: CreateSchemaConfig<TValue>,
) => GraphQLSchema;

export type ExpectedTestResult<
  TData = ExecutionResultDataDefault
> = ExecutionResult<TData>;

export type TestCase<TValue, TResult = ExecutionResultDataDefault> = {
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

export const testEasyDirective = <TValue>({
  createSchema,
  name,
  DirectiveVisitor,
  expectedArgsTypeDefs = '',
  expectedUnknownTypeDefs = '',
  testCases,
}: {
  createSchema: CreateSchema<TValue>;
  name: string;
  DirectiveVisitor: typeof EasyDirectiveVisitor;
  expectedArgsTypeDefs?: string;
  expectedUnknownTypeDefs?: string;
  testCases: TestCase<TValue>[];
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
      testCases.forEach((testCase: TestCase<TValue>): void => {
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
            const schema = createSchema({ DirectiveVisitor, name, testCase });
            tests.forEach(
              ({
                rootValue: itemRootValue,
                expected: itemExpected,
                operation: itemOperation,
              }): void => {
                const rootValue = itemRootValue || fallbackRootValue;
                const operation = itemOperation || fallbackOperation;
                const expected = itemExpected || { data: rootValue };
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
