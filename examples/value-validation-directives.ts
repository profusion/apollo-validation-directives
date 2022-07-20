import { ApolloServer } from 'apollo-server';
import { makeExecutableSchema } from 'graphql-tools';
import gql from 'graphql-tag';
import type { ValidationError } from 'apollo-server-errors';

import type { GraphQLResolveInfo } from 'graphql';
import { graphql, print } from 'graphql';

import {
  listLength,
  pattern,
  range,
  stringLength,
  ValidateDirectiveVisitor,
  trim,
} from '../lib';

interface ValidationErrorsResolverInfo extends GraphQLResolveInfo {
  validationErrors?: ValidationError[];
}

const yourTypeDefs = [
  gql`
    # ValidatedInputErrorOutput and ValidatedInputError are defined by
    # ValidateDirectiveVisitor.getMissingCommonTypeDefs()
    type IntRangeExample {
      arg: Int
      validationErrors: [ValidatedInputErrorOutput!]
    }

    type FloatRangeExample {
      arg: Int
      validationErrors: [ValidatedInputErrorOutput!]
    }

    type PatternExample {
      arg: String
      validationErrors: [ValidatedInputErrorOutput!]
    }

    type StringLengthExample {
      arg: String
      validationErrors: [ValidatedInputErrorOutput!]
    }

    type ListLengthExample {
      arg: [Int]
      validationErrors: [ValidatedInputErrorOutput!]
    }

    type TrimExample {
      arg: String
      validationErrors: [ValidatedInputErrorOutput!]
    }

    type Query {
      intRangeExample(arg: Int @range(min: -10, max: 10)): IntRangeExample
      floatRangeExample(
        arg: Float @range(min: -0.5, max: 0.5)
      ): FloatRangeExample
      patternExample(
        arg: String @pattern(regexp: "[a-z]+", flags: "i")
      ): PatternExample
      stringLengthExample(
        arg: String @stringLength(min: 1, max: 3)
      ): StringLengthExample
      listLengthExample(
        arg: [Int] @listLength(min: 1, max: 100)
      ): ListLengthExample
      throwingIntRangeExample(
        arg: Int @range(min: -10, max: 10, policy: THROW)
      ): IntRangeExample
      trimExample(arg: String @trim(mode: TRIM_ALL)): TrimExample
    }
  `,
];

const argsResolver = (
  _: unknown,
  { arg }: { arg: unknown },
  __: unknown,
  { validationErrors }: ValidationErrorsResolverInfo,
): object => ({ arg, validationErrors });

const schema = makeExecutableSchema({
  resolvers: {
    Query: {
      floatRangeExample: argsResolver,
      intRangeExample: argsResolver,
      listLengthExample: argsResolver,
      patternExample: argsResolver,
      stringLengthExample: argsResolver,
      throwingIntRangeExample: argsResolver,
      trimExample: argsResolver,
    },
  },
  schemaDirectives: { listLength, pattern, range, stringLength, trim },
  typeDefs: [
    ...yourTypeDefs,
    ...ValidateDirectiveVisitor.getMissingCommonTypeDefs(),
    ...listLength.getTypeDefs(),
    ...pattern.getTypeDefs(),
    ...range.getTypeDefs(),
    ...stringLength.getTypeDefs(),
    ...trim.getTypeDefs(),
  ],
});

// needed to validate input fields!
ValidateDirectiveVisitor.addValidationResolversToSchema(schema);

// works as test and sample queries
const tests = {
  AllInvalid: {
    query: gql`
      query AllInvalid {
        floatRangeExample(arg: -1) {
          arg
          validationErrors {
            message
            path
          }
        }
        intRangeExample(arg: 100) {
          arg
          validationErrors {
            message
            path
          }
        }
        listLengthExample(arg: []) {
          arg
          validationErrors {
            message
            path
          }
        }
        patternExample(arg: "12") {
          arg
          validationErrors {
            message
            path
          }
        }
        stringLengthExample(arg: "hi there") {
          arg
          validationErrors {
            message
            path
          }
        }
      }
    `,
    result: {
      data: {
        floatRangeExample: {
          arg: null,
          validationErrors: [
            {
              message: 'Less than -0.5',
              path: ['arg'],
            },
          ],
        },
        intRangeExample: {
          arg: null,
          validationErrors: [
            {
              message: 'More than 10',
              path: ['arg'],
            },
          ],
        },
        listLengthExample: {
          arg: null,
          validationErrors: [
            {
              message: 'List Length is Less than 1',
              path: ['arg'],
            },
          ],
        },
        patternExample: {
          arg: null,
          validationErrors: [
            {
              message: 'Does not match pattern: /[a-z]+/i',
              path: ['arg'],
            },
          ],
        },
        stringLengthExample: {
          arg: null,
          validationErrors: [
            {
              message: 'String Length is More than 3',
              path: ['arg'],
            },
          ],
        },
      },
    },
  },
  AllValid: {
    query: gql`
      query AllValid {
        floatRangeExample(arg: 0) {
          arg
          validationErrors {
            message
            path
          }
        }
        intRangeExample(arg: 1) {
          arg
          validationErrors {
            message
            path
          }
        }
        listLengthExample(arg: [1, 2]) {
          arg
          validationErrors {
            message
            path
          }
        }
        patternExample(arg: "hello") {
          arg
          validationErrors {
            message
            path
          }
        }
        stringLengthExample(arg: "hi") {
          arg
          validationErrors {
            message
            path
          }
        }
        trimExample(arg: ${JSON.stringify(
          ' \t \r \n \r\n  trimmed!   \n\n \t \r\n',
        )}){
          arg
          validationErrors {
            message
            path
          }
        }
      }
    `,
    result: {
      data: {
        floatRangeExample: {
          arg: 0,
          validationErrors: null,
        },
        intRangeExample: {
          arg: 1,
          validationErrors: null,
        },
        listLengthExample: {
          arg: [1, 2],
          validationErrors: null,
        },
        patternExample: {
          arg: 'hello',
          validationErrors: null,
        },
        stringLengthExample: {
          arg: 'hi',
          validationErrors: null,
        },
        trimExample: {
          arg: 'trimmed!',
          validationErrors: null,
        },
      },
    },
  },
  Throwing: {
    query: gql`
      query Throwing {
        throwingIntRangeExample(arg: 100) {
          arg
          validationErrors {
            message
            path
          }
        }
      }
    `,
    result: {
      // keep same order as in GQL so JSON.stringify() serializes the same
      /* eslint-disable sort-keys */
      errors: [
        {
          message: 'More than 10',
          locations: [
            {
              line: 2,
              column: 3,
            },
          ],
          path: ['throwingIntRangeExample'],
          extensions: {
            code: 'GRAPHQL_VALIDATION_FAILED',
            validation: {
              path: ['arg'],
            },
          },
        },
      ],
      data: {
        throwingIntRangeExample: null,
      },
    },
    /* eslint-enable sort-keys */
  },
};

const test = async (): Promise<void[]> =>
  Promise.all(
    Object.entries(tests).map(
      async ([name, { query, result: expected }]): Promise<void> => {
        const source = print(query);
        const result = await graphql(schema, source);
        if (JSON.stringify(result) !== JSON.stringify(expected)) {
          throw Error(`test ${name} failed`);
        }
        // eslint-disable-next-line no-console
        console.log(`✅ test ${name} works:\n${source}\n`);
      },
    ),
  );

test().catch(error => {
  // eslint-disable-next-line no-console
  console.error('💥test queries failed:', error);
  process.exit(1);
});

const server = new ApolloServer({ schema });
server.listen().then(({ url }) => {
  // eslint-disable-next-line no-console
  console.log(`🚀 Server ready at ${url}`);
});
