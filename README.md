# Validation Directives for Apollo Server

This project provides useful validation directives to be used with
the Apollo Server.

These are useful to both document the schema, making it clear what is
expected, and ease the resolver implementation since it will only be
called after pre-conditions are met.
# Installation
```sh
$ npm i @profusion/apollo-validation-directives

$ yarn add @profusion/apollo-validation-directives
```

# Helpers

This project exposes few helpers:

- `EasyDirectiveVisitor` abstract class enables `getTypeDefs()` and
  `getDirectiveDeclaration()` based on static (class) attributes.
- `ValidateDirectiveVisitor` builds on top of `EasyDirectiveVisitor`
  and does all the required work to validate both output and input
  (arguments). All it need is `getValidationForArgs()`. Note that
  due a GraphQL limitation of no input type resolvers we need to
  patch the executable schema using `addValidationResolversToSchema()`
  in order to properly validate them!

# Directives

## Access Control

See [examples/access-control-directives.ts](./examples/access-control-directives.ts)

### `@auth`

The `@auth` uses the context-provided `isAuthenticated()` function
and throws `AuthenticationError` if that returns `false`.

It can be used on each field or on an object type, in this case all
fields will be marked as authenticated.

The context must provide `isAuthenticated()` and this function will
be called with the resolver arguments. The field resolver is only
called if `isAuthenticated()` returns `true`.

GraphQL schema usage:

```gql
type SomeObject {
  authenticatedField: Int @auth
  publicField: String
}

type MyAuthenticatedObject @auth {
  authenticatedField: Int # behaves as @auth
  anotherAuthenticatedField: String # behaves as @auth
}
```

Code:

```typescript
import { auth } from '@profusion/apollo-validation-directives';

const server = new ApolloServer({
  resolvers,
  schemaDirectives: { auth },
  typeDefs: [
    ...yourTypeDefs,
    ...auth.getTypeDefs(),
  ],
  context: (expressContext) => {
    const { authorization } = expressContext.req.headers;
    const isAuthenticated = isAuthorizationValid(authorization);
    return auth.createDirectiveContext({
      isAuthenticated: () => isAuthenticated,
    });
  },
});
```

### `@hasPermissions()`

The `@hasPermissions()` uses the context-provided
`checkMissingPermissions()` to see if the current request contains the
required permissions. If the `policy: THROW` (default) is used, then it
will throw `ForbiddenError`. If the `policy: RESOLVER` is used, the
check is done inside the resolver and the `GraphQLResolveInfo` argument will receive an extra
field `missingPermissions: string[]` that is undefined if nothing is missing,
otherwise it contains the missing permissions. For instance it may
allow the execution with some restrictions, such as mask values, filter
and only return the owned fields, etc.

It can be used on each field or on an object type, in this case all
fields will be marked as requiring the same permissions, with the
same policy.

The context must provide `checkMissingPermissions()` and this function
will be called with the list of required `permissions` and a `cacheKey`
followed by the resolver arguments.

The `cacheKey` uniquely identifies the list of `permission` (ie:
`JSON.stringify(Array.from(permissions).sort())`) and may be used
to speed up recurrent checks.

If `policy: THROW` (default) the field resolver is only called if
`checkMissingPermissions()` returns `null` or an empty list.

GraphQL schema usage:

```gql
type SomeObject {
  onlyAllowedMayRead: Int @hasPermissions(permissions: ["x", "y"])
  email: String @hasPermissions(
    permissions: ["email:read"],
    policy: RESOLVER # example: mask emails if permission is not granted
  )
  publicField: String
}

type MyRestrictedObject @hasPermissions(permissions: ["x"]) {
  restrictedField: Int # behaves as @hasPermissions(permissions: ["x"])
  anotherRestrictedField: String # behaves as @hasPermissions(permissions: ["x"])
}
```

Code:

```typescript
import { hasPermissions } from '@profusion/apollo-validation-directives';

const server = new ApolloServer({
  resolvers,
  schemaDirectives: { hasPermissions },
  typeDefs: [
    ...yourTypeDefs,
    ...hasPermissions.getTypeDefs(),
  ],
  context: (expressContext) => {
    const { authorization } = expressContext.req.headers;
    return hasPermissions.createDirectiveContext({
      grantedPermissions: getPermissions(authorization),
    });
  },
});
```

## Value Validation

The value validation directives do not require a specific context,
however in order to have them to work on input types/fields one must
call `ValidateDirectiveVisitor.addValidationResolversToSchema()` on
the executable schema so the resolvers are properly wrapped
with type checks.

They can all be used on multiple locations: `ARGUMENT_DEFINITION`,
`FIELD_DEFINITION`, `INPUT_FIELD_DEFINITION`, `INPUT_OBJECT` and
`OBJECT`. When used in field containers (`INPUT_OBJECT` or `OBJECT`)
all fields get the same validation.

Validated fields will get an extra property `validationErrors` which
is present in `GraphQLResolveInfo` of type
`[ValidatedInputError!]`. It will be injected by resolver wrapper
and will be `null` if no errors or will contain a non-empty list of
errors that were captured, in this case the nullable fields are
converted into `null`, similar to what is done for failed resolver
fields. These types are exposed by
`ValidateDirectiveVisitor.getMissingCommonTypeDefs()`.

```typescript
import { makeExecutableSchema } from 'apollo-server';
import { range, ValidateDirectiveVisitor } from '@profusion/apollo-validation-directives';

const schema = makeExecutableSchema({
  typeDefs: [
    ...yourTypeDefs,
    ...ValidateDirectiveVisitor.getMissingCommonTypeDefs(),
    ...range.getTypeDefs(),
    // ... any other validation here ...
  ],
  schemaDirectives: { range },
  resolvers,
});

// needed to validate input fields!
ValidateDirectiveVisitor.addValidationResolversToSchema(schema);

const server = new ApolloServer({ schema });
```

See [examples/value-validation-directives.ts](./examples/value-validation-directives.ts)

### `@range()`

The `@range()` limits a number between minimum and maximum values. If
any of `min: null` (or not specified), then there is no minimum
boundary. Likewise, if `max: null` (or not specified), there is no
maximum boundary. If both are `null` the directive has no effect.

The boundary values are included in the allowed numbers, that is:
`min <= value && value <= max`.

If the value is out of boundaries, it will throw `ValidationError()`.

It can be used on each field or on an object/input type, in this case
all fields will be marked with the same range.

If used on lists, it will apply to each item.

GraphQL schema usage:

```gql
type SomeObject {
  limitedInt: Int! @range(min: 0, max: 100)
  worksWithNullable: Int @range(min: 0, max: 100)
  positiveIntegers: Int! @range(min: 1)
  negativeIntegers: Int! @range(max: -1)
  unlimited: Int! @range
  limitedFloat: Float! @range(min: -0.5, max: 0.5)
  onlyNumbersAreHandled: String @range(min: 0, max: 10) # unlimited/ignored
}

input SomeInput {
  limitedInt: Int! @range(min: 0, max: 100)
}
```

### `@listLength()`

The `@listLength()` limits a list between minimum and maximum
length. If any of `min: null` (or not specified), then there is no
minimum boundary. Likewise, if `max: null` (or not specified), there is
no maximum boundary. If both are `null` the directive has no effect.

The boundary values are included in the allowed numbers, that is:
`min <= length && length <= max`.

If the list length is out of boundaries, it will throw
`ValidationError()`.

It can be used on each field or on an object/input type, in this case
all fields will be marked with the same list length.

GraphQL schema usage:

```gql
type SomeObject {
  limitedArray: [String!]! @listLength(min: 1, max: 5)
}

input SomeInput {
  limitedArray: [String!]! @listLength(min: 1, max: 5)
}
```

### `@stringLength()`

The `@stringLength()` limits a string between minimum and maximum
length. If any of `min: null` (or not specified), then there is no
minimum boundary. Likewise, if `max: null` (or not specified), there is
no maximum boundary. If both are `null` the directive has no effect.

The boundary values are included in the allowed numbers, that is:
`min <= length && length <= max`.

If the string length is out of boundaries, it will throw
`ValidationError()`.

It can be used on each field or on an object/input type, in this case
all fields will be marked with the same string length.

If used on lists, it will apply to each item.

GraphQL schema usage:

```gql
type SomeObject {
  limitedString: String! @stringLength(min: 1, max: 100)
  worksWithNullable: String @stringLength(min: 1, max: 100)
  atLeast1Char: String! @stringLength(min: 1)
  atMost10Chars: String! @stringLength(max: 10)
  unlimited: String! @stringLength()
  limitedArray: [String!]! @stringLength(min: 1, max: 5)
}

input SomeInput {
  limitedString: String! @stringLength(min: 1, max: 100)
  limitedArray: [String!]! @stringLength(min: 1, max: 100)
}
```

### `@pattern()`

The `@pattern()` limits a string to match the given regular expression,
otherwise it will throw `ValidationError()`.

It can be used on each field or on an object/input type, in this case
all fields will be marked with the same pattern.

If used on lists, it will apply to each item.

GraphQL schema usage:

```gql
type SomeObject {
  example: String! @pattern(regexp: "[A-Za-z]+")
  worksWithNullable: String @pattern(regexp: "[A-Za-z]+")
  flagsAreSupported: String! @pattern(regexp: "[a-z]+", flags: "i")
}

input SomeInput {
  example: String! @pattern(regexp: "[A-Za-z]+")
  worksWithNullable: String @pattern(regexp: "[A-Za-z]+")
  flagsAreSupported: String! @pattern(regexp: "[a-z]+", flags: "i")
}
```

### Relay (Global) Node ID Support

This package exposes two directives to convert IDs encode and decode Relay's
[Node](https://facebook.github.io/relay/graphql/objectidentification.htm) interface.
For instance, this plays well with https://github.com/profusion/apollo-federation-node-gateway
that will collect all the types implementing the Node interface as integers
so the encoded id is both small and avoid leaking internal details.

### `@selfNodeId`

The `@selfNodeId` uses the context-provided `toNodeId()` function
and throws `ValidationError` if that returns `null` and can be
used to encode an ID to a global Node ID.

It can be used on any field String or an ID field and
the typename used to encode will be the type which
the field belongs to. It can be also used in an object,
which will this case automatically annotate the `id` field.

The context must provide `toNodeId()` and this function will
be called with the following arguments. This function receives two
arguments, which are:
 * typename: A string which contains the typename
 * id: The ID itself
After this function executes, it should return an encoded node ID.

GraphQL schema usage:

```gql
type SomeObject {
  id: ID! @selfNodeId
}

type MyAuthenticatedObject @selfNodeId {
  id: ID! # This field will be wrapped and a global node ID will be returned
}
```

Code:

```typescript
import { selfNodeId } from '@profusion/apollo-validation-directives';

const server = new ApolloServer({
  resolvers,
  schemaDirectives: { selfNodeId },
  typeDefs: [
    ...yourTypeDefs,
    ...selfNodeId.getTypeDefs(),
  ],
  context: () => {
    return selfNodeId.createDirectiveContext({
      toNodeId: (typename, id) => Buffer.from(`${typename}:${id}`).toString('base64'),
    });
  },
});
```

### `@foreignNodeId`

The `@foreignNodeId` can be used to and can be
used to decode a global Node ID to an ID.
It uses the context-provided `fromNodeId()` function
and throws `ValidationError` if that returns `null`, otherwise
it should return a object with the following interface:

```typescript
interface FromNodeIdReturnType {
  typename: string; // The typename for the decoded ID
  id: string; // The decoded ID
}
```

In case the returned `typename` does not match the one
provided via args to the `@foreignNodeId` directive a
`ValidationError` will be thrown.

This directive has an required argument called `typename`
which will be used to validate if the `fromNodeId()` function
decoded the global Node ID correctly.

This directive can be used on query/mutation arguments
or in input field definitions which matches the ID/string type.

The context must provide `fromNodeId()` and this function will
be called the encoded node id as returned by `toNodeId()` from the
`@selfNodeId` directive.

GraphQL schema usage:

```gql
input InputType {
  myId: ID! @foreignNodeId(typename: "X")
  otherId: ID! @foreignNodeId(typename: "Y")
  yetAnotherId: ID! @foreignNodeId(typename: "Z")
}

type Query {
  work(input: InputType!, id: ID! @foreignNodeId(typename: "I"))
}
```

Code:

```typescript
import { foreignNodeId } from '@profusion/apollo-validation-directives';

const server = new ApolloServer({
  resolvers,
  schemaDirectives: { foreignNodeId },
  typeDefs: [
    ...yourTypeDefs,
    ...foreignNodeId.getTypeDefs(),
  ],
  context: () => {
    return foreignNodeId.createDirectiveContext({
      fromNodeId: (id) => {
        const r = Buffer.from(id, 'base64')
          .toString('ascii')
          .split(':');
        return {
          id: r[1],
          typename: r[0],
        };
      },
    });
  },
});
```

### Apollo Federation

In order to use this package with apollo federation, one must remember
that __all__ directives should be available to all micros-services (even
if they not use it). Having this in mind, to setup a micro-service one
could do the following:

```typescript
import { GraphQLSchema, DocumentNode } from 'graphql';
import { SchemaDirectiveVisitor } from 'apollo-server';
import { buildFederatedSchema } from '@apollo/federation';
import { GraphQLResolverMap } from 'apollo-graphql';
import { ValidateDirectiveVisitor, range, stringLength } from '@profusion/apollo-validation-directives';


// buildSchema.ts

/*
  When using apollo federation all
  directives should be available to all
  federated nodes.
*/
const directives = {
  range,
  stringLength,
};

export const buildSchema = (
  resolvers: GraphQLResolverMap<{}>,
  typeDefs: DocumentNode,
): GraphQLSchema => {
  const finalTypeDefs = [
    typeDefs,
    ...ValidateDirectiveVisitor.getMissingCommonTypeDefs(),
    ...Object.values(directives).reduce<DocumentNode[]>(
      (acc, d) => acc.concat(d.getTypeDefs()),
      [],
    ),
  ];
  const schema = buildFederatedSchema({ resolvers, typeDefs: finalTypeDefs });
  SchemaDirectiveVisitor.visitSchemaDirectives(schema, directives);
  ValidateDirectiveVisitor.addValidationResolversToSchema(schema);
  return schema;
};

// server.ts

const resolvers = { /*  the resolvers... */ };
const typeDefs = gql`....`;

const { url } = await new ApolloServer({
  // From buildSchema.ts
  schema: buildSchema(resolvers, typeDefs),
}).listen(),
```

See [examples/federation.ts](./examples/federation.ts)
