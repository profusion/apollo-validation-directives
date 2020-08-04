import {
  defaultFieldResolver,
  DirectiveLocation,
  graphql,
  GraphQLError,
  GraphQLField,
  GraphQLResolveInfo,
} from 'graphql';
import { print } from 'graphql/language/printer';
import { gql, makeExecutableSchema } from 'apollo-server';
import { ForbiddenError } from 'apollo-server-errors';

import {
  debugFilterMissingPermissions,
  debugGetErrorMessage,
  HasPermissionsDirectiveVisitor,
  prodFilterMissingPermissions,
  prodGetErrorMessage,
  MissingPermissionsResolverInfo,
} from './hasPermissions';

import EasyDirectiveVisitor from './EasyDirectiveVisitor';

describe('@hasPermissions()', (): void => {
  const name = 'hasPermissions';
  const directiveTypeDefs = HasPermissionsDirectiveVisitor.getTypeDefs(name);

  it('exports correct typeDefs', (): void => {
    expect(directiveTypeDefs.map(print)).toEqual([
      `\
"""ensures it has permissions before calling the resolver"""
directive @${name}(
  """All permissions required by this field (or object). All must be fulfilled"""
  permissions: [String!]!
  """How to handle missing permissions"""
  policy: HasPermissionsDirectivePolicy = THROW
) on OBJECT | FIELD_DEFINITION
`,
      `\
enum HasPermissionsDirectivePolicy {
  """Field resolver is responsible to evaluate it using \`missingPermissions\` injected argument"""
  RESOLVER
  """Field resolver is not called if permissions are missing, it throws \`ForbiddenError\`"""
  THROW
}
`,
    ]);
  });

  it('defaultName is correct', (): void => {
    expect(directiveTypeDefs.map(print)).toEqual(
      HasPermissionsDirectiveVisitor.getTypeDefs().map(print),
    );
  });

  const grantedPermissions = ['x', 'y', 'z', 'xpto'];

  const createEmailResolver = (key = 'email') => (
    fields: { [key: string]: string },
    _: unknown,
    __: unknown,
    { missingPermissions }: MissingPermissionsResolverInfo,
  ): string => {
    const email = fields[key];
    if (missingPermissions) {
      const [user, domain] = email.split('@');
      return `${user[0]}${'*'.repeat(user.length - 1)}@${domain}`;
    }
    return email;
  };

  describe('filterMissingPermissions', (): void => {
    const requiredPermissions = ['x', 'y', 'z'];
    describe('debugFilterMissingPermissions()', (): void => {
      it('returns all if nothing is granted', (): void => {
        expect(
          debugFilterMissingPermissions(undefined, requiredPermissions),
        ).toBe(requiredPermissions);
      });
      it('returns all missing', (): void => {
        expect(
          debugFilterMissingPermissions(new Set(['x']), requiredPermissions),
        ).toEqual(['y', 'z']);
      });
      it('returns null if all granted', (): void => {
        expect(
          debugFilterMissingPermissions(
            new Set(requiredPermissions),
            requiredPermissions,
          ),
        ).toBe(null);
      });
    });

    describe('prodFilterMissingPermissions()', (): void => {
      it('returns all if nothing is granted', (): void => {
        expect(
          prodFilterMissingPermissions(undefined, requiredPermissions),
        ).toBe(requiredPermissions);
      });
      it('returns first missing', (): void => {
        expect(
          prodFilterMissingPermissions(new Set(['x']), requiredPermissions),
        ).toEqual(['y']);
      });
      it('returns null if all granted', (): void => {
        expect(
          prodFilterMissingPermissions(
            new Set(requiredPermissions),
            requiredPermissions,
          ),
        ).toBe(null);
      });
    });
  });

  describe('getErrorMessage', (): void => {
    it('debugGetErrorMessage() is verbose', (): void => {
      expect(debugGetErrorMessage(['x', 'y'])).toBe(
        'Missing Permissions: x, y',
      );
    });
    it('prodGetErrorMessage() is terse', (): void => {
      expect(prodGetErrorMessage()).toBe('Missing Permissions');
    });
  });

  describe('createDirectiveContext()', (): void => {
    it('supports list of permissions', (): void => {
      const ctx = HasPermissionsDirectiveVisitor.createDirectiveContext({
        filterMissingPermissions: debugFilterMissingPermissions,
        grantedPermissions,
      });
      expect(
        ctx.checkMissingPermissions(
          ['x'],
          'ck1',
          {},
          {},
          {},
          {} as GraphQLResolveInfo,
        ),
      ).toBe(null);

      const cacheKey = 'ck2';
      const missingPermissions = ctx.checkMissingPermissions(
        ['a', 'b'],
        cacheKey,
        {},
        {},
        {},
        {} as GraphQLResolveInfo,
      );
      expect(missingPermissions).toEqual(['a', 'b']);
      expect(
        ctx.checkMissingPermissions(
          ['a', 'b'],
          cacheKey,
          {},
          {},
          {},
          {} as GraphQLResolveInfo,
        ),
      ).toBe(missingPermissions); // cache must return the same list!
    });

    it('supports no granted permission', (): void => {
      const ctx = HasPermissionsDirectiveVisitor.createDirectiveContext({
        filterMissingPermissions: debugFilterMissingPermissions,
        grantedPermissions: undefined,
      });
      expect(
        ctx.checkMissingPermissions(
          ['x', 'y'],
          'ck1',
          {},
          {},
          {},
          {} as GraphQLResolveInfo,
        ),
      ).toEqual(['x', 'y']);
    });

    it('use default filterMissingPermissions', (): void => {
      const ctx = HasPermissionsDirectiveVisitor.createDirectiveContext({
        grantedPermissions: undefined,
      });
      expect(
        ctx.checkMissingPermissions(
          ['x', 'y'],
          'ck1',
          {},
          {},
          {},
          {} as GraphQLResolveInfo,
        ),
      ).toContain('x');
    });
  });

  describe('HasPermissionsDirectiveVisitor', (): void => {
    describe('works on object field', (): void => {
      const schema = makeExecutableSchema({
        resolvers: {
          SomeObject: {
            email: createEmailResolver(),
          },
        },
        schemaDirectives: {
          [name]: HasPermissionsDirectiveVisitor,
        },
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            type SomeObject {
              onlyAllowedMayRead: Int @${name}(permissions: ["x", "y"])
              email: String
                @${name}(permissions: ["x"], policy: RESOLVER)
              publicField: String
              alsoPublic: String @${name}(permissions: [])
            }
            type Query {
              test: SomeObject
            }
          `,
        ],
      });
      const source = print(gql`
        query {
          test {
            onlyAllowedMayRead
            email
            publicField
            alsoPublic
          }
        }
      `);
      const rootValue = {
        test: {
          alsoPublic: 'world',
          email: 'user@server.com',
          onlyAllowedMayRead: 42,
          publicField: 'hello',
        },
      };

      it('if hasPermissions, returns all', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions,
        });
        const result = await graphql(schema, source, rootValue, context);
        expect(result).toEqual({
          data: rootValue,
        });
      });

      it('if NOT hasPermissions, returns partial', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(schema, source, rootValue, context);
        expect(result).toEqual({
          data: {
            test: {
              alsoPublic: rootValue.test.alsoPublic,
              email: 'u***@server.com',
              onlyAllowedMayRead: null,
              publicField: rootValue.test.publicField,
            },
          },
          errors: [new ForbiddenError('Missing Permissions: x, y')],
        });
      });
    });

    describe('works on whole object', (): void => {
      const schema = makeExecutableSchema({
        resolvers: {
          MyRestrictedObject: {
            maskedEmail: createEmailResolver('maskedEmail'),
            secondMaskedEmail: createEmailResolver('secondMaskedEmail'),
          },
          TwoResolver: {
            missingPermissions: (
              _,
              __,
              ___,
              { missingPermissions }: MissingPermissionsResolverInfo,
            ): string[] | null => missingPermissions || null,
          },
        },
        schemaDirectives: {
          [name]: HasPermissionsDirectiveVisitor,
        },
        typeDefs: [
          ...directiveTypeDefs,
          gql`
            type MyRestrictedObject @${name}(permissions: ["x"]) {
              restrictedField: Int # behaves as @hasPermissions(permissions: ["x"])
              anotherRestrictedField: String # behaves as @hasPermissions(permissions: ["x"])
              restrictedTwice: Int @${name}(permissions: ["y"])
              maskedEmail: String @${name}(permissions: ["z"], policy: RESOLVER)
              secondMaskedEmail: String @${name}(permissions: ["xpto"], policy: RESOLVER)
            }
            type TwoResolver @${name}(permissions: ["y"], policy: RESOLVER) {
              missingPermissions: [String! ]@${name}(permissions: ["z"], policy: RESOLVER)
            }
            type Query {
              test: MyRestrictedObject
              twoResolver: TwoResolver
            }
          `,
        ],
      });
      const source = print(gql`
        query {
          test {
            restrictedField
            anotherRestrictedField
            restrictedTwice
            maskedEmail
            secondMaskedEmail
          }
        }
      `);
      const rootValue = {
        test: {
          anotherRestrictedField: 'hello',
          maskedEmail: 'user@server.com',
          restrictedField: 42,
          restrictedTwice: 123,
          secondMaskedEmail: 'address@email.com',
        },
      };

      it('if hasPermissions, returns all', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions,
        });
        const result = await graphql(schema, source, rootValue, context);
        expect(result).toEqual({
          data: rootValue,
        });
      });

      it('if NOT hasPermissions, returns partial', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(schema, source, rootValue, context);
        expect(result).toEqual({
          data: {
            test: {
              anotherRestrictedField: null,
              maskedEmail: null,
              restrictedField: null,
              restrictedTwice: null,
              secondMaskedEmail: null,
            },
          },
          errors: [
            new ForbiddenError('Missing Permissions: x'),
            new ForbiddenError('Missing Permissions: x'),
            new ForbiddenError('Missing Permissions: y'),
            new ForbiddenError('Missing Permissions: x'),
            new ForbiddenError('Missing Permissions: x'),
          ],
        });
      });

      it('combined hasPermissions', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: ['x'],
        });
        const result = await graphql(schema, source, rootValue, context);
        expect(result).toEqual({
          data: {
            test: {
              anotherRestrictedField: rootValue.test.anotherRestrictedField,
              maskedEmail: 'u***@server.com',
              restrictedField: rootValue.test.restrictedField,
              restrictedTwice: null,
              secondMaskedEmail: 'a******@email.com',
            },
          },
          errors: [new ForbiddenError('Missing Permissions: y')],
        });
      });

      it('combined hasPermissions 2', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: ['y'],
        });
        const result = await graphql(schema, source, rootValue, context);
        expect(result).toEqual({
          data: {
            test: {
              anotherRestrictedField: null,
              maskedEmail: null,
              restrictedField: null,
              restrictedTwice: null,
              secondMaskedEmail: null,
            },
          },
          errors: [
            new ForbiddenError('Missing Permissions: x'),
            new ForbiddenError('Missing Permissions: x'),
            new ForbiddenError('Missing Permissions: x'),
            new ForbiddenError('Missing Permissions: x'),
            new ForbiddenError('Missing Permissions: x'),
          ],
        });
      });

      it('combined hasPermissions 3', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: ['x', 'xpto'],
        });
        const result = await graphql(schema, source, rootValue, context);
        expect(result).toEqual({
          data: {
            test: {
              anotherRestrictedField: rootValue.test.anotherRestrictedField,
              maskedEmail: 'u***@server.com',
              restrictedField: rootValue.test.restrictedField,
              restrictedTwice: null,
              secondMaskedEmail: 'address@email.com',
            },
          },
          errors: [new ForbiddenError('Missing Permissions: y')],
        });
      });

      it('combined hasPermissions 4', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: ['x', 'z'],
        });
        const result = await graphql(schema, source, rootValue, context);
        expect(result).toEqual({
          data: {
            test: {
              anotherRestrictedField: rootValue.test.anotherRestrictedField,
              maskedEmail: 'user@server.com',
              restrictedField: rootValue.test.restrictedField,
              restrictedTwice: null,
              secondMaskedEmail: 'a******@email.com',
            },
          },
          errors: [new ForbiddenError('Missing Permissions: y')],
        });
      });

      it('two policy: RESOLVER missing permissions', async (): Promise<
        void
      > => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: ['x'],
        });
        const result = await graphql(
          schema,
          print(gql`
            query {
              twoResolver {
                missingPermissions
              }
            }
          `),
          { twoResolver: {} },
          context,
        );
        expect(result).toEqual({
          data: {
            twoResolver: {
              missingPermissions: ['y', 'z'],
            },
          },
        });
      });
    });
  });

  it('throws if missingPermissions argument type is wrong', async (): Promise<
    void
  > => {
    class InjectMissingPermissions extends EasyDirectiveVisitor<{}> {
      public static readonly config: typeof EasyDirectiveVisitor['config'] = {
        locations: [DirectiveLocation.FIELD_DEFINITION],
      };

      public static readonly defaultName: string = 'injectMissingPermissions';

      // eslint-disable-next-line class-methods-use-this
      public visitFieldDefinition(field: GraphQLField<unknown, {}>): void {
        const { resolve = defaultFieldResolver } = field;
        // eslint-disable-next-line no-param-reassign
        field.resolve = function (obj, args, context, info): unknown {
          const enhancedInfo = {
            ...info,
            missingPermissions: 'This should be an array!',
          };
          return resolve.apply(this, [obj, args, context, enhancedInfo]);
        };
      }
    }
    const schema = makeExecutableSchema({
      schemaDirectives: {
        injectMissingPermissions: InjectMissingPermissions,
        [name]: HasPermissionsDirectiveVisitor,
      },
      typeDefs: [
        ...directiveTypeDefs,
        ...InjectMissingPermissions.getTypeDefs(),
        gql`
            type Query {
              test: Boolean @${name}(permissions: ["z"]) @injectMissingPermissions
            }
          `,
      ],
    });
    const result = await graphql(
      schema,
      print(gql`
        query {
          test
        }
      `),
      { test: true },
      HasPermissionsDirectiveVisitor.createDirectiveContext({
        filterMissingPermissions: debugFilterMissingPermissions,
        grantedPermissions,
      }),
    );
    expect(result).toEqual({
      data: { test: null },
      errors: [
        new GraphQLError('The missingPermissions field is not an array!'),
      ],
    });
  });
});
