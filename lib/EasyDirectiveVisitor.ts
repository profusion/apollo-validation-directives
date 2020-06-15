import {
  astFromValue,
  DocumentNode,
  GraphQLArgument,
  GraphQLDirective,
  GraphQLDirectiveConfig,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLList,
  GraphQLNamedType,
  GraphQLNonNull,
  GraphQLSchema,
  GraphQLType,
  isSpecifiedScalarType,
  print,
  printType,
} from 'graphql';
import { gql, SchemaDirectiveVisitor } from 'apollo-server';

export type ReadonlyGraphQLDirectiveConfigWithoutName = Readonly<
  {
    [P in keyof Omit<GraphQLDirectiveConfig, 'name'>]: Readonly<
      GraphQLDirectiveConfig[P]
    >;
  }
>;

// TODO: is there any exported version of this?
// I just found a way to print directive via printSchema()
const printInputValue = (spec: GraphQLArgument): string => {
  const { description, name, type, defaultValue } = spec;
  const dsl: string[] = [];

  if (spec.description) dsl.push(`"""${description}"""\n`);

  dsl.push(`${name}: ${type}`);
  if (defaultValue !== undefined) {
    const ast = astFromValue(defaultValue, type);
    // istanbul ignore else (should never happen)
    if (ast) dsl.push(` = ${print(ast)}`);
  }

  return dsl.join('');
};

const printDirective = (directive: GraphQLDirective): string => {
  const dsl: string[] = [];
  if (directive.description) dsl.push(`"""${directive.description}"""\n`);
  dsl.push(`directive @${directive.name}`);
  if (directive.args.length > 0) {
    dsl.push('(\n');
    directive.args.forEach(arg => {
      dsl.push(printInputValue(arg));
      dsl.push('\n');
    });
    dsl.push(')');
  }

  if (directive.isRepeatable) dsl.push(' repeatable');

  dsl.push(` on ${directive.locations.join(' | ')}`);

  return dsl.join('');
};

const collectUnknownNamedTypes = (
  schema: GraphQLSchema | undefined,
  type: GraphQLInputType | GraphQLNamedType,
  unknownTypes: GraphQLNamedType[],
): void => {
  if (type instanceof GraphQLNonNull || type instanceof GraphQLList) {
    collectUnknownNamedTypes(schema, type.ofType, unknownTypes);
    return;
  }

  // istanbul ignore else (should never happen)
  if ('name' in type) {
    if (
      !isSpecifiedScalarType(type) &&
      (!schema || !schema.getType(type.name))
    ) {
      unknownTypes.push(type);

      // only unknown types should point to other unknown types
      // keep the loop below inside this branch!

      if (type instanceof GraphQLInputObjectType) {
        Object.values(type.getFields()).forEach(field =>
          collectUnknownNamedTypes(schema, field.type, unknownTypes),
        );
      }
    }
  }
};

// Ensures the directive contains the given `locations` and `args`, if those
// are given.
//
// Extra locations are kept, while missing locations are added.
//
// Extra arguments are kept. Existing arguments will have their types forced
// to the given config.type (default values and other properties are
// untouched). Missing arguments are added.
const patchDirective = (
  directive: GraphQLDirective,
  { args, locations }: ReadonlyGraphQLDirectiveConfigWithoutName,
): GraphQLDirective => {
  locations.forEach(loc => {
    if (!directive.locations.includes(loc)) {
      directive.locations.push(loc);
    }
  });

  if (args) {
    Object.entries(args).forEach(
      ([
        argName,
        { astNode, defaultValue, description = null, extensions, type },
      ]) => {
        const arg = directive.args.find(({ name }) => argName === name);
        if (arg) {
          arg.type = type;
        } else {
          directive.args.push({
            astNode,
            defaultValue,
            description,
            extensions,
            name: argName,
            type,
          });
        }
      },
    );
  }

  return directive;
};

/**
 * Abstract class to implement helpers to aid `SchemaDirectiveVisitor`
 * implementation.
 *
 * It will provide useful static methods such as:
 *  - `getDirectiveDeclaration()` based on a class-defined `config`.
 *  - `getMissingCommonTypeDefs()` checks which of the class-defined
 *    `commonTypes` (named types such as objects, input, enums and scalars)
 *    are missing in `schema` and return their parsed AST `DocumentNode` to
 *    be used in `makeExecutableSchema()`.
 *  - `getTypeDefs()` returns the default type defs based on class-defined
 *    `config`.
 */
abstract class EasyDirectiveVisitor<
  TArgs extends object
> extends SchemaDirectiveVisitor {
  args: TArgs;

  /**
   * How the directive should be configured.
   *
   * The given arguments and location will be ensured in the final directive
   * when it's created:
   *  - arguments will be added if does not exist, or their types will be
   *    patched to ensure the given types.
   *  - locations will be added if not contained in the existing directive
   *    locations.
   */
  public static readonly config: ReadonlyGraphQLDirectiveConfigWithoutName = {
    locations: [],
  };

  /**
   * Declares the types indirectly used by this directive.
   *
   * For instance, if the directive may extend the return or input
   * types, you may list them here.
   *
   * @note List here types that are not part of the directive itself!
   *
   * @note do not use directly, prefer `getMissingCommonTypeDefs()` or
   *       `getTypeDefs()`.
   */
  public static readonly commonTypes: Readonly<
    (
      | GraphQLNamedType
      | GraphQLList<GraphQLType>
      | GraphQLNonNull<GraphQLType>
    )[]
  > = [];

  /**
   * The default name to use with this directive.
   *
   * This is used in `getDirectiveDeclaration()` and
   * `getTypeDefs()` if no directive name is given.
   */
  public static readonly defaultName: string = '';

  /**
   * Implements getDirectiveDeclaration() based on class-defined `config`
   *
   * If a directive already exists, then the directive will
   * be patched to contain all of the given locations.
   *
   * If a directive already exists and `args` is given, then the directive
   * will be patched to contain at least those arguments. If an argument
   * already exists, it's type is forced to the given argument type (
   * default value and the other properties are not touched). If an argument
   * does not exist, it's created with the given config.
   */
  public static getDirectiveDeclaration(
    givenDirectiveName?: string,
    schema?: GraphQLSchema,
  ): GraphQLDirective {
    const directiveName = givenDirectiveName || this.defaultName;
    const previousDirective = schema && schema.getDirective(directiveName);
    if (previousDirective) {
      return patchDirective(previousDirective, this.config);
    }

    const { locations, ...partialConfig } = this.config;
    return new GraphQLDirective({
      ...partialConfig,
      locations: Array.from(locations),
      name: directiveName,
    });
  }

  /**
   * Concrete classes should be able to return the parsed typeDefs
   * for this directive and required types (if `includeUnknownTypes: true`)
   * and the given `schema` doesn't know about them.
   *
   * @note internally calls `getDirectiveDeclaration(directiveName, schema)`
   *
   * @param directiveName will generate `@${directiveName}` directive
   * @param schema will be used to lookup for existing directive and types.
   * @param includeUnknownTypes also output any unknown input object, scalars
   *        or enums used by this directive that are unknown in the `schema`.
   * @param includeCommonTypes if true will also call
   *        `getMissingCommonTypeDefs()` on the schema and concatenate the
   *        results, making it easy to use.
   *
   * @returns array of parsed `DocumentNode`.
   */
  public static getTypeDefs(
    directiveName?: string,
    schema?: GraphQLSchema,
    includeUnknownTypes = true,
    includeCommonTypes = true,
  ): DocumentNode[] {
    const directive = this.getDirectiveDeclaration(directiveName, schema);
    const typeDefs: DocumentNode[] = [gql(printDirective(directive))];

    if (includeUnknownTypes) {
      const unknownTypes: GraphQLNamedType[] = [];
      directive.args.forEach(({ type }) =>
        collectUnknownNamedTypes(schema, type, unknownTypes),
      );
      unknownTypes.forEach(type => typeDefs.push(gql(printType(type))));
    }

    if (includeCommonTypes) {
      this.getMissingCommonTypeDefs(schema).forEach(def => typeDefs.push(def));
    }

    return typeDefs;
  }

  /**
   * These parsed `DocumentNode` contains input types used by the injected
   * argument/input object validation directive and are missing in the
   * given schema. See
   * `ValidateDirectiveVisitor.validationErrorsArgumentName`.
   */
  public static getMissingCommonTypeDefs(
    schema?: GraphQLSchema,
  ): DocumentNode[] {
    const unknownTypes: GraphQLNamedType[] = [];
    this.commonTypes.forEach(type =>
      collectUnknownNamedTypes(schema, type, unknownTypes),
    );
    return unknownTypes.map(type => gql(printType(type)));
  }
}

export default EasyDirectiveVisitor;
