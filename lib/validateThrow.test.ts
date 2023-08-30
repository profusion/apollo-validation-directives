import { gql } from 'graphql-tag';
import type { GraphQLResolveInfo } from 'graphql';
import { graphql, GraphQLError } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';

import print from './utils/printer.js';
import Range from './range.js';

interface ArgsTestResolverCtx {
  shouldCallResolver: boolean;
  shouldContainValidationErrors?: boolean;
  values?: Record<string, unknown>;
}
interface ArgsOutputTestResolverCtx {
  shouldContainOutputValidationErrors?: boolean;
  isOptional?: boolean;
}

describe('validate THROW policy', () => {
  const mockResolver = jest.fn(
    (
      _parent: unknown,
      _args: Record<string, unknown>,
      _ctx: unknown,
      _info: GraphQLResolveInfo & { validationErrors?: unknown[] },
    ): unknown => true,
  );
  const outputMockResolver = (
    parent: unknown,
    args: { arg: number | null },
    ctx: unknown,
    info: GraphQLResolveInfo & { validationErrors?: unknown[] },
  ): number | null => {
    mockResolver(parent, args, ctx, info);
    return args.arg;
  };
  beforeEach(() => {
    mockResolver.mockClear();
  });
  const schema = new Range().applyToSchema(
    makeExecutableSchema({
      resolvers: {
        Query: {
          argTest: mockResolver,
          inputTest: mockResolver,
          optionalOutputTest: outputMockResolver,
          outputTest: outputMockResolver,
        },
      },
      typeDefs: [
        ...Range.getTypeDefs(),
        ...Range.getMissingCommonTypeDefs(),
        gql`
          input ThirdInput {
            n: Int @range(max: 200, policy: THROW)
          }
          input SecondInput {
            thirdInput: ThirdInput
            numbersThrow: [Int!] @range(max: 100, policy: THROW)
            numbers: [Int] @range(max: 200)
          }
          input FirstInput {
            n: Int @range(max: 0, policy: THROW)
            secondInput: SecondInput
          }
          type Query {
            argTest(
              n: Int @range(policy: THROW, max: 2)
              n2: Int @range(policy: RESOLVER, max: 10)
            ): Boolean
            inputTest(arg: FirstInput): Boolean
            outputTest(arg: Int!): Int! @range(max: 200, policy: THROW)
            optionalOutputTest(arg: Int): Int @range(max: 200, policy: THROW)
          }
        `,
      ],
    }),
  );
  const doTest = async (
    query: string,
    resolverName: string,
    variableValues: Record<string, unknown>,
    {
      shouldCallResolver,
      values,
      shouldContainValidationErrors,
    }: ArgsTestResolverCtx,
    expectedErrors?: Error[],
  ): Promise<void> => {
    const { data, errors } = await graphql({
      schema,
      source: query,
      variableValues,
    });
    expect(mockResolver.mock.calls.length).toBe(shouldCallResolver ? 1 : 0);
    if (shouldCallResolver) {
      const [call] = mockResolver.mock.calls;
      expect(call[1]).toEqual(values);
      if (shouldContainValidationErrors) {
        expect(call[3].validationErrors).toBeTruthy();
      } else {
        expect(call[3].validationErrors).toBeFalsy();
      }
      expect(data && data[resolverName]).toBeTruthy();
    }
    if (!expectedErrors) {
      expect(errors).toBeFalsy();
    } else {
      expect(errors).toEqual(expectedErrors);
      expect(data).toEqual({ [resolverName]: null });
    }
  };
  const doOutputTest = async (
    query: string,
    resolverName: string,
    variableValues: Record<string, unknown>,
    {
      isOptional,
      shouldContainOutputValidationErrors,
    }: ArgsOutputTestResolverCtx,
    expectedErrors?: Error[],
  ): Promise<void> => {
    const { data, errors } = await graphql({
      schema,
      source: query,
      variableValues,
    });
    expect(mockResolver.mock.calls.length).toBe(1);
    if (shouldContainOutputValidationErrors) {
      expect(data && data[resolverName]).toBeFalsy();
    } else if (!isOptional) {
      expect(data && data[resolverName]).toBeTruthy();
    }
    if (!expectedErrors) {
      expect(errors).toBeFalsy();
    } else {
      expect(errors).toEqual(expectedErrors);
      if (!isOptional) {
        expect(data && data[resolverName]).toEqual(null);
      }
    }
  };
  describe('Validate throw in inputs', () => {
    const executeInputTests = doTest.bind(
      null,
      print(gql`
        query InputTest($arg: FirstInput) {
          inputTest(arg: $arg)
        }
      `),
      'inputTest',
    );
    it('Should throw if n on FirstInput is invalid', () =>
      executeInputTests(
        { arg: { n: 2 } },
        {
          shouldCallResolver: false,
        },
        [new GraphQLError('More than 0')],
      ));
    it('Should throw if numbersThrow on SecondInput is invalid', () =>
      executeInputTests(
        { arg: { secondInput: { numbersThrow: [1, 2, 101] } } },
        {
          shouldCallResolver: false,
        },
        [new GraphQLError('More than 100')],
      ));
    it('Should throw if both array inputs on SecondInput are invalid', () =>
      executeInputTests(
        {
          arg: { secondInput: { numbers: [10000], numbersThrow: [1, 2, 101] } },
        },
        {
          shouldCallResolver: false,
        },
        [new GraphQLError('More than 100')],
      ));
    it('Should not throw if numbers on SecondInput is valid', () =>
      executeInputTests(
        { arg: { secondInput: { numbers: [0, 2, 3], numbersThrow: [1, 2] } } },
        {
          shouldCallResolver: true,
          shouldContainValidationErrors: false,
          values: {
            arg: { secondInput: { numbers: [0, 2, 3], numbersThrow: [1, 2] } },
          },
        },
      ));
    it('Should not throw if numbersThrow on SecondInput is null', () =>
      executeInputTests(
        {
          arg: {
            secondInput: { numbers: [0, 2, 3], numbersThrow: null },
          },
        },
        {
          shouldCallResolver: true,
          shouldContainValidationErrors: false,
          values: {
            arg: {
              secondInput: { numbers: [0, 2, 3], numbersThrow: null },
            },
          },
        },
      ));
    it('Should populate validation errors if input is out of range', () =>
      executeInputTests(
        {
          arg: {
            secondInput: {
              numbers: [0, 2, 3, 20000],
              numbersThrow: [1, 2, 100],
              thirdInput: {
                n: 2,
              },
            },
          },
        },
        {
          shouldCallResolver: true,
          shouldContainValidationErrors: true,
          values: {
            arg: {
              secondInput: {
                numbers: null,
                numbersThrow: [1, 2, 100],
                thirdInput: {
                  n: 2,
                },
              },
            },
          },
        },
      ));
    it('Should populate validation errors if input is out of range', () =>
      executeInputTests(
        {
          arg: {
            secondInput: {
              numbers: [0, 2, 3, 20000],
              numbersThrow: [1, 2, 100],
              thirdInput: {
                n: 20000,
              },
            },
          },
        },
        {
          shouldCallResolver: false,
        },
        [new GraphQLError('More than 200')],
      ));
  });
  describe('Validate throw in simple arguments', () => {
    const executeSimpleArgumentsTests = doTest.bind(
      null,
      print(gql`
        query ArgTest($n: Int, $n2: Int) {
          argTest(n: $n, n2: $n2)
        }
      `),
      'argTest',
    );
    it('Should if validation is ok', () =>
      executeSimpleArgumentsTests(
        { n: 0, n2: 1 },
        {
          shouldCallResolver: true,
          shouldContainValidationErrors: false,
          values: { n: 0, n2: 1 },
        },
      ));
    it('Should throw and not call resolver', () =>
      executeSimpleArgumentsTests(
        { n: 200, n2: 1 },
        {
          shouldCallResolver: false,
        },
        [new GraphQLError('More than 2')],
      ));
    it('Should call resolver and not throw', () =>
      executeSimpleArgumentsTests(
        { n: 0, n2: 400 },
        {
          shouldCallResolver: true,
          shouldContainValidationErrors: true,
          values: { n: 0, n2: null },
        },
      ));
    it('Should throw if both validations fail', () =>
      executeSimpleArgumentsTests(
        { n: 200, n2: 400 },
        {
          shouldCallResolver: false,
        },
        [new GraphQLError('More than 2')],
      ));
  });
  describe('Validate throw in outputs', () => {
    const executeOutputTests = doOutputTest.bind(
      null,
      print(gql`
        query OutputTest($arg: Int!) {
          outputTest(arg: $arg)
        }
      `),
      'outputTest',
    );
    const executeOptionalOutputTests = doOutputTest.bind(
      null,
      print(gql`
        query OptinalOutputTest($arg: Int) {
          optionalOutputTest(arg: $arg)
        }
      `),
      'optionalOutputTest',
    );

    it('Should throw if output value is invalid', () =>
      executeOutputTests(
        { arg: 300 },
        {
          shouldContainOutputValidationErrors: true,
        },
        [new GraphQLError('More than 200')],
      ));
    it('Should not throw if output value is valid', () =>
      executeOutputTests({ arg: 200 }, {}));

    it('Should throw if optional output value is invalid', () =>
      executeOptionalOutputTests(
        { arg: 300 },
        {
          isOptional: true,
          shouldContainOutputValidationErrors: true,
        },
        [new GraphQLError('More than 200')],
      ));
    it('Should not throw if optional output value is valid', () =>
      executeOptionalOutputTests(
        { arg: 200 },
        {
          isOptional: true,
        },
      ));
    it('Should not throw if optional output value is null or undefined', () =>
      executeOptionalOutputTests(
        {},
        {
          isOptional: true,
        },
      ));
  });
});
