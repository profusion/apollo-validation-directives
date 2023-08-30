import {
  DirectiveLocation,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLEnumType,
  GraphQLScalarType,
  GraphQLList,
  GraphQLInt,
  GraphQLBoolean,
} from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { gql } from 'graphql-tag';

import print from './utils/printer.js';
import EasyDirectiveVisitor from './EasyDirectiveVisitor.js';

describe('EasyDirectiveVisitor', (): void => {
  const minimalTypeDef = gql`
    type T {
      i: Int
    }
  `;
  const SomeScalar = new GraphQLScalarType({
    description: 'test custom scalar',
    name: 'SomeScalar',
    serialize: (value: unknown): string => String(value),
  });
  const SomeEnum = new GraphQLEnumType({
    description: 'test custom enum',
    name: 'SomeEnum',
    values: {
      aValue: { value: 'aValue' },
      bValue: { value: 'bValue' },
    },
  });
  const SomeType = new GraphQLObjectType({
    description: 'test custom output type',
    fields: {
      out: { type: SomeScalar },
    },
    name: 'SomeType',
  });
  const SomeInput = new GraphQLInputObjectType({
    description: 'test custom input type',
    fields: {
      in: { type: SomeEnum },
    },
    name: 'SomeInput',
  });

  const commonTypes = [
    SomeType,
    new GraphQLNonNull(new GraphQLList(SomeInput)),
  ] as const;
  const locations = [
    DirectiveLocation.OBJECT,
    DirectiveLocation.INTERFACE,
  ] as const;
  const locationsStr = locations.join(' | ');
  const name = 'test';
  const commonTypeDefs: string[] = [
    `\
"""test custom output type"""
type SomeType {
  out: SomeScalar
}
`,
    `\
"""test custom input type"""
input SomeInput {
  in: SomeEnum
}
`,
    `\
"""test custom enum"""
enum SomeEnum {
  aValue
  bValue
}
`,
  ];

  describe('Directive Without Args', (): void => {
    class DirectiveWithoutArgs extends EasyDirectiveVisitor<
      Record<string, never>,
      Record<string, never>
    > {
      public static readonly commonTypes = commonTypes;

      public static readonly config = { locations } as const;
    }

    describe('getMissingCommonTypeDefs()', (): void => {
      it('is correct without schema', (): void => {
        expect(
          DirectiveWithoutArgs.getMissingCommonTypeDefs().map(print),
        ).toEqual(commonTypeDefs);
      });

      it('is correct with minimum schema', (): void => {
        const schema = makeExecutableSchema({ typeDefs: minimalTypeDef });
        expect(
          DirectiveWithoutArgs.getMissingCommonTypeDefs(schema).map(print),
        ).toEqual(commonTypeDefs);
      });

      it('is correct with existing common types', (): void => {
        const schema = makeExecutableSchema({
          typeDefs: [
            minimalTypeDef,
            gql`
              scalar SomeScalar
              enum SomeEnum {
                aValue
                bValue
              }
              type SomeType {
                out: SomeScalar
              }
              input SomeInput {
                in: SomeInput
              }
            `,
          ],
        });
        expect(
          DirectiveWithoutArgs.getMissingCommonTypeDefs(schema).map(print),
        ).toEqual([]);
      });
    });

    describe('getDirectiveDeclaration', (): void => {
      it('creates one if none exists', (): void => {
        const schema = makeExecutableSchema({ typeDefs: minimalTypeDef });
        const directive = DirectiveWithoutArgs.getDirectiveDeclaration(
          name,
          schema,
        );
        const conf = directive.toConfig();
        expect(conf).toEqual({
          args: {},
          astNode: undefined,
          description: undefined,
          extensions: {},
          isRepeatable: false,
          locations,
          name,
        });
      });

      it('patches, if already exists, to guarantee essential location', (): void => {
        const schema = makeExecutableSchema({
          typeDefs: [
            minimalTypeDef,
            gql`
              # location will be extended to be all locations
              directive @${name}(
                alien: Int = 123
              ) on OBJECT | ARGUMENT_DEFINITION
            `,
          ],
        });
        const directive = DirectiveWithoutArgs.getDirectiveDeclaration(
          name,
          schema,
        );
        const conf = directive.toConfig();
        expect(conf.args).toEqual({
          alien: {
            // left untouched
            astNode: expect.objectContaining({
              name: expect.objectContaining({ kind: 'Name', value: 'alien' }),
            }),
            defaultValue: 123,
            deprecationReason: undefined,
            description: undefined,
            extensions: {},
            type: GraphQLInt,
          },
        });
        expect(conf.name).toEqual(name);
        expect(conf.locations).toEqual([
          // will be first, since it was declared in DSL
          DirectiveLocation.OBJECT,
          DirectiveLocation.ARGUMENT_DEFINITION,
          // these will be later, as they are pushed into the array
          DirectiveLocation.INTERFACE,
        ]);
      });
    });

    describe('getTypeDefs()', (): void => {
      const schema = makeExecutableSchema({ typeDefs: minimalTypeDef });
      const expectedDirectiveTypeDef = `directive @${name} on ${locationsStr}\n`;
      it('works with includeUnknownTypes=true, includeCommonTypes=false', (): void => {
        expect(
          DirectiveWithoutArgs.getTypeDefs(name, schema, true, false).map(
            print,
          ),
        ).toEqual([expectedDirectiveTypeDef]);
      });

      it('works with includeUnknownTypes=false, includeCommonTypes=false', (): void => {
        expect(
          DirectiveWithoutArgs.getTypeDefs(name, schema, false, false).map(
            print,
          ),
        ).toEqual([expectedDirectiveTypeDef]);
      });

      it('works with includeUnknownTypes=false, includeCommonTypes=true', (): void => {
        expect(
          DirectiveWithoutArgs.getTypeDefs(name, schema, false, true).map(
            print,
          ),
        ).toEqual([expectedDirectiveTypeDef, ...commonTypeDefs]);
      });

      it('works with default parameters', (): void => {
        expect(DirectiveWithoutArgs.getTypeDefs(name).map(print)).toEqual([
          expectedDirectiveTypeDef,
          ...commonTypeDefs,
        ]);
      });

      it('works with repeatable directive', (): void => {
        class RepeatableDirective extends DirectiveWithoutArgs {
          public static readonly config = {
            ...DirectiveWithoutArgs.config,
            isRepeatable: true,
          } as const;
        }
        expect(
          RepeatableDirective.getTypeDefs(name, schema, false, false).map(
            print,
          ),
        ).toEqual([`directive @${name} repeatable on ${locationsStr}\n`]);
      });

      it('works with description', (): void => {
        class DescriptionDirective extends DirectiveWithoutArgs {
          public static readonly config = {
            ...DirectiveWithoutArgs.config,
            description: 'Some Docs Here',
          } as const;
        }
        expect(
          DescriptionDirective.getTypeDefs(name, schema, false, false).map(
            print,
          ),
        ).toEqual([`"""Some Docs Here"""\n${expectedDirectiveTypeDef}`]);
      });
    });
  });

  describe('Directive With Args', (): void => {
    class DirectiveWithArgs extends EasyDirectiveVisitor<
      Record<string, never>,
      Record<string, never>
    > {
      public static readonly commonTypes = commonTypes;

      public static readonly config = {
        args: {
          bool: {
            type: GraphQLBoolean,
          },
          complex: {
            defaultValue: [{ field: { value: 42 } }],
            description: 'some docs for complex argument',
            type: new GraphQLNonNull(
              new GraphQLList(
                new GraphQLInputObjectType({
                  description: 'Input Type Description',
                  fields: {
                    field: {
                      defaultValue: { value: 0 },
                      description: 'complex field',
                      type: new GraphQLNonNull(
                        new GraphQLInputObjectType({
                          fields: {
                            value: { type: GraphQLInt },
                          },
                          name: 'NestedInputType',
                        }),
                      ),
                    },
                  },
                  name: 'InputType',
                }),
              ),
            ),
          },
          customEnum: {
            defaultValue: 'enumValueHere',
            type: new GraphQLEnumType({
              name: 'CustomEnum',
              values: {
                enumValueHere: { value: 'enumValueHere' },
                otherValueHere: { value: 'otherValueHere' },
              },
            }),
          },
          int: {
            defaultValue: 12,
            type: GraphQLInt,
          },
          nullField: {
            defaultValue: null,
            type: GraphQLInt,
          },
        },
        locations,
      } as const;
    }

    const expectedArgs = {
      bool: {
        ...DirectiveWithArgs.config.args.bool,
        astNode: undefined,
        defaultValue: undefined,
        deprecationReason: undefined,
        description: undefined,
        extensions: {},
      },
      complex: {
        ...DirectiveWithArgs.config.args.complex,
        astNode: undefined,
        deprecationReason: undefined,
        extensions: {},
      },
      customEnum: {
        ...DirectiveWithArgs.config.args.customEnum,
        astNode: undefined,
        deprecationReason: undefined,
        description: undefined,
        extensions: {},
      },
      int: {
        ...DirectiveWithArgs.config.args.int,
        astNode: undefined,
        deprecationReason: undefined,
        description: undefined,
        extensions: {},
      },
      nullField: {
        ...DirectiveWithArgs.config.args.nullField,
        astNode: undefined,
        deprecationReason: undefined,
        description: undefined,
        extensions: {},
      },
    };

    describe('getDirectiveDeclaration', (): void => {
      it('creates one if none exists', (): void => {
        const schema = makeExecutableSchema({ typeDefs: minimalTypeDef });
        const directive = DirectiveWithArgs.getDirectiveDeclaration(
          name,
          schema,
        );
        const conf = directive.toConfig();
        expect(conf).toEqual({
          args: expectedArgs,
          astNode: undefined,
          description: undefined,
          extensions: {},
          isRepeatable: false,
          locations,
          name,
        });
      });

      it('patches, if already exists, to guarantee essential args', (): void => {
        const schema = makeExecutableSchema({
          typeDefs: [
            minimalTypeDef,
            gql`
              # location will be extended to be all locations
              directive @${name}(
                alien: Int = 123
              ) on OBJECT | ARGUMENT_DEFINITION
            `,
          ],
        });
        const directive = DirectiveWithArgs.getDirectiveDeclaration(
          name,
          schema,
        );
        const conf = directive.toConfig();
        expect(conf.args).toEqual({
          ...expectedArgs,
          alien: {
            // left untouched
            astNode: expect.objectContaining({
              name: expect.objectContaining({ kind: 'Name', value: 'alien' }),
            }),
            defaultValue: 123,
            deprecationReason: undefined,
            description: undefined,
            extensions: {},
            type: GraphQLInt,
          },
        });
        expect(conf.name).toEqual(name);
        expect(conf.locations).toEqual([
          // will be first, since it was declared in DSL
          DirectiveLocation.OBJECT,
          DirectiveLocation.ARGUMENT_DEFINITION,
          // these will be later, as they are pushed into the array
          DirectiveLocation.INTERFACE,
        ]);
      });

      it('patches, if already exists, to guarantee essential arg type', (): void => {
        const schema = makeExecutableSchema({
          typeDefs: [
            minimalTypeDef,
            gql`
              # location will be extended to be all locations
              directive @${name}(
                """Docs will be kept"""
                bool: Int # will be fixed!
              ) on ${locationsStr}
            `,
          ],
        });
        const directive = DirectiveWithArgs.getDirectiveDeclaration(
          name,
          schema,
        );
        const conf = directive.toConfig();
        expect(conf.args).toEqual({
          ...expectedArgs,
          bool: {
            ...expectedArgs.bool,
            astNode: expect.objectContaining({
              name: expect.objectContaining({ kind: 'Name', value: 'bool' }),
            }),
            description: 'Docs will be kept',
            extensions: {},
          },
        });
        expect(conf.name).toEqual(name);
        expect(conf.locations).toEqual(locations);
      });
    });

    describe('getTypeDefs()', (): void => {
      const schema = makeExecutableSchema({ typeDefs: minimalTypeDef });
      const expectedDirectiveTypeDef = `\
directive @${name}(
  bool: Boolean
  """some docs for complex argument"""
  complex: [InputType]! = [{field: {value: 42}}]
  customEnum: CustomEnum = enumValueHere
  int: Int = 12
  nullField: Int = null
) on ${locationsStr}
`;
      it('works with includeUnknownTypes=true, includeCommonTypes=true', (): void => {
        expect(
          DirectiveWithArgs.getTypeDefs(name, schema, true, true).map(print),
        ).toEqual([
          expectedDirectiveTypeDef,
          `\
"""Input Type Description"""
input InputType {
  """complex field"""
  field: NestedInputType! = {value: 0}
}
`,
          `\
input NestedInputType {
  value: Int
}
`,
          `\
enum CustomEnum {
  enumValueHere
  otherValueHere
}
`,
          ...commonTypeDefs,
        ]);
      });
    });
  });
});
