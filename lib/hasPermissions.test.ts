import type {
  GraphQLField,
  GraphQLObjectType,
  GraphQLResolveInfo,
} from 'graphql';
import {
  defaultFieldResolver,
  DirectiveLocation,
  graphql,
  GraphQLError,
} from 'graphql';
import { print } from 'graphql/language/printer';
import { makeExecutableSchema } from 'graphql-tools';
import gql from 'graphql-tag';
import { ForbiddenError } from 'apollo-server-errors';

import type { MissingPermissionsResolverInfo } from './hasPermissions';
import {
  debugFilterMissingPermissions,
  debugGetErrorMessage,
  HasPermissionsDirectiveVisitor,
  prodFilterMissingPermissions,
  prodGetErrorMessage,
  getDefaultValue,
} from './hasPermissions';

import EasyDirectiveVisitor from './EasyDirectiveVisitor';
import ValidateDirectiveVisitor from './ValidateDirectiveVisitor';

describe('@hasPermissions()', (): void => {
  const name = 'hasPermissions';
  const directiveTypeDefs = HasPermissionsDirectiveVisitor.getTypeDefs(name);

  const defaultValuePermission = `If use the default value, don't need this permission`;
  const noDefaultListValuePermission = `I don't has default list value in here`;
  const skipOnNullDefaultField = `skip this permission on null equal default field`;
  const noPermissionToUseThisInputOrArgument = `no Permission to use this`;
  const notProvidedField = `Not provided Field`;
  const permissionX = `x`;
  const permissionY = `y`;
  const permissionZ = `z`;
  const permissionXPTO = `xpto`;

  it('exports correct typeDefs', (): void => {
    expect(directiveTypeDefs.map(print)).toEqual([
      `\
"""ensures it has permissions before calling the resolver"""
directive @${name}(
  """All permissions required by this field (or object). All must be fulfilled"""
  permissions: [String!]!
  """How to handle missing permissions"""
  policy: HasPermissionsDirectivePolicy = THROW
) on ARGUMENT_DEFINITION | FIELD_DEFINITION | INPUT_FIELD_DEFINITION | INPUT_OBJECT | OBJECT
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

  it('if pass to the getDefaultValue function, a container with a different type than Argument or InputObjectType, return undefined', async (): Promise<void> => {
    const container = {};

    expect(getDefaultValue(container as GraphQLObjectType)).toEqual(undefined);
  });

  const grantedPermissions = [
    permissionX,
    permissionY,
    permissionZ,
    permissionXPTO,
  ];

  const createEmailResolver =
    (key = 'email') =>
    (
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
    const requiredPermissions = [permissionX, permissionY, permissionZ];
    describe('debugFilterMissingPermissions()', (): void => {
      it('returns all if nothing is granted', (): void => {
        expect(
          debugFilterMissingPermissions(undefined, requiredPermissions),
        ).toBe(requiredPermissions);
      });
      it('returns all missing', (): void => {
        expect(
          debugFilterMissingPermissions(
            new Set([permissionX]),
            requiredPermissions,
          ),
        ).toEqual([permissionY, permissionZ]);
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
          prodFilterMissingPermissions(
            new Set([permissionX]),
            requiredPermissions,
          ),
        ).toEqual([permissionY]);
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
      expect(debugGetErrorMessage([permissionX, permissionY])).toBe(
        `Missing Permissions: ${permissionX}, ${permissionY}`,
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
          [permissionX],
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
          [permissionX, permissionY],
          'ck1',
          {},
          {},
          {},
          {} as GraphQLResolveInfo,
        ),
      ).toEqual([permissionX, permissionY]);
    });

    it('use default filterMissingPermissions', (): void => {
      const ctx = HasPermissionsDirectiveVisitor.createDirectiveContext({
        grantedPermissions: undefined,
      });
      expect(
        ctx.checkMissingPermissions(
          [permissionX, permissionY],
          'ck1',
          {},
          {},
          {},
          {} as GraphQLResolveInfo,
        ),
      ).toContain(permissionX);
    });
  });

  describe('HasPermissionsDirectiveVisitor', (): void => {
    describe('works on type object field', (): void => {
      const schema = ValidateDirectiveVisitor.addValidationResolversToSchema(
        makeExecutableSchema({
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
              onlyAllowedMayRead: Int @${name}(permissions: ["${permissionX}", "${permissionY}"])
              email: String
                @${name}(permissions: ["${permissionX}"], policy: RESOLVER)
              publicField: String
              alsoPublic: String @${name}(permissions: [])
            }
            type Query {
              test: SomeObject
            }
          `,
          ],
        }),
      );
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
          errors: [
            new ForbiddenError(
              `Missing Permissions: ${permissionX}, ${permissionY}`,
            ),
          ],
        });
      });
    });

    describe('works on input object field', (): void => {
      const mockResolver = jest.fn(() => {
        return 'resolverReturn';
      });

      beforeEach((): void => {
        mockResolver.mockClear();
      });

      const schema = ValidateDirectiveVisitor.addValidationResolversToSchema(
        makeExecutableSchema({
          resolvers: {
            Query: {
              test: mockResolver,
            },
          },
          schemaDirectives: {
            [name]: HasPermissionsDirectiveVisitor,
          },
          typeDefs: [
            ...directiveTypeDefs,
            gql`
            input InputObject {
              onlyAllowedMayRead: Int @${name}(permissions: ["${permissionX}"])
              email: String
                @${name}(permissions: ["${permissionX}", "${permissionY}"], policy: RESOLVER)
              publicField: String
              alsoPublic: String @${name}(permissions: [])
              """
              I don't have this permission, but I'll providing the default input value 'null', so it should not care
              """
              skipOnNullDefaultField: String = null @${name}(permissions: ["${skipOnNullDefaultField}"])
              notProvidedField: String @${name}(permissions: ["${notProvidedField}"])
              """
              I don't have this permission, but If I pass the value equal to null, this will be generate error of permission,
              because null is different the default value
              """
              defaultValue: String = "defaultValue" @${name}(permissions: ["${defaultValuePermission}"])
            }

            input SecondInput  {
              number: Int @${name}(permissions: ["${noPermissionToUseThisInputOrArgument}"])
            }

            input ThirdInput {
              defaultListValue: [Int!] = [10, 2] @${name}(permissions: ["${defaultValuePermission}"])
              noDefaultListValue: [Int!] @${name}(permissions: ["${noDefaultListValuePermission}"])
            }

            input defaultObject {
              number: Int = 10 @${name}(permissions: ["${defaultValuePermission}"])
              name: String = "defaultObject" @${name}(permissions: ["${defaultValuePermission}"])
            }
            
            input FourthInput {
              defaultObjectValue: defaultObject
            }

            input defaultArrayObject {
              name: String = "defaultArrayObject" @${name}(permissions: ["${defaultValuePermission}"])
            }

            input FifthInput {
              defaultArrayObjectValue: [defaultArrayObject!]
            }

            type Query {
              test(arg: InputObject, arg2: SecondInput, arg3: ThirdInput, arg4: FourthInput, arg5: FifthInput,
              number: Int @${name}(permissions: ["${noPermissionToUseThisInputOrArgument}"])): String
            }
          `,
          ],
        }),
      );
      const source = print(gql`
        query {
          test(
            arg: {
              alsoPublic: "world"
              email: "user@server.com"
              onlyAllowedMayRead: 42
              publicField: "hello"
              skipOnNullDefaultField: null
            }
          )
        }
      `);

      const sourceDefault = print(gql`
        query {
          test(
            arg: {
              alsoPublic: "world"
              defaultValue: null
              email: "user@server.com"
              onlyAllowedMayRead: 42
              publicField: "hello"
              skipOnNullDefaultField: null
            }
          )
        }
      `);

      const sourceDefaultListValue = print(gql`
        query {
          test(arg3: { defaultListValue: [10, 2] })
        }
      `);

      const sourceDefaultListValue2 = print(gql`
        query {
          test(arg3: { defaultListValue: [8, 2] })
        }
      `);

      const sourceNoDefaultListValue = print(gql`
        query {
          test(arg3: { noDefaultListValue: [10, 2] })
        }
      `);

      const sourceDefaultObjectValue = print(gql`
        query {
          test(
            arg4: { defaultObjectValue: { number: 10, name: "defaultObject" } }
          )
        }
      `);

      const sourceDefaultArrayObjectValue = print(gql`
        query {
          test(
            arg5: {
              defaultArrayObjectValue: [
                { name: "defaultArrayObject" }
                { name: "defaultArrayObject" }
              ]
            }
          )
        }
      `);

      const sourceDefaultArrayObjectValue2 = print(gql`
        query {
          test(
            arg5: {
              defaultArrayObjectValue: [
                { name: "defaultArrayObject" }
                { name: "defaultArrayObject2" }
              ]
            }
          )
        }
      `);

      it('if has all permissions, pass all arguments to resolver', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions,
        });
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: {
            test: 'resolverReturn',
          },
        });
        expect(mockResolver).toBeCalledWith(
          undefined,
          {
            arg: {
              alsoPublic: 'world',
              defaultValue: 'defaultValue',
              email: 'user@server.com',
              onlyAllowedMayRead: 42,
              publicField: 'hello',
              skipOnNullDefaultField: null,
            },
          },
          context,
          expect.any(Object),
        );
      });

      it('if NOT has permissions for a field, and pass the default list value, pass the argument to resolver', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(
          schema,
          sourceDefaultListValue,
          undefined,
          context,
        );
        expect(result).toEqual({
          data: {
            test: 'resolverReturn',
          },
        });
        expect(mockResolver).toBeCalledWith(
          undefined,
          {
            arg3: {
              defaultListValue: [10, 2],
            },
          },
          context,
          expect.any(Object),
        );
      });

      it(`if NOT has permissions for a field, and the field don't has a array default list value, return field resolver with null and missing permissions`, async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(
          schema,
          sourceNoDefaultListValue,
          undefined,
          context,
        );
        expect(result).toEqual({
          data: {
            test: null,
          },
          errors: [
            new GraphQLError(
              `Missing Permissions: ${noDefaultListValuePermission}`,
            ),
          ],
        });
      });

      it(`if NOT has permissions for a field, and don't pass the default list value, return field resolver with null and missing permissions`, async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(
          schema,
          sourceDefaultListValue2,
          undefined,
          context,
        );
        expect(result).toEqual({
          data: {
            test: null,
          },
          errors: [
            new GraphQLError(`Missing Permissions: ${defaultValuePermission}`),
          ],
        });
      });

      it('if NOT has permissions for field value, and pass the default object value, pass the argument to resolver', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(
          schema,
          sourceDefaultObjectValue,
          undefined,
          context,
        );
        expect(result).toEqual({
          data: {
            test: 'resolverReturn',
          },
        });
        expect(mockResolver).toBeCalledWith(
          undefined,
          {
            arg4: {
              defaultObjectValue: {
                name: 'defaultObject',
                number: 10,
              },
            },
          },
          context,
          expect.any(Object),
        );
      });

      it('if NOT has permissions for field value, and pass the default array object value, pass the argument to resolver', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(
          schema,
          sourceDefaultArrayObjectValue,
          undefined,
          context,
        );
        expect(result).toEqual({
          data: {
            test: 'resolverReturn',
          },
        });
        expect(mockResolver).toBeCalledWith(
          undefined,
          {
            arg5: {
              defaultArrayObjectValue: [
                { name: 'defaultArrayObject' },
                { name: 'defaultArrayObject' },
              ],
            },
          },
          context,
          expect.any(Object),
        );
      });

      it(`if NOT has permissions for field value, and don't pass the arguments with a default array object value, return field resolver with null and missing permissions`, async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(
          schema,
          sourceDefaultArrayObjectValue2,
          undefined,
          context,
        );
        expect(result).toEqual({
          data: {
            test: null,
          },
          errors: [
            new GraphQLError(`Missing Permissions: ${defaultValuePermission}`),
          ],
        });
        expect(mockResolver).not.toBeCalled();
      });

      it('if NOT has permissions for a field with THROW policy, returns null and do not call field resolver', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: {
            test: null,
          },
          errors: [new ForbiddenError(`Missing Permissions: ${permissionX}`)],
        });
        expect(mockResolver).not.toBeCalled();
      });

      it('if NOT has permissions for a field with RESOLVE policy, calls field resolver with original argument and missing permissions', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: [permissionX],
        });
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: {
            test: 'resolverReturn',
          },
        });
        expect(mockResolver).toBeCalledWith(
          undefined,
          {
            arg: {
              alsoPublic: 'world',
              defaultValue: 'defaultValue',
              email: 'user@server.com',
              onlyAllowedMayRead: 42,
              publicField: 'hello',
              skipOnNullDefaultField: null,
            },
          },
          context,
          expect.objectContaining({
            missingPermissions: [permissionY],
          }),
        );
      });

      it(`if NOT has permissions for a field and pass null for this field, but isn't the default value, calls field resolver with null and missing permissions`, async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: [permissionX],
        });
        const result = await graphql(schema, sourceDefault, undefined, context);
        expect(result).toEqual({
          data: {
            test: null,
          },
          errors: [
            new GraphQLError(`Missing Permissions: ${defaultValuePermission}`),
          ],
        });
        expect(mockResolver).not.toBeCalled();
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
            type MyRestrictedObject @${name}(permissions: ["${permissionX}"]) {
              restrictedField: Int # behaves as @hasPermissions(permissions: ["${permissionX}"])
              anotherRestrictedField: String # behaves as @hasPermissions(permissions: ["${permissionX}"])
              restrictedTwice: Int @${name}(permissions: ["${permissionY}"])
              maskedEmail: String @${name}(permissions: ["${permissionZ}"], policy: RESOLVER)
              secondMaskedEmail: String @${name}(permissions: ["${permissionXPTO}"], policy: RESOLVER)
            }
            type TwoResolver @${name}(permissions: ["${permissionY}"], policy: RESOLVER) {
              missingPermissions: [String!]@${name}(permissions: ["${permissionZ}"], policy: RESOLVER)
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
            new ForbiddenError(`Missing Permissions: ${permissionX}`),
            new ForbiddenError(`Missing Permissions: ${permissionX}`),
            new ForbiddenError(`Missing Permissions: ${permissionY}`),
            new ForbiddenError(`Missing Permissions: ${permissionX}`),
            new ForbiddenError(`Missing Permissions: ${permissionX}`),
          ],
        });
      });

      it('combined hasPermissions', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: [permissionX],
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
          errors: [new ForbiddenError(`Missing Permissions: ${permissionY}`)],
        });
      });

      it('combined hasPermissions 2', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: [`${permissionY}`],
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
            new ForbiddenError(`Missing Permissions: ${permissionX}`),
            new ForbiddenError(`Missing Permissions: ${permissionX}`),
            new ForbiddenError(`Missing Permissions: ${permissionX}`),
            new ForbiddenError(`Missing Permissions: ${permissionX}`),
            new ForbiddenError(`Missing Permissions: ${permissionX}`),
          ],
        });
      });

      it('combined hasPermissions 3', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: [permissionX, permissionXPTO],
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
          errors: [new ForbiddenError(`Missing Permissions: ${permissionY}`)],
        });
      });

      it('combined hasPermissions 4', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: [permissionX, permissionZ],
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
          errors: [new ForbiddenError(`Missing Permissions: ${permissionY}`)],
        });
      });

      it('two policy: RESOLVER missing permissions', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: [permissionX],
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
              missingPermissions: [permissionY, permissionZ],
            },
          },
        });
      });
    });

    describe('works on whole input object', (): void => {
      const mockResolver = jest.fn(() => {
        return 'resolverReturn';
      });

      beforeEach((): void => {
        mockResolver.mockClear();
      });

      const schema = ValidateDirectiveVisitor.addValidationResolversToSchema(
        makeExecutableSchema({
          resolvers: {
            Query: {
              test: mockResolver,
            },
          },
          schemaDirectives: {
            [name]: HasPermissionsDirectiveVisitor,
          },
          typeDefs: [
            ...directiveTypeDefs,
            gql`
            input InputObjectWithXYPermission @${name}(permissions: ["${permissionX}", "${permissionY}"], policy: RESOLVER) {
              xyInput: Int = 2
            }

            input InputObjectWithXPermission @${name}(permissions: ["${permissionX}"]) {
              xInput: String = "bInput"
            }

            input InputObjectWithoutPermission {
              input: Boolean
            }

            type Query {
              test(arg1: InputObjectWithXYPermission,
               arg2: InputObjectWithXPermission,
               arg3: InputObjectWithoutPermission): String
            }
          `,
          ],
        }),
      );
      const source = print(gql`
        query {
          test(
            arg1: { xyInput: 42 }
            arg2: { xInput: "aInput" }
            arg3: { input: true }
          )
        }
      `);

      const sourceDefault = print(gql`
        query {
          test(
            arg1: { xyInput: 2 }
            arg2: { xInput: "bInput" }
            arg3: { input: true }
          )
        }
      `);

      it('if has all permissions, pass all arguments to resolver', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions,
        });
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: {
            test: 'resolverReturn',
          },
        });
        expect(mockResolver).toBeCalledWith(
          undefined,
          {
            arg1: { xyInput: 42 },
            arg2: { xInput: 'aInput' },
            arg3: { input: true },
          },
          context,
          expect.any(Object),
        );
      });

      it('if NOT has all permissions, but use the default input values, pass all arguments to resolver', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(schema, sourceDefault, undefined, context);
        expect(result).toEqual({
          data: {
            test: 'resolverReturn',
          },
        });
        expect(mockResolver).toBeCalledWith(
          undefined,
          {
            arg1: { xyInput: 2 },
            arg2: { xInput: 'bInput' },
            arg3: { input: true },
          },
          context,
          expect.any(Object),
        );
      });

      it('if NOT has permissions for a field with THROW policy, returns null and do not call field resolver', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: {
            test: null,
          },
          errors: [new ForbiddenError(`Missing Permissions: ${permissionX}`)],
        });
        expect(mockResolver).not.toBeCalled();
      });

      it('if NOT has permissions for a field with RESOLVE policy, calls field resolver with original argument and missing permissions', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: [permissionX],
        });
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: {
            test: 'resolverReturn',
          },
        });
        expect(mockResolver).toBeCalledWith(
          undefined,
          {
            arg1: { xyInput: 42 },
            arg2: { xInput: 'aInput' },
            arg3: { input: true },
          },
          context,
          expect.objectContaining({
            missingPermissions: [permissionY],
          }),
        );
      });
    });

    describe('works on input arguments', (): void => {
      const mockResolver = jest.fn(() => {
        return 'resolverReturn';
      });

      beforeEach((): void => {
        mockResolver.mockClear();
      });

      const schema = ValidateDirectiveVisitor.addValidationResolversToSchema(
        makeExecutableSchema({
          resolvers: {
            Query: {
              test: mockResolver,
            },
          },
          schemaDirectives: {
            [name]: HasPermissionsDirectiveVisitor,
          },
          typeDefs: [
            ...directiveTypeDefs,
            gql`
            type Query {
              test(argXYPermission: Int = 80 @${name}(permissions: ["${permissionX}", "${permissionY}"], policy: RESOLVER),
               argXPermission: String = "bInput" @${name}(permissions: ["${permissionX}"]),
               arg: Boolean): String
            }
          `,
          ],
        }),
      );
      const source = print(gql`
        query {
          test(argXYPermission: 42, argXPermission: "aInput", arg: true)
        }
      `);

      const sourceDefault = print(gql`
        query {
          test(argXYPermission: 80, argXPermission: "bInput", arg: true)
        }
      `);

      it('if has all permissions, pass all arguments to resolver', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions,
        });
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: {
            test: 'resolverReturn',
          },
        });
        expect(mockResolver).toBeCalledWith(
          undefined,
          {
            arg: true,
            argXPermission: 'aInput',
            argXYPermission: 42,
          },
          context,
          expect.any(Object),
        );
      });

      it('if NOT has permissions, but use the default values in arguments, pass all arguments to resolver', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(schema, sourceDefault, undefined, context);
        expect(result).toEqual({
          data: {
            test: 'resolverReturn',
          },
        });
        expect(mockResolver).toBeCalledWith(
          undefined,
          {
            arg: true,
            argXPermission: 'bInput',
            argXYPermission: 80,
          },
          context,
          expect.any(Object),
        );
      });

      it('if NOT has permissions for a field with THROW policy, returns null and do not call field resolver', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: undefined,
        });
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: {
            test: null,
          },
          errors: [new ForbiddenError(`Missing Permissions: ${permissionX}`)],
        });
        expect(mockResolver).not.toBeCalled();
      });

      it('if NOT has permissions for a field with RESOLVE policy, calls field resolver with original argument and missing permissions', async (): Promise<void> => {
        const context = HasPermissionsDirectiveVisitor.createDirectiveContext({
          filterMissingPermissions: debugFilterMissingPermissions,
          grantedPermissions: [permissionX],
        });
        const result = await graphql(schema, source, undefined, context);
        expect(result).toEqual({
          data: {
            test: 'resolverReturn',
          },
        });
        expect(mockResolver).toBeCalledWith(
          undefined,
          {
            arg: true,
            argXPermission: 'aInput',
            argXYPermission: 42,
          },
          context,
          expect.objectContaining({
            missingPermissions: [permissionY],
          }),
        );
      });
    });
  });

  it('throws if missingPermissions argument type is wrong', async (): Promise<void> => {
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
              test: Boolean @${name}(permissions: ["${permissionZ}"]) @injectMissingPermissions
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
