import {
  graphql,
  GraphQLArgument,
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLInputType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLSchema,
} from 'graphql';
import { print } from 'graphql/language/printer';
import gql from 'graphql-tag';
import { makeExecutableSchema } from 'graphql-tools';
import { ValidationError } from 'apollo-server-errors';

import ValidateDirectiveVisitor, {
  ValidateFunction,
  ValidationDirectiveArgs,
} from './ValidateDirectiveVisitor';
import {
  validationDirectivePolicyArgs,
  validationDirectionEnumTypeDefs,
} from './test-utils.test';

import capitalize from './capitalize';

interface ValidationErrorsResolverInfo extends GraphQLResolveInfo {
  validationErrors?: ValidationError[];
}

const defaultLocationsStr = ValidateDirectiveVisitor.config.locations.join(
  ' | ',
);

const getFieldArg = (
  type: GraphQLObjectType,
  fieldName: string,
  argName: string,
): GraphQLArgument | undefined =>
  type.getFields()[fieldName].args.find(({ name }) => name === argName);

describe('ValidateDirectiveVisitor', (): void => {
  const minimalTypeDef = gql`
    type T {
      i: Int
    }
  `;

  const commonTypeDefs = [
    `\
"""
type of the list entry given as \`validationErrors\` argument that is injected
into every field resolver with validated arguments
"""
input ValidatedInputError {
  """The error/exception message that caused the validation error"""
  message: String!
  """Path to the value that caused the validation error"""
  path: [String!]!
  """The actual error instance"""
  error: ValidatedInputErrorInstance!
}
`,
    `\
"""The error/exception that caused the validation error"""
input ValidatedInputErrorInstance {
  message: String!
}
`,
    `\
"""Output/return version of ValidatedInputError"""
type ValidatedInputErrorOutput {
  """The error/exception message that caused the validation error"""
  message: String!
  """Path to the value that caused the validation error"""
  path: [String!]!
}
`,
  ];

  it('commonTypeDefs is correct without schema', (): void => {
    expect(
      ValidateDirectiveVisitor.getMissingCommonTypeDefs().map(print),
    ).toEqual(commonTypeDefs);
  });

  const GraphQLNonNullInt = new GraphQLNonNull(GraphQLInt);

  const GraphQLIntList = new GraphQLList(GraphQLInt);
  const GraphQLIntListNonNull = new GraphQLList(GraphQLNonNullInt);

  const GraphQLNonNullIntList = new GraphQLNonNull(GraphQLIntList);
  const GraphQLNonNullIntListNonNull = new GraphQLNonNull(
    GraphQLIntListNonNull,
  );

  const name = 'testDirective';
  const capitalizedName = capitalize(name);
  const basicTypeDefs = [
    ...ValidateDirectiveVisitor.getMissingCommonTypeDefs(
      makeExecutableSchema({ typeDefs: minimalTypeDef }),
    ),
    gql`
      ${validationDirectionEnumTypeDefs(capitalizedName)}
      directive @anotherDirective(
        validate: Boolean! = true
        ${validationDirectivePolicyArgs(capitalizedName)}
      ) on ${defaultLocationsStr}
      directive @${name}(
        validate: Boolean! = true
        ${validationDirectivePolicyArgs(capitalizedName)}
      ) on ${defaultLocationsStr}
    `,
  ];

  type TestDirectiveArgs = { validate: boolean } & ValidationDirectiveArgs;

  describe('Throw policy', (): void => {
    class TestDirective extends ValidateDirectiveVisitor<TestDirectiveArgs> {
      // eslint-disable-next-line class-methods-use-this
      public getValidationForArgs(): ValidateFunction {
        const validate = (): void => {
          throw new ValidationError('Validation error');
        };
        Object.defineProperty(validate, 'validateProperties', {
          value: {
            args: this.args,
            directive: 'testThrowPolicyValidate',
          },
          writable: false,
        });
        return validate;
      }
    }
    const schema = ValidateDirectiveVisitor.addValidationResolversToSchema(
      makeExecutableSchema({
        resolvers: {
          Query: {
            argShouldFail: (): boolean => true,
            failInput: (): boolean => true,
            failInputField: (): boolean => true,
          },
        },
        schemaDirectives: {
          testDirective: TestDirective,
        },
        typeDefs: [
          ...basicTypeDefs,
          gql`
            input FailInput @testDirective(policy: THROW) {
              n: Int
            }
            input FailInputField {
              n: Int @testDirective(policy: THROW)
            }
            type Query {
              argShouldFail(arg: Int @testDirective(policy: THROW)): Boolean!
              failInput(input: FailInput): Boolean!
              failInputField(input: FailInputField): Boolean!
            }
          `,
        ],
      }),
    );

    it('should fail on args', async (): Promise<void> => {
      const source = print(gql`
        query {
          argShouldFail(arg: 1)
        }
      `);
      const result = await graphql(schema, source);
      expect(result).toEqual({
        data: null,
        errors: [
          {
            extensions: {
              code: 'GRAPHQL_VALIDATION_FAILED',
              validation: {
                path: ['arg'],
                properties: {
                  args: {
                    policy: 'THROW',
                    validate: true,
                  },
                  directive: 'testThrowPolicyValidate',
                },
              },
            },
            locations: [{ column: 3, line: 2 }],
            message: 'Validation error',
            path: ['argShouldFail'],
          },
        ],
      });
    });

    it('should fail on input object', async (): Promise<void> => {
      const source = print(gql`
        query {
          failInputField(input: { n: 2 })
        }
      `);
      const result = await graphql(schema, source);
      expect(result).toEqual({
        data: null,
        errors: [
          {
            extensions: {
              code: 'GRAPHQL_VALIDATION_FAILED',
              validation: {
                path: ['input', 'n'],
                properties: {
                  args: {
                    policy: 'THROW',
                    validate: true,
                  },
                  directive: 'testThrowPolicyValidate',
                },
              },
            },
            locations: [{ column: 3, line: 2 }],
            message: 'Validation error',
            path: ['failInputField'],
          },
        ],
      });
    });

    it('should fail on input object', async (): Promise<void> => {
      const source = print(gql`
        query {
          failInput(input: { n: 2 })
        }
      `);
      const result = await graphql(schema, source);
      expect(result).toEqual({
        data: null,
        errors: [
          {
            extensions: {
              code: 'GRAPHQL_VALIDATION_FAILED',
              validation: {
                path: ['input', 'n'],
                properties: {
                  args: {
                    policy: 'THROW',
                    validate: true,
                  },
                  directive: 'testThrowPolicyValidate',
                },
              },
            },
            locations: [{ column: 3, line: 2 }],
            message: 'Validation error',
            path: ['failInput'],
          },
        ],
      });
    });
  });

  describe('basic behavior works', (): void => {
    const mockValidate = jest.fn(x => x);
    const mockResolver = jest.fn((_, { arg }): object => arg);
    class TestDirective extends ValidateDirectiveVisitor<TestDirectiveArgs> {
      public static readonly config = {
        ...ValidateDirectiveVisitor.config,
        args: {
          validate: {
            defaultValue: true,
            description: 'if true does validation',
            type: new GraphQLNonNull(GraphQLBoolean),
          },
        },
      };

      public getValidationForArgs(): ValidateFunction | undefined {
        return this.args.validate ? mockValidate : undefined;
      }
    }

    it('getTypeDefs() works as expected', (): void => {
      expect(TestDirective.getTypeDefs(name).map(print)).toEqual([
        `\
directive @${name}(
  """if true does validation"""
  validate: Boolean! = true
  ${validationDirectivePolicyArgs(capitalizedName)}
) on ${defaultLocationsStr}
`,
        `\
${validationDirectionEnumTypeDefs(capitalizedName)}
`,
        // should NOT return the getMissingCommonTypeDefs() by default!
      ]);
    });

    describe('field directives', (): void => {
      // these are handled directly by the ValidateDirectiveVisitor and
      // do NOT need addValidationResolversToSchema()!

      // these are simpler to validate since the GraphQL framework will handle
      // exceptions and all.
      const schema = makeExecutableSchema({
        resolvers: {
          Query: {
            notValidated: mockResolver,
            validated: mockResolver,
            validatedModifiers: mockResolver,
          },
        },
        schemaDirectives: {
          testDirective: TestDirective,
        },
        typeDefs: [
          ...basicTypeDefs,
          gql`
            type Query {
              notValidated(arg: Int): Int @${name}(validate: false)
              validated(arg: Int): Int @${name}(validate: true)
              validatedModifiers(arg: [Int]!): [Int] @${name}
              defaultResolver(arg: Int!): Int @${name}
            }
          `,
        ],
      });
      const QueryType = schema.getType('Query') as GraphQLObjectType;

      beforeEach((): void => {
        mockResolver.mockClear();

        mockValidate.mockReset();
        mockValidate.mockImplementationOnce(x => x * 2);
      });

      const value = 1234;
      const context = { theContext: 1234 };

      it('calls directive if validated', async (): Promise<void> => {
        const source = print(gql`
        query {
          validated(arg: ${value})
        }
      `);
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: { validated: value * 2 },
        });
        expect(mockValidate).toBeCalledTimes(1);
        expect(mockValidate).toBeCalledWith(
          value,
          GraphQLInt,
          QueryType,
          context,
          expect.any(Object),
          undefined,
          { arg: value },
        );
        expect(mockResolver).toBeCalledTimes(1);
      });

      it('works with default resolver', async (): Promise<void> => {
        const source = print(gql`
          query {
            defaultResolver(arg: ${value})
          }
        `);
        const result = await graphql(
          schema,
          source,
          { defaultResolver: 42 },
          context,
        );
        expect(result).toEqual({
          data: { defaultResolver: 42 * 2 },
        });
        expect(mockValidate).toBeCalledTimes(1);
        expect(mockValidate).toBeCalledWith(
          42,
          GraphQLInt,
          QueryType,
          context,
          expect.any(Object),
          { defaultResolver: 42 },
          { arg: value },
        );
      });

      it('calls directive if validated, handles throw', async (): Promise<void> => {
        const source = print(gql`
          query {
            validated(arg: ${value})
          }
        `);
        mockValidate.mockReset();
        mockValidate.mockImplementationOnce((): void => {
          throw new ValidationError('forced error');
        });
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: { validated: null },
          errors: [new ValidationError('forced error')],
        });
        expect(mockValidate).toBeCalledTimes(1);
        expect(mockValidate).toBeCalledWith(
          value,
          GraphQLInt,
          QueryType,
          context,
          expect.any(Object),
          undefined,
          { arg: value },
        );
        expect(mockResolver).toBeCalledTimes(1);
      });

      it('calls directive if validated, handles undefined', async (): Promise<void> => {
        const source = print(gql`
          query {
            validated(arg: ${value})
          }
        `);
        mockValidate.mockReset();
        mockValidate.mockImplementationOnce((): undefined => undefined);
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: { validated: null },
          errors: [new ValidationError('validation returned undefined')],
        });
        expect(mockValidate).toBeCalledTimes(1);
        expect(mockValidate).toBeCalledWith(
          value,
          GraphQLInt,
          QueryType,
          context,
          expect.any(Object),
          undefined,
          { arg: value },
        );
        expect(mockResolver).toBeCalledTimes(1);
      });

      it('calls directive if validated, handles modifiers', async (): Promise<void> => {
        // modifiers are handled the same way, just have a test to guarantee
        // we're not trying to do anything fancy in the core (like map the
        // validation to each element) -- this can be done by the subclasses
        // if they wish, however to do this, the core must NOT. Example:
        //  - @stringLength() could verify the length of strings OR
        //    every string of a list
        //  - @listLength() could verify the list length itself
        const source = print(gql`
        query {
          validatedModifiers(arg: [${value}, 42, null])
        }
      `);
        mockValidate.mockReset();
        mockValidate.mockImplementationOnce((v: (number | null)[]) =>
          v.map(x => (x === null ? x : x * 2)),
        );
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: { validatedModifiers: [value * 2, 42 * 2, null] },
        });
        expect(mockValidate).toBeCalledTimes(1);
        expect(mockValidate).toBeCalledWith(
          [value, 42, null],
          GraphQLIntList,
          QueryType,
          context,
          expect.any(Object),
          undefined,
          { arg: [value, 42, null] },
        );
        expect(mockResolver).toBeCalledTimes(1);
      });

      it('does NOT call directive if validation is undefined', async (): Promise<void> => {
        const source = print(gql`
        query {
          notValidated(arg: ${value})
        }
      `);
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: { notValidated: value },
        });
        expect(mockValidate).not.toBeCalled();
        expect(mockResolver).toBeCalledTimes(1);
      });
    });

    describe('output object directives wraps fields', (): void => {
      // these are handled directly by the ValidateDirectiveVisitor and
      // do NOT need addValidationResolversToSchema()!

      // these are simpler to validate since the GraphQL framework will handle
      // exceptions and all.
      // This just checks if the field is automatically wrapped, trust
      // 'field directives' works properly for the details
      const schema = makeExecutableSchema({
        schemaDirectives: {
          [name]: TestDirective,
        },
        typeDefs: [
          ...basicTypeDefs,
          gql`
            type AllValidated @${name} {
              value: Int
            }
            type AllNotValidated @${name}(validate: false) {
              value: Int
            }
            type Query {
              allValidated: AllValidated
              allNotValidated: AllNotValidated
            }
          `,
        ],
      });
      const AllValidatedType = schema.getType(
        'AllValidated',
      ) as GraphQLObjectType;
      const context = { theContext: 63 };

      const rootValue = {
        allNotValidated: { value: 34 },
        allValidated: { value: 12 },
      };

      beforeAll((): void => {
        mockValidate.mockReset();
        mockValidate.mockImplementationOnce(x => x * 2);
      });

      it('works with validation', async (): Promise<void> => {
        const source = print(gql`
          query {
            allValidated {
              value
            }
          }
        `);
        const result = await graphql(schema, source, rootValue, context);
        expect(result).toEqual({
          data: { allValidated: { value: rootValue.allValidated.value * 2 } },
        });
        expect(mockValidate).toBeCalledTimes(1);
        expect(mockValidate).toBeCalledWith(
          12,
          GraphQLInt,
          AllValidatedType,
          context,
          expect.any(Object),
          { value: 12 },
          {},
        );
      });

      it('works without validation (undefined)', async (): Promise<void> => {
        const source = print(gql`
          query {
            allNotValidated {
              value
            }
          }
        `);
        mockValidate.mockClear();
        const result = await graphql(schema, source, rootValue, context);
        expect(result).toEqual({
          data: { allNotValidated: rootValue.allNotValidated },
        });
        expect(mockValidate).not.toBeCalled();
      });
    });

    describe('argument directives', (): void => {
      // these are handled directly by the ValidateDirectiveVisitor and
      // do NOT need addValidationResolversToSchema()!

      // these are trickier to test since there is nothing doing the
      // validation for us prior to call the final resolver
      const schema = makeExecutableSchema({
        resolvers: {
          Query: {
            alsoNotValidated: mockResolver,
            deepNonNullable: (
              _,
              { arg },
              __,
              { validationErrors }: ValidationErrorsResolverInfo,
            ): unknown => {
              const { nonNullable } = (arg || [])[0] || {};
              return { nonNullable, validationErrors };
            },
            doubleValidation: mockResolver,
            manyArgsValidated: mockResolver,
            nonNullable: mockResolver,
            nonNullableEnum: mockResolver,
            nonNullableListOfNonNullable: mockResolver,
            nonNullableListOfNullable: mockResolver,
            notValidated: mockResolver,
            nullable: mockResolver,
            nullableListOfNullable: mockResolver,
            someArgsNotValidated: mockResolver,
          },
        },
        schemaDirectives: {
          anotherDirective: TestDirective,
          [name]: TestDirective,
        },
        typeDefs: [
          ...basicTypeDefs,
          gql`
            type DeepNonNullable {
              nonNullable: Int # mirror the name, but type is nullable
              validationErrors: [ValidatedInputErrorOutput!]
            }
            input DeepNonNullableInput {
              nonNullable: Int!
            }
            enum MyEnum {
              someOption
              anotherOption
            }
            type Query {
              nonNullable(arg: Int! @${name}): Int
              nonNullableEnum(arg: MyEnum! @${name}): MyEnum
              nonNullableListOfNonNullable(arg: [Int!]! @${name}): [Int]
              nonNullableListOfNullable(arg: [Int]! @${name}): [Int]
              nullable(arg: Int @${name}): Int
              nullableListOfNullable(arg: [Int] @${name}): [Int]
              notValidated(arg: Int): Int
              alsoNotValidated(arg: Int! @${name}(validate: false)): Int
              defaultResolver(arg: Int @${name}): Int
              someArgsNotValidated(
                arg: Int @${name}
                notValidated: Int
              ): Int
              manyArgsValidated(
                arg: Int @${name}
                alsoValidated: Int @${name}
              ): Int
              deepNonNullable(
                arg: [DeepNonNullableInput!] @${name}
              ): DeepNonNullable
              doubleValidation(arg: Int @${name} @anotherDirective): Int
            }
          `,
        ],
      });
      const QueryType = schema.getType('Query') as GraphQLObjectType;

      const value = 1234;
      const context = { theContext: 468 };

      describe('argument directives work with valid input', (): void => {
        beforeEach((): void => {
          mockResolver.mockClear();

          mockValidate.mockReset();
          mockValidate.mockImplementation(x => x);
        });

        it('works with non-nullable', async (): Promise<void> => {
          const source = print(gql`
          query {
            nonNullable(arg: ${value})
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nonNullable: value },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLNonNullInt,
            getFieldArg(QueryType, 'nonNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: value },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works with non-nullable variables', async (): Promise<void> => {
          // should not suffer from bug:
          // https://github.com/apollographql/graphql-tools/issues/789#issuecomment-590143140
          const source = print(gql`
            query Test($value: Int!) {
              nonNullable(arg: $value)
            }
          `);
          const result = await graphql(schema, source, undefined, context, {
            value,
          });
          expect(result).toEqual({
            data: { nonNullable: value },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLNonNullInt,
            getFieldArg(QueryType, 'nonNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: value },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works with non-nullable enum', async (): Promise<void> => {
          const source = print(gql`
            query {
              nonNullableEnum(arg: someOption)
            }
          `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nonNullableEnum: 'someOption' },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            'someOption',
            new GraphQLNonNull(schema.getType('MyEnum') as GraphQLEnumType),
            getFieldArg(QueryType, 'nonNullableEnum', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: 'someOption' },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works with nonNullableListOfNonNullable', async (): Promise<void> => {
          const source = print(gql`
          query {
            nonNullableListOfNonNullable(arg: [${value}, 42])
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nonNullableListOfNonNullable: [value, 42] },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            [value, 42],
            GraphQLNonNullIntListNonNull,
            getFieldArg(QueryType, 'nonNullableListOfNonNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: [value, 42] },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works with nonNullableListOfNullable', async (): Promise<void> => {
          const source = print(gql`
          query {
            nonNullableListOfNullable(arg: [null, ${value}])
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nonNullableListOfNullable: [null, value] },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            [null, value],
            GraphQLNonNullIntList,
            getFieldArg(QueryType, 'nonNullableListOfNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: [null, value] },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works with nullable (value)', async (): Promise<void> => {
          const source = print(gql`
          query {
            nullable(arg: ${value})
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nullable: value },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLInt,
            getFieldArg(QueryType, 'nullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: value },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works with nullable (null)', async (): Promise<void> => {
          const source = print(gql`
            query {
              nullable(arg: null)
            }
          `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nullable: null },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            null,
            GraphQLInt,
            getFieldArg(QueryType, 'nullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: null },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works with nullableListOfNullable (value)', async (): Promise<void> => {
          const source = print(gql`
          query {
            nullableListOfNullable(arg: [${value}, null])
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nullableListOfNullable: [value, null] },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            [value, null],
            GraphQLIntList,
            getFieldArg(QueryType, 'nullableListOfNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: [value, null] },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works with nullableListOfNullable (null)', async (): Promise<void> => {
          const source = print(gql`
            query {
              nullableListOfNullable(arg: null)
            }
          `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nullableListOfNullable: null },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            null,
            GraphQLIntList,
            getFieldArg(QueryType, 'nullableListOfNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: null },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works with no validation', async (): Promise<void> => {
          const source = print(gql`
          query {
            notValidated(arg: ${value})
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { notValidated: value },
          });
          expect(mockValidate).not.toBeCalled();
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works if validation is undefined', async (): Promise<void> => {
          const source = print(gql`
          query {
            alsoNotValidated(arg: ${value})
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { alsoNotValidated: value },
          });
          expect(mockValidate).not.toBeCalled();
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works with someArgsNotValidated', async (): Promise<void> => {
          const source = print(gql`
          query {
            someArgsNotValidated(arg: ${value}, notValidated: 12)
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { someArgsNotValidated: value },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLInt,
            getFieldArg(QueryType, 'someArgsNotValidated', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: value, notValidated: 12 },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works with manyArgsValidated', async (): Promise<void> => {
          const source = print(gql`
          query {
            manyArgsValidated(arg: ${value}, alsoValidated: 12)
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { manyArgsValidated: value },
          });
          expect(mockValidate).toBeCalledTimes(2);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLInt,
            getFieldArg(QueryType, 'manyArgsValidated', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { alsoValidated: 12, arg: value },
            ['arg'],
          );
          expect(mockValidate).toBeCalledWith(
            12,
            GraphQLInt,
            getFieldArg(QueryType, 'manyArgsValidated', 'alsoValidated'),
            context,
            expect.any(Object),
            undefined,
            { alsoValidated: 12, arg: value },
            ['alsoValidated'],
          );
          expect(mockResolver).toBeCalledTimes(1);
        });

        it('works with deepNonNullable', async (): Promise<void> => {
          const source = print(gql`
            query {
              deepNonNullable(arg: [{ nonNullable: 1 }]) {
                nonNullable
                validationErrors {
                  path
                  message
                }
              }
            }
          `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: {
              deepNonNullable: {
                nonNullable: 1,
                validationErrors: null,
              },
            },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            [{ nonNullable: 1 }],
            new GraphQLList(
              new GraphQLNonNull(
                schema.getType('DeepNonNullableInput') as GraphQLInputType,
              ),
            ),
            getFieldArg(QueryType, 'deepNonNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: [{ nonNullable: 1 }] },
            ['arg'],
          );
          // note: mockResolver is not called, it's a custom resolver
          // that is validated based on the result.
        });

        it('works with default resolver', async (): Promise<void> => {
          const source = print(gql`
          query {
            defaultResolver(arg: ${value})
          }
        `);
          const result = await graphql(
            schema,
            source,
            { defaultResolver: 42 },
            context,
          );
          expect(result).toEqual({
            data: { defaultResolver: 42 },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLInt,
            getFieldArg(QueryType, 'defaultResolver', 'arg'),
            context,
            expect.any(Object),
            { defaultResolver: 42 },
            { arg: value },
            ['arg'],
          );
        });

        it('works with double validation', async (): Promise<void> => {
          const source = print(gql`
            query {
              doubleValidation(arg: ${value})
            }
          `);
          mockValidate.mockReset();
          mockValidate.mockImplementation(x => x * 2);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { doubleValidation: value * 4 },
          });
          expect(mockValidate).toBeCalledTimes(2);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLInt,
            getFieldArg(QueryType, 'doubleValidation', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: value },
            ['arg'],
          );
          expect(mockValidate).toBeCalledWith(
            value * 2,
            GraphQLInt,
            getFieldArg(QueryType, 'doubleValidation', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: value },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
        });
      });

      describe('argument directives work with invalid input', (): void => {
        const validationErrors = [
          {
            error: new ValidationError('forced error'),
            message: 'forced error',
            path: ['arg'],
          },
        ];
        beforeEach((): void => {
          mockResolver.mockClear();

          mockValidate.mockReset();
          mockValidate.mockImplementation(x => x);
          mockValidate.mockImplementationOnce((): void => {
            throw new ValidationError('forced error');
          });
        });

        it('works with non-nullable', async (): Promise<void> => {
          const source = print(gql`
            query {
              nonNullable(arg: ${value})
            }
          `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nonNullable: null }, // only arg is non-nullable!
            errors: [new ValidationError('forced error')],
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLNonNullInt,
            getFieldArg(QueryType, 'nonNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: value },
            ['arg'],
          );
          expect(mockResolver).not.toBeCalled();
        });

        it('works with non-nullable (validation returns undefined)', async (): Promise<void> => {
          const source = print(gql`
            query {
              nonNullable(arg: ${value})
            }
          `);
          mockValidate.mockReset();
          mockValidate.mockImplementationOnce((): void => undefined);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nonNullable: null }, // only arg is non-nullable!
            errors: [new ValidationError('validation returned undefined')],
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLNonNullInt,
            getFieldArg(QueryType, 'nonNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: value },
            ['arg'],
          );
          expect(mockResolver).not.toBeCalled();
        });

        it('works with non-nullable (validation returns invalid scalar)', async (): Promise<void> => {
          const source = print(gql`
            query {
              nonNullable(arg: ${value})
            }
          `);
          mockValidate.mockReset();
          mockValidate.mockImplementationOnce((): object => ({ bug: 1 }));
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nonNullable: null }, // only arg is non-nullable!
            errors: [
              new ValidationError(
                'Int cannot represent non-integer value: { bug: 1 }',
              ),
            ],
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLNonNullInt,
            getFieldArg(QueryType, 'nonNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: value },
            ['arg'],
          );
          expect(mockResolver).not.toBeCalled();
        });

        it('works with non-nullable enum (invalid value)', async (): Promise<void> => {
          const source = print(gql`
            query {
              nonNullableEnum(arg: someOption)
            }
          `);
          mockValidate.mockReset();
          mockValidate.mockImplementationOnce((): string => 'invalidValue');
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nonNullableEnum: null },
            errors: [
              new ValidationError(
                'MyEnum.serialize() returned undefined for value: invalidValue',
              ),
            ],
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            'someOption',
            new GraphQLNonNull(schema.getType('MyEnum') as GraphQLEnumType),
            getFieldArg(QueryType, 'nonNullableEnum', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: 'someOption' },
            ['arg'],
          );
          expect(mockResolver).not.toBeCalled();
        });

        it('works with nonNullableListOfNonNullable', async (): Promise<void> => {
          const source = print(gql`
          query {
            nonNullableListOfNonNullable(arg: [${value}, 42])
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nonNullableListOfNonNullable: null }, // only arg is non-nullable!
            errors: [new ValidationError('forced error')],
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            [value, 42],
            GraphQLNonNullIntListNonNull,
            getFieldArg(QueryType, 'nonNullableListOfNonNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: [value, 42] },
            ['arg'],
          );
          expect(mockResolver).not.toBeCalled();
        });

        it('works with nonNullableListOfNonNullable (null element)', async (): Promise<void> => {
          const source = print(gql`
            query {
              nonNullableListOfNonNullable(arg: [${value}, 42])
            }
          `);
          mockValidate.mockReset();
          mockValidate.mockImplementation((): null[] => [null]);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nonNullableListOfNonNullable: null }, // only arg is non-nullable!
            errors: [
              new ValidationError('received null where non-null is required'),
            ],
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            [value, 42],
            GraphQLNonNullIntListNonNull,
            getFieldArg(QueryType, 'nonNullableListOfNonNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: [value, 42] },
            ['arg'],
          );
          expect(mockResolver).not.toBeCalled();
        });

        it('works with nonNullableListOfNullable', async (): Promise<void> => {
          const source = print(gql`
          query {
            nonNullableListOfNullable(arg: [null, ${value}])
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nonNullableListOfNullable: null },
            errors: [new ValidationError('forced error')],
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            [null, value],
            GraphQLNonNullIntList,
            getFieldArg(QueryType, 'nonNullableListOfNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: [null, value] },
            ['arg'],
          );
          expect(mockResolver).not.toBeCalled();
        });

        it('works with nullable', async (): Promise<void> => {
          const source = print(gql`
          query {
            nullable(arg: ${value})
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nullable: null },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLInt,
            getFieldArg(QueryType, 'nullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: value },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
          expect(mockResolver).toBeCalledWith(
            undefined,
            {
              arg: null,
            },
            context,
            expect.objectContaining({
              validationErrors,
            }),
          );
        });

        it('works with nullableListOfNullable (value)', async (): Promise<void> => {
          const source = print(gql`
          query {
            nullableListOfNullable(arg: [${value}, null])
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { nullableListOfNullable: null },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            [value, null],
            GraphQLIntList,
            getFieldArg(QueryType, 'nullableListOfNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: [value, null] },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
          expect(mockResolver).toBeCalledWith(
            undefined,
            {
              arg: null,
            },
            context,
            expect.objectContaining({ validationErrors }),
          );
        });

        it('works with someArgsNotValidated', async (): Promise<void> => {
          const source = print(gql`
          query {
            someArgsNotValidated(arg: ${value}, notValidated: 12)
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { someArgsNotValidated: null },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLInt,
            getFieldArg(QueryType, 'someArgsNotValidated', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: value, notValidated: 12 },
            ['arg'],
          );
          expect(mockResolver).toBeCalledTimes(1);
          expect(mockResolver).toBeCalledWith(
            undefined,
            {
              arg: null,
              notValidated: 12,
            },
            context,
            expect.objectContaining({ validationErrors }),
          );
        });

        it('works with manyArgsValidated (one failure)', async (): Promise<void> => {
          const source = print(gql`
          query {
            manyArgsValidated(arg: ${value}, alsoValidated: 12)
          }
        `);
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { manyArgsValidated: null },
          });
          expect(mockValidate).toBeCalledTimes(2);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLInt,
            getFieldArg(QueryType, 'manyArgsValidated', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { alsoValidated: 12, arg: value },
            ['arg'],
          );
          expect(mockValidate).toBeCalledWith(
            12,
            GraphQLInt,
            getFieldArg(QueryType, 'manyArgsValidated', 'alsoValidated'),
            context,
            expect.any(Object),
            undefined,
            { alsoValidated: 12, arg: value },
            ['alsoValidated'],
          );
          expect(mockResolver).toBeCalledTimes(1);
          expect(mockResolver).toBeCalledWith(
            undefined,
            {
              alsoValidated: 12, // mockImplementationOnce() so only first fails
              arg: null,
            },
            context,
            expect.objectContaining({ validationErrors }),
          );
        });

        it('works with manyArgsValidated (two failures)', async (): Promise<void> => {
          const source = print(gql`
          query {
            manyArgsValidated(arg: ${value}, alsoValidated: 12)
          }
        `);
          mockValidate.mockImplementationOnce((): void => {
            throw new ValidationError('other error');
          });
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: { manyArgsValidated: null },
          });
          expect(mockValidate).toBeCalledTimes(2);
          expect(mockValidate).toBeCalledWith(
            value,
            GraphQLInt,
            getFieldArg(QueryType, 'manyArgsValidated', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { alsoValidated: 12, arg: value },
            ['arg'],
          );
          expect(mockValidate).toBeCalledWith(
            12,
            GraphQLInt,
            getFieldArg(QueryType, 'manyArgsValidated', 'alsoValidated'),
            context,
            expect.any(Object),
            undefined,
            { alsoValidated: 12, arg: value },
            ['alsoValidated'],
          );
          expect(mockResolver).toBeCalledTimes(1);
          expect(mockResolver).toBeCalledWith(
            undefined,
            {
              alsoValidated: null,
              arg: null,
            },
            context,
            expect.objectContaining({
              validationErrors: [
                ...validationErrors,
                {
                  error: new ValidationError('other error'),
                  message: 'other error',
                  path: ['alsoValidated'],
                },
              ],
            }),
          );
        });

        it('works with deepNonNullable (deep null validated element)', async (): Promise<void> => {
          const source = print(gql`
            query {
              deepNonNullable(arg: [{ nonNullable: 1 }]) {
                nonNullable
                validationErrors {
                  path
                  message
                }
              }
            }
          `);
          mockValidate.mockReset();
          mockValidate.mockImplementation(
            // force deep failure, this must force the element to become null
            (): object => [{ nonNullable: null }],
          );
          const result = await graphql(schema, source, undefined, context);
          expect(result).toEqual({
            data: {
              deepNonNullable: {
                nonNullable: null, // only arg is non-nullable!
                validationErrors: [
                  {
                    message: 'received null where non-null is required',
                    path: ['arg', '0', 'nonNullable'],
                  },
                ],
              },
            },
          });
          expect(mockValidate).toBeCalledTimes(1);
          expect(mockValidate).toBeCalledWith(
            [{ nonNullable: 1 }],
            new GraphQLList(
              new GraphQLNonNull(
                schema.getType('DeepNonNullableInput') as GraphQLInputType,
              ),
            ),
            getFieldArg(QueryType, 'deepNonNullable', 'arg'),
            context,
            expect.any(Object),
            undefined,
            { arg: [{ nonNullable: 1 }] },
            ['arg'],
          );
          // note: mockResolver is not called, it's a custom resolver
          // that is validated based on the result.
        });
      });
    });
  });

  describe('Call validation before call output field resolve', (): void => {
    const mockValidate = jest.fn(x => x);
    class TestDirective extends ValidateDirectiveVisitor<TestDirectiveArgs> {
      public static readonly config = {
        ...ValidateDirectiveVisitor.config,
        args: {
          validate: {
            defaultValue: true,
            description: 'if true does validation',
            type: new GraphQLNonNull(GraphQLBoolean),
          },
        },
      };

      public readonly applyValidationToOutputTypesAfterOriginalResolver: Boolean = false;

      public getValidationForArgs(): ValidateFunction | undefined {
        return this.args.validate ? mockValidate : undefined;
      }
    }

    // these are handled directly by the ValidateDirectiveVisitor and
    // do NOT need addValidationResolversToSchema()!

    // these are simpler to validate since the GraphQL framework will handle
    // exceptions and all.
    // This just checks if the field is automatically wrapped, trust
    // 'field directives' works properly for the details
    const schema = makeExecutableSchema({
      schemaDirectives: {
        [name]: TestDirective,
      },
      typeDefs: [
        ...basicTypeDefs,
        gql`
            type AllValidated @${name} {
              value: Int
            }
            type FieldValidated {
              validatedField: Int @${name}
              notValidatedField: Int
            }
            type Query {
              allValidated: AllValidated
              fieldValidated: FieldValidated
            }
          `,
      ],
    });
    const AllValidatedType = schema.getType(
      'AllValidated',
    ) as GraphQLObjectType;
    const FieldValidatedType = schema.getType(
      'FieldValidated',
    ) as GraphQLObjectType;
    const context = { theContext: 63 };

    const rootValue = {
      allValidated: { value: 12 },
      fieldValidated: { notValidatedField: 15, validatedField: 12 },
    };

    beforeEach((): void => {
      mockValidate.mockReset();
      mockValidate.mockImplementationOnce(() => undefined);
    });

    it('works with output object', async (): Promise<void> => {
      const source = print(gql`
        query {
          allValidated {
            value
          }
        }
      `);
      const result = await graphql(schema, source, rootValue, context);
      expect(result).toEqual({
        data: { allValidated: { value: rootValue.allValidated.value } },
      });
      expect(mockValidate).toBeCalledTimes(1);
      expect(mockValidate).toBeCalledWith(
        undefined,
        GraphQLInt,
        AllValidatedType,
        context,
        expect.any(Object),
        rootValue.allValidated,
        {},
      );
    });

    it('works with output field', async (): Promise<void> => {
      const source = print(gql`
        query {
          fieldValidated {
            validatedField
            notValidatedField
          }
        }
      `);
      const result = await graphql(schema, source, rootValue, context);
      expect(result).toEqual({
        data: { fieldValidated: { ...rootValue.fieldValidated } },
      });
      expect(mockValidate).toBeCalledTimes(1);
      expect(mockValidate).toBeCalledWith(
        undefined,
        GraphQLInt,
        FieldValidatedType,
        context,
        expect.any(Object),
        rootValue.fieldValidated,
        {},
      );
    });
  });

  describe('input object validation', (): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockValidate = jest.fn((x: unknown): any => {
      if (typeof x === 'object') return x;
      if (typeof x === 'number') return x * 2;
      return x;
    });
    const mockResolver = jest.fn(
      (_, { arg }, __, { validationErrors = null }) => ({
        arg,
        validationErrors,
      }),
    );

    class TestDirective extends ValidateDirectiveVisitor<TestDirectiveArgs> {
      public static readonly config = {
        ...ValidateDirectiveVisitor.config,
        args: {
          ...ValidateDirectiveVisitor.config.args,
          validate: {
            defaultValue: true,
            description: 'if true does validation',
            type: new GraphQLNonNull(GraphQLBoolean),
          },
        },
      };

      public getValidationForArgs(): ValidateFunction | undefined {
        return this.args.validate ? mockValidate : undefined;
      }
    }

    beforeAll((): void => {
      mockValidate.mockClear();
      mockResolver.mockClear();
    });

    const value = 1234;

    // these are NOT handled directly by the ValidateDirectiveVisitor and
    // do MUST USE addValidationResolversToSchema()!

    it('works with deepNonNullable', async (): Promise<void> => {
      const schema = ValidateDirectiveVisitor.addValidationResolversToSchema(
        makeExecutableSchema({
          resolvers: {
            Query: {
              deepNonNullable: mockResolver,
            },
          },
          schemaDirectives: {
            [name]: TestDirective,
          },
          typeDefs: [
            ...basicTypeDefs,
            gql`
              type DeepNonNullableEntry {
                nonNullable: Int # match the input name, but is nullable to make tests easier
                notValidated: Int
              }
              type DeepNonNullableResult {
                arg: [DeepNonNullableEntry]
                validationErrors: [ValidatedInputErrorOutput!]
              }
              input DeepNonNullableInput {
                nonNullable: Int! @${name}
                notValidated: Int @${name}(validate: false)
              }
              type Query {
                deepNonNullable(
                  arg: [DeepNonNullableInput!]
                ): DeepNonNullableResult
              }
            `,
          ],
        }),
      );

      const source = print(gql`
        query {
          deepNonNullable(arg: [{ nonNullable: ${value}, notValidated: 42 }]) {
            arg {
              nonNullable
              notValidated
            }
            validationErrors {
              path
              message
            }
          }
        }
      `);
      const context = { theContext: 128 };

      const result = await graphql(schema, source, undefined, context);
      expect(result).toEqual({
        data: {
          deepNonNullable: {
            arg: [{ nonNullable: value * 2, notValidated: 42 }],
            validationErrors: null,
          },
        },
      });
      expect(mockValidate).toBeCalledTimes(1);
      expect(mockValidate).toBeCalledWith(
        value,
        GraphQLNonNullInt,
        schema.getType('DeepNonNullableInput'),
        context,
        expect.any(Object),
        undefined,
        { arg: [{ nonNullable: value, notValidated: 42 }] },
        ['arg', '0', 'nonNullable'],
      );
      expect(mockResolver).toBeCalledTimes(1);
    });

    it('works with deepNullable', async (): Promise<void> => {
      const schema = ValidateDirectiveVisitor.addValidationResolversToSchema(
        makeExecutableSchema({
          resolvers: {
            Query: {
              deepNullable: mockResolver,
            },
          },
          schemaDirectives: {
            [name]: TestDirective,
          },
          typeDefs: [
            ...basicTypeDefs,
            gql`
              type DeepNullableEntry {
                nullable: Int
              }
              type DeepNullableResult {
                arg: [DeepNullableEntry]
                validationErrors: [ValidatedInputErrorOutput!]
              }
              input YetAnotherInput {
                number: Int
              }
              input Args {
                field: String!
                moreInputs: YetAnotherInput
              }
              input NullableSubInput {
                field1: Args
                field2: Args
              }
              input DeepNullableInput {
                nullable: Int @${name}
                nullable2: NullableSubInput
                nullableString: String
                nullableStringNotSet: String
              }
              input NoValidatedFields {
                # a validated argument without validated list arguments
                # tests containsNonNull(GraphQLList) and also
                # validateInputObject() where no validation needs to be done
                list: [Int]
              }
              type Query {
                deepNullable(
                  arg: [DeepNullableInput]
                  other: NoValidatedFields @${name}
                ): DeepNullableResult
              }
            `,
          ],
        }),
      );
      const QueryType = schema.getType('Query') as GraphQLObjectType;

      const source = print(gql`
        query {
          deepNullable(arg: [{ nullable: ${value}, nullableString: null }], other: { list: [1] }) {
            arg {
              nullable
            }
            validationErrors {
              path
              message
            }
          }
        }
      `);
      const context = { theContext: 256 };

      mockValidate.mockClear();
      mockResolver.mockClear();
      const result = await graphql(schema, source, undefined, context);
      expect(result).toEqual({
        data: {
          deepNullable: {
            arg: [{ nullable: value * 2 }],
            validationErrors: null,
          },
        },
      });
      expect(mockValidate).toBeCalledTimes(2);
      expect(mockValidate).toBeCalledWith(
        value,
        GraphQLInt,
        schema.getType('DeepNullableInput'),
        context,
        expect.any(Object),
        undefined,
        {
          arg: [{ nullable: value, nullableString: null }],
          other: { list: [1] },
        },
        ['arg', '0', 'nullable'],
      );
      expect(mockValidate).toBeCalledWith(
        { list: [1] },
        schema.getType('NoValidatedFields') as GraphQLInputType,
        getFieldArg(QueryType, 'deepNullable', 'other'),
        context,
        expect.any(Object),
        undefined,
        {
          arg: [{ nullable: value, nullableString: null }],
          other: { list: [1] },
        },
        ['other'],
      );
      expect(mockResolver).toBeCalledTimes(1);
    });

    it('works with double validation', async (): Promise<void> => {
      const schema = ValidateDirectiveVisitor.addValidationResolversToSchema(
        makeExecutableSchema({
          resolvers: {
            Query: {
              test: mockResolver,
            },
          },
          schemaDirectives: {
            anotherDirective: TestDirective,
            [name]: TestDirective,
          },
          typeDefs: [
            ...basicTypeDefs,
            gql`
              type TestOutput {
                value: Int
              }
              type Test {
                arg: TestOutput
                validationErrors: [ValidatedInputErrorOutput!]
              }
              input TestInput
                @${name}
                @anotherDirective(validate: false) {
                value: Int @${name}
              }
              type Query {
                test(
                  arg: TestInput @${name}
                ): Test
              }
            `,
          ],
        }),
      );
      const QueryType = schema.getType('Query') as GraphQLObjectType;

      const source = print(gql`
        query {
          test(arg: { value: ${value} }) {
            arg {
              value
            }
            validationErrors {
              path
              message
            }
          }
        }
      `);
      const context = { theContext: 1024 };

      mockValidate.mockReset();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockValidate.mockImplementation((x: unknown): any => {
        if (typeof x === 'object') return x;
        if (typeof x === 'number') return x * 2;
        return x;
      });
      mockResolver.mockClear();
      const result = await graphql(schema, source, undefined, context);
      expect(result).toEqual({
        data: {
          test: {
            arg: { value: value * 4 },
            validationErrors: null,
          },
        },
      });
      expect(mockValidate).toBeCalledTimes(3);
      expect(mockValidate).toBeCalledWith(
        value,
        GraphQLInt,
        schema.getType('TestInput') as GraphQLInputType,
        context,
        expect.any(Object),
        undefined,
        { arg: { value } },
        ['arg', 'value'],
      );
      expect(mockValidate).toBeCalledWith(
        value * 2,
        GraphQLInt,
        schema.getType('TestInput'),
        context,
        expect.any(Object),
        undefined,
        { arg: { value } },
        ['arg', 'value'],
      );
      expect(mockValidate).toBeCalledWith(
        { value },
        schema.getType('TestInput') as GraphQLInputType,
        getFieldArg(QueryType, 'test', 'arg'),
        context,
        expect.any(Object),
        undefined,
        { arg: { value } },
        ['arg'],
      );
      expect(mockResolver).toBeCalledTimes(1);
    });
  });
});

it('expects not to stack overflow on validation resolvers generation when input field refers itself as a field', (): void => {
  const mockResolver = jest.fn((_, { arg }): object => arg);

  const generateSchemaWithRecuriseInputArray: () => GraphQLSchema = () =>
    ValidateDirectiveVisitor.addValidationResolversToSchema(
      makeExecutableSchema({
        resolvers: {
          Mutation: {
            mutationTest: mockResolver,
          },
        },
        schemaDirectives: {},
        typeDefs: [
          gql`
            input TestInput {
              a: [TestInput]
            }
            type Mutation {
              mutationTest(input: TestInput!): String
            }
          `,
        ],
      }),
    );
  const generateSchemaWithRecursiveInput: () => GraphQLSchema = () =>
    ValidateDirectiveVisitor.addValidationResolversToSchema(
      makeExecutableSchema({
        resolvers: {
          Mutation: {
            mutationTest: mockResolver,
          },
        },
        schemaDirectives: {},
        typeDefs: [
          gql`
            input TestInput {
              a: TestInput
            }
            type Mutation {
              mutationTest(input: TestInput!): String
            }
          `,
        ],
      }),
    );
  expect(generateSchemaWithRecuriseInputArray).not.toThrow();
  expect(generateSchemaWithRecursiveInput).not.toThrow();
});
