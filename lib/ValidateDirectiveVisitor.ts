import {
  defaultFieldResolver,
  DirectiveLocation,
  DocumentNode,
  GraphQLArgument,
  GraphQLDirective,
  GraphQLEnumType,
  GraphQLField,
  GraphQLInputField,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNamedType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';
import { ValidationError } from 'apollo-server-errors';

import EasyDirectiveVisitor, {
  getDirectiveDeclaration,
} from './EasyDirectiveVisitor';

import capitalize from './capitalize';

export enum ValidateDirectivePolicy {
  RESOLVER = 'RESOLVER',
  THROW = 'THROW',
}

export interface ValidationDirectiveArgs {
  policy: ValidateDirectivePolicy;
}

export type ValidateFunction<TContext = object> = (
  value: unknown,
  type: GraphQLNamedType | GraphQLInputType,
  container: GraphQLArgument | GraphQLInputObjectType | GraphQLObjectType,
  context: TContext,
) => unknown;

type ValidatedContainerMustValidateInput = {
  mustValidateInput?: boolean;
};

export type ValidatedArgumentsGraphQLField<TContext = object> = GraphQLField<
  unknown,
  TContext
> &
  ValidatedContainerMustValidateInput;
export type ValidatedGraphQLInputObjectType = GraphQLInputObjectType &
  ValidatedContainerMustValidateInput;

type ValidatedEntryExtension<TContext = object> = {
  validation?: ValidateFunction<TContext>;
  policy?: ValidateDirectivePolicy;
};

interface Argument extends GraphQLArgument {
  type: GraphQLInputType & {
    policy?: ValidateDirectivePolicy;
  };
}

export type ValidatedGraphQLArgument<TContext = object> = Argument &
  ValidatedEntryExtension<TContext>;
export type ValidatedGraphQLInputField<TContext = object> = GraphQLInputField &
  ValidatedEntryExtension<TContext>;

type ValidatedContainer<TContext> =
  | ValidatedGraphQLInputObjectType
  | ValidatedArgumentsGraphQLField<TContext>;
type ValidatedEntry<TContext = object> =
  | ValidatedGraphQLInputField<TContext>
  | ValidatedGraphQLArgument<TContext>;

/**
 * Mark the container as requiring validation and optionally define a
 * validation function to be used by the entry (field/argument). If a
 * previous validation exists, then it will be called before the given
 * validation function is called!
 *
 * @note this is exported in case external entities need to mark
 *       containers and entries as needed for validation. This is
 *       NOT expected, if you need it, let us know why!
 *
 * @param container the container to be marked as must validate.
 * @param entry the entry to be validated (if `validate !== unknown`)
 * @param validate the entry validation function or `undefined` to
 *        do nothing special.
 */
export const addContainerEntryValidation = <TContext>(
  container: ValidatedContainer<TContext>,
  entry: ValidatedEntry<TContext>,
  validate: ValidateFunction<TContext> | undefined,
  policy: ValidateDirectivePolicy,
): void => {
  // eslint-disable-next-line no-param-reassign
  container.mustValidateInput = true;
  // eslint-disable-next-line no-param-reassign
  entry.policy = policy;

  if (!validate) {
    // We're just flagging the container since a nested
    // field requires validation.
    return;
  }
  const previousValidation = entry.validation;

  // eslint-disable-next-line no-param-reassign
  entry.validation =
    previousValidation === undefined
      ? validate
      : (value: unknown, ...rest): unknown =>
          validate(previousValidation(value, ...rest), ...rest);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObject = { [key: string]: any };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArray = any[];

export type ValidatedInputError = {
  path: string[];
  message: string;
  error: Error;
};

const defaultPolicy: ValidateDirectivePolicy = ValidateDirectivePolicy.RESOLVER;

const containsNonNullField = (field: GraphQLInputField): boolean => {
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return containsNonNull(field.type);
};

const containsNonNull = (type: GraphQLInputType): boolean => {
  if (type instanceof GraphQLNonNull) {
    return true;
  }

  if (type instanceof GraphQLList) {
    return containsNonNull(type.ofType);
  }

  if (type instanceof GraphQLInputObjectType) {
    return Object.values(type.getFields()).some(containsNonNullField);
  }

  return false;
};

const checkMustValidateInputField = (
  field: ValidatedGraphQLInputField,
): boolean => {
  // istanbul ignore next (shouldn't reach as addContainerEntryValidation would mark parent, but be safe)
  if (field.validation) {
    return true;
  }
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return checkMustValidateInput(field.type);
};

const checkMustValidateInput = (
  type: GraphQLInputType & ValidatedContainerMustValidateInput,
): boolean => {
  let finalType = type;
  if (finalType instanceof GraphQLNonNull) {
    finalType = finalType.ofType;
  }

  if (finalType instanceof GraphQLList) {
    return checkMustValidateInput(finalType.ofType);
  }

  if (finalType.mustValidateInput !== undefined) {
    return finalType.mustValidateInput;
  }

  if (finalType instanceof GraphQLInputObjectType) {
    return Object.values(finalType.getFields()).some(
      checkMustValidateInputField,
    );
  }

  return false;
};

// modifies `container` in-place if the validated value changed!
const validateContainerEntry = <TContext>(
  container: AnyObject,
  entry: number | string,
  type: GraphQLInputType,
  validation: ValidateFunction<TContext> | undefined,
  path: string[],
  errors: ValidatedInputError[],
  containerType: GraphQLArgument | GraphQLInputObjectType | GraphQLObjectType,
  context: TContext,
  policy: ValidateDirectivePolicy = defaultPolicy,
): void => {
  // istanbul ignore if  (shouldn't reach)
  if (!container) return;
  const originalValue = container[entry];
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const validatedValue = validateEntryValue(
    originalValue,
    type,
    validation,
    path.concat([entry.toString()]),
    errors,
    containerType,
    context,
    policy,
  );
  if (validatedValue !== originalValue) {
    // eslint-disable-next-line no-param-reassign
    container[entry] = validatedValue;
  }
};

// it will change the args in-place!
const validateFieldArguments = <TContext>(
  args: AnyObject,
  info: AnyObject,
  definitions: GraphQLArgument[],
  validationErrorsArgumentName: string,
  context: TContext,
): void => {
  const path: string[] = [];
  const errors: ValidatedInputError[] =
    info[validationErrorsArgumentName] || [];
  definitions.forEach((arg: ValidatedGraphQLArgument<TContext>): void => {
    const { name, type, validation, policy } = arg;
    validateContainerEntry(
      args,
      name,
      type,
      validation,
      path,
      errors,
      arg,
      context,
      policy,
    );
  });

  // eslint-disable-next-line no-param-reassign
  info[validationErrorsArgumentName] = errors.length > 0 ? errors : null;
};

// it will change the object in-place!
const validateInputObject = <TContext>(
  obj: AnyObject,
  objectType: ValidatedGraphQLInputObjectType,
  path: string[],
  errors: ValidatedInputError[],
  context: TContext,
): AnyObject => {
  if (!checkMustValidateInput(objectType) && !containsNonNull(objectType)) {
    return obj;
  }

  Object.values(objectType.getFields()).forEach(
    ({
      name,
      type,
      validation,
      policy,
    }: ValidatedGraphQLInputField<TContext>): void => {
      validateContainerEntry(
        obj,
        name,
        type,
        validation,
        path,
        errors,
        objectType,
        context,
        policy,
      );
    },
  );

  return obj;
};

// it will change the array in-place!
const validateList = <TContext>(
  array: AnyArray,
  itemType: GraphQLInputType & ValidatedContainerMustValidateInput,
  path: string[],
  errors: ValidatedInputError[],
  container: GraphQLArgument | GraphQLInputObjectType | GraphQLObjectType,
  context: TContext,
  mustValidateInput: boolean | undefined,
  policy: ValidateDirectivePolicy,
): AnyArray => {
  if (!mustValidateInput && !containsNonNull(itemType)) {
    return array;
  }

  const { length } = array;
  for (let i = 0; i < length; i += 1) {
    validateContainerEntry(
      array,
      i,
      itemType,
      undefined,
      path,
      errors,
      container,
      context,
      policy,
    );
  }

  return array;
};

const validateNonNull = (value: unknown, type: GraphQLInputType): unknown => {
  if (type instanceof GraphQLNonNull && value === null) {
    throw new ValidationError('received null where non-null is required');
  }
  return value;
};

type Container = (
  | GraphQLArgument
  | GraphQLInputObjectType
  | GraphQLObjectType
) &
  ValidatedContainerMustValidateInput;

// This is the simple version that throws on all errors.
// See validateEntryValue() for the version that tries
// to catch and replace with `null` if nullable, then
// appends to errors.
const validateEntryValueThrowing = <TContext>(
  originalValue: unknown,
  originalType: GraphQLInputType,
  validation: ValidateFunction<TContext> | undefined,
  path: string[],
  errors: ValidatedInputError[],
  container: Container,
  context: TContext,
  policy: ValidateDirectivePolicy,
): unknown => {
  let type = originalType;
  let value = originalValue;

  if (validation) {
    value = validation(value, originalType, container, context);
    if (value === undefined && value !== originalValue) {
      // mimics `GraphQLScalarType.serialize()` behavior
      throw new ValidationError('validation returned undefined');
    }
  }

  value = validateNonNull(value, originalType);
  if (type instanceof GraphQLNonNull) {
    type = type.ofType;
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (type instanceof GraphQLInputObjectType) {
    return validateNonNull(
      validateInputObject(value as AnyObject, type, path, errors, context),
      originalType,
    );
  }

  if (type instanceof GraphQLList) {
    return validateNonNull(
      validateList(
        value as AnyArray,
        type.ofType,
        path,
        errors,
        container,
        context,
        container.mustValidateInput,
        policy,
      ),
      originalType,
    );
  }

  // istanbul ignore else (shouldn't reach)
  if (type instanceof GraphQLScalarType || type instanceof GraphQLEnumType) {
    if (type.serialize(value) === undefined) {
      throw new ValidationError(
        `${type.name}.serialize() returned undefined for value: ${value}`,
      );
    }
    return validateNonNull(value, originalType);
  }

  /* istanbul ignore next */
  throw new TypeError(`unsupported type ${type.inspect()}`);
};

const isErrorRegistered = (
  registered: ValidatedInputError[],
  error: Error,
): boolean => !!registered.find(entry => entry.error === error);

// Validates and catches exceptions, replacing values that failed validation
// with `null` if the type is null-able (in such case, appends to `errors`)
const validateEntryValue = <TContext>(
  originalValue: unknown,
  type: GraphQLInputType,
  validation: ValidateFunction<TContext> | undefined,
  path: string[],
  errors: ValidatedInputError[],
  container: GraphQLArgument | GraphQLInputObjectType | GraphQLObjectType,
  context: TContext,
  policy: ValidateDirectivePolicy,
): unknown => {
  try {
    return validateEntryValueThrowing(
      originalValue,
      type,
      validation,
      path,
      errors,
      container,
      context,
      policy,
    );
  } catch (error) {
    if (!isErrorRegistered(errors, error)) {
      // eventually the error was registered and we shouldn't do it again
      errors.push({
        error,
        message: error.message,
        path,
      });
    }
    const isThrowPolicy = policy === ValidateDirectivePolicy.THROW;
    if (
      error.validationDirectiveShouldThrow ||
      type instanceof GraphQLNonNull ||
      isThrowPolicy
    ) {
      if (error.validationDirectiveShouldThrow === undefined && isThrowPolicy) {
        error.validationDirectiveShouldThrow = true;
      }
      throw error;
    }
    return null;
  }
};

const commonValidatedInputErrorFields = {
  message: {
    description: 'The error/exception message that caused the validation error',
    type: new GraphQLNonNull(GraphQLString),
  },
  path: {
    description: 'Path to the value that caused the validation error',
    type: new GraphQLNonNull(
      new GraphQLList(new GraphQLNonNull(GraphQLString)),
    ),
  },
} as const;

const validatedInputErrorListType = new GraphQLList(
  new GraphQLNonNull(
    new GraphQLInputObjectType({
      description:
        'type of the list entry given as `validationErrors` argument that is injected into every field resolver with validated arguments',
      fields: {
        ...commonValidatedInputErrorFields,
        error: {
          description: 'The actual error instance',
          type: new GraphQLNonNull(
            new GraphQLInputObjectType({
              description:
                'The error/exception that caused the validation error',
              fields: {
                message: {
                  type: new GraphQLNonNull(GraphQLString),
                },
              },
              name: 'ValidatedInputErrorInstance',
            }),
          ),
        },
      },
      name: 'ValidatedInputError',
    }),
  ),
);

const validatedErrorOutputType = new GraphQLObjectType({
  description: 'Output/return version of ValidatedInputError',
  fields: commonValidatedInputErrorFields,
  name: 'ValidatedInputErrorOutput',
});

// Makes sure `field` is flagged as `mustValidateInput: true` and if it wasn't
// already, then declare the `$validationErrorsArgumentName` argument and
// wrap the field resolver so it first validates the arguments before
// calling the wrapped resolver.
const wrapFieldResolverValidateArgument = <TContext>(
  field: ValidatedArgumentsGraphQLField<TContext>,
  argument: GraphQLArgument,
  validate: ValidateFunction<TContext> | undefined,
  validationErrorsArgumentName: string,
  policy: ValidateDirectivePolicy = defaultPolicy,
): void => {
  const { mustValidateInput: alreadyValidated = false } = field;

  addContainerEntryValidation(field, argument, validate, policy);
  if (alreadyValidated) {
    // wrap only once, conditional to field.mustValidateInput, if
    // it wasn't set before addContainerEntryValidation(), then wrap field.
    return;
  }

  const { resolve = defaultFieldResolver } = field;
  // eslint-disable-next-line no-param-reassign
  field.resolve = function (...args): Promise<unknown> {
    validateFieldArguments(
      args[1],
      args[3],
      field.args,
      validationErrorsArgumentName,
      args[2],
    );
    return resolve.apply(this, args);
  };
};

// wrap the field.resolver, calling `validate(resolvedValue)`
// If this function is called multiple times for the same field
// the validation will be chained:
// validate(previousValidation(resolvedValue))`
export const wrapFieldResolverResult = <TContext>(
  field: GraphQLField<unknown, TContext>,
  validate: ValidateFunction<TContext>,
  objectType: GraphQLObjectType,
): void => {
  const { resolve = defaultFieldResolver, type } = field;
  // eslint-disable-next-line no-param-reassign
  field.resolve = async function (...args): Promise<unknown> {
    const originalValue = await resolve.apply(this, args);
    const validatedValue = validate(originalValue, type, objectType, args[2]);
    if (validatedValue === undefined) {
      // mimics `GraphQLScalarType.serialize()` behavior
      throw new ValidationError('validation returned undefined');
    }
    return validatedValue;
  };
};

// If an input object contains a field that requires validation,
// then it also requires validation. It may be a direct reference
// or a deeply nested, including lists and non-null modifiers.
//
// Marking every field with true/false will speed up lookups since
// we don't need to navigate the nested objects every time.
const markInputObjectsRequiringValidation = (
  inputObjects: GraphQLInputObjectType[],
): void =>
  inputObjects.forEach((type: ValidatedGraphQLInputObjectType): void => {
    if (type.mustValidateInput === undefined) {
      // eslint-disable-next-line no-param-reassign
      type.mustValidateInput = checkMustValidateInput(type);
    }
  });

// Fields that have argument may require validation if their input
// object requires it (see markInputObjectsRequiringValidation()),
// even if the argument itself does not have a validation function.
const wrapFieldsRequiringValidation = <TContext>(
  fieldsWithArguments: GraphQLField<unknown, TContext>[],
  validationErrorsArgumentName: string,
): void =>
  fieldsWithArguments.forEach(
    (field: ValidatedArgumentsGraphQLField<TContext>): void => {
      field.args.forEach((arg: ValidatedGraphQLArgument): void => {
        if (checkMustValidateInput(arg.type)) {
          wrapFieldResolverValidateArgument(
            field,
            arg,
            undefined,
            validationErrorsArgumentName,
            arg.type.policy,
          );
        }
      });
    },
  );

const collectInputObjectsAndFieldsWithArguments = (
  schema: GraphQLSchema,
): {
  fieldsWithArguments: GraphQLField<unknown, unknown>[];
  inputObjects: GraphQLInputObjectType[];
} => {
  const fieldsWithArguments: GraphQLField<unknown, unknown>[] = [];
  const inputObjects: GraphQLInputObjectType[] = [];

  Object.values(schema.getTypeMap()).forEach(type => {
    if (type instanceof GraphQLObjectType) {
      Object.values(type.getFields()).forEach(field => {
        if (field.args.length > 0) {
          fieldsWithArguments.push(field);
        }
      });
    } else if (type instanceof GraphQLInputObjectType) {
      inputObjects.push(type);
    }
  });

  return { fieldsWithArguments, inputObjects };
};

/**
 * Abstract class to implement value validation in both input and output values
 *
 * This is a general framework inspired by
 * https://www.apollographql.com/docs/apollo-server/schema/creating-directives/#enforcing-value-restrictions
 *
 * However that document uses custom scalars to achieve the validation, using
 * specific `GraphQLScalarType.serialize()`, `GraphQLScalarType.parseValue()`
 * and `GraphQLScalarType.parseLiteral()` to achieve input and output validation.
 *
 * It mostly works, but as seen in
 * https://github.com/apollographql/graphql-tools/issues/789#issuecomment-590143140
 * that will fail on input variables as the variable type and the wrapped target
 * type are different scalars!
 *
 * This class attempts to resolve it in a different way, for output validation
 * the field resolver is wrapped and will call the validation on the resolved
 * value, pretty straightforward and matches
 * [another example](https://www.apollographql.com/docs/apollo-server/schema/creating-directives/#uppercasing-strings)
 * However input objects are trickier since the `SchemaDirectiveVisitor` won't
 * call `visitArgumentDefinition()` unless the argument is annotated with
 * the directive, yet the argument may use an input object type that requires
 * validation (directly or indirectly via nested objects).
 *
 * There is no way to work around such problem and we need to use an external
 * function `addValidationResolversToSchema()` to properly wrap the fields
 * with arguments that requires validation.
 *
 * To match the resolver behavior where exceptions are converted into `null`
 * for nullable fields and the errors are passed along as `errors` array,
 * the failed input object fields will be converted into `null` unless
 * they are `GraphQLNonNull`, and the validation errors are passed along
 * as `validationErrors`, an array of paths and error messages. Use
 * `validateDirectiveSchema` document node to get the input types.
 *
 * If `GraphQLNonNull` is used in the argument type (root), then the resolver
 * will throw and the wrapped resolver won't be called.
 */
abstract class ValidateDirectiveVisitor<
  TArgs extends ValidationDirectiveArgs,
  TContext = object
> extends EasyDirectiveVisitor<TArgs> {
  public static readonly commonTypes: typeof EasyDirectiveVisitor['commonTypes'] = [
    validatedInputErrorListType,
    validatedErrorOutputType,
  ] as const;

  public static readonly config: typeof EasyDirectiveVisitor['config'] = {
    locations: [
      DirectiveLocation.ARGUMENT_DEFINITION,
      DirectiveLocation.FIELD_DEFINITION,
      DirectiveLocation.INPUT_FIELD_DEFINITION,
      DirectiveLocation.INPUT_OBJECT,
      DirectiveLocation.OBJECT,
    ],
  };

  public static getDirectiveDeclaration(
    givenDirectiveName?: string,
    schema?: GraphQLSchema,
  ): GraphQLDirective {
    const namePrefix = capitalize(givenDirectiveName || this.defaultName);
    const config = {
      ...this.config,
      args: {
        ...this.config.args,
        policy: {
          defaultValue: defaultPolicy,
          description: 'How to handle validation errors',
          type: new GraphQLEnumType({
            name: `${namePrefix}ValidateDirectivePolicy`,
            values: {
              RESOLVER: {
                description:
                  'Field resolver is responsible to evaluate it using `validationErrors` injected in GraphQLResolverInfo',
                value: ValidateDirectivePolicy.RESOLVER,
              },
              THROW: {
                description:
                  'Field resolver is not called if occurs a validation error, it throws `UserInputError`',
                value: ValidateDirectivePolicy.THROW,
              },
            },
          }),
        },
      },
    };
    return getDirectiveDeclaration(
      this.defaultName,
      config,
      givenDirectiveName,
      schema,
    );
  }

  public static getTypeDefs(
    directiveName?: string,
    schema?: GraphQLSchema,
    includeUnknownTypes = true,
    // overridden to false. Call getMissingCommonTypeDefs() directly
    // as many validations would result in the type being re-defined
    includeCommonTypes = false,
  ): DocumentNode[] {
    return super.getTypeDefs(
      directiveName,
      schema,
      includeUnknownTypes,
      includeCommonTypes,
    );
  }

  /**
   * An argument with this name will be injected into the arguments.
   * It will be null if no validation errors, otherwise it will be an
   * array of `ValidatedInputError`.
   *
   * See `ValidateDirectiveVisitor.getMissingCommonTypeDefs`.
   */
  public static readonly validationErrorsArgumentName = 'validationErrors';

  /**
   * Patches the schema and add field resolver wrappers to execute
   * argument validation if a field argument refers to an input object
   * that requires validation (see markInputObjectsRequiringValidation()).
   *
   * Arguments with explicit validation functions or field results are not
   * handled by this function as they are handled by `ValidateDirectiveVisitor`
   * subclasses directly.
   *
   * @param schema the schema to be patched with validation resolvers.
   */
  public static addValidationResolversToSchema(
    schema: GraphQLSchema,
  ): GraphQLSchema {
    const {
      fieldsWithArguments,
      inputObjects,
    } = collectInputObjectsAndFieldsWithArguments(schema);

    markInputObjectsRequiringValidation(inputObjects);

    wrapFieldsRequiringValidation(
      fieldsWithArguments,
      this.validationErrorsArgumentName,
    );

    return schema;
  }

  /**
   * Should check the directive arguments (`this.args`) and return a
   * validation function or `undefined` if no validation should be done
   * for those arguments.
   *
   * The function will be applied to both field resolved values or input values
   * this means GraphQL modifiers must be handled:
   *  - `null` for nullable fields;
   *  - `Array` for list fields.
   */
  public abstract getValidationForArgs():
    | ValidateFunction<TContext>
    | undefined;

  // Arguments directly annotated with the directive, such as
  //
  //   field(argName: InputType @validationDirective)
  //
  // are handled easily since we can immediately wrap its field.resolver
  // to validate the argument.
  public visitArgumentDefinition(
    argument: GraphQLArgument,
    { field }: { field: GraphQLField<unknown, unknown> },
  ): void {
    const validate = this.getValidationForArgs();
    if (!validate) {
      return;
    }
    const { policy } = this.args;
    wrapFieldResolverValidateArgument(
      field,
      argument,
      validate,
      (this.constructor as typeof ValidateDirectiveVisitor)
        .validationErrorsArgumentName,
      policy,
    );
  }

  // However arguments may NOT have directives but they can point to an
  // input object that requires validation.
  //
  // This is tricky to handle since the `SchemaDirectiveVisitor` won't
  // call the visitor methods to wrap the field of such argument (as they
  // do not have the directive).
  //
  // What we can do at this level is simply mark the input object as
  // `mustValidateInput: true` and store the validation in the input
  // object field as `validation`.
  //
  // Then we need to manually walk all the fields with arguments to see
  // if they refer to input objects that require validation and, if some,
  // wrap the field resolver to execute the validation.
  //
  // This is done with `addValidationResolversToSchema()`.

  public visitInputObject(object: GraphQLInputObjectType): void {
    const validate = this.getValidationForArgs();
    if (!validate) return;
    const { policy } = this.args;
    Object.values(object.getFields()).forEach(field => {
      addContainerEntryValidation(object, field, validate, policy);
    });
  }

  public visitInputFieldDefinition(
    field: GraphQLInputField,
    {
      objectType,
    }: {
      objectType: GraphQLInputObjectType;
    },
  ): void {
    const validate = this.getValidationForArgs();
    if (!validate) return;
    const { policy } = this.args;
    addContainerEntryValidation(objectType, field, validate, policy);
  }

  // Output validation is easier since we just replace the field resolver
  // and call the validation on the resolved value, this is done by:
  // wrapFieldResolverResult()

  public visitFieldDefinition(
    field: GraphQLField<unknown, TContext>,
    {
      objectType,
    }: {
      objectType: GraphQLObjectType;
    },
  ): void {
    const validate = this.getValidationForArgs();
    if (!validate) return;
    wrapFieldResolverResult(field, validate, objectType);
  }

  public visitObject(object: GraphQLObjectType | GraphQLInterfaceType): void {
    const validate = this.getValidationForArgs();
    if (!validate) return;
    Object.values(object.getFields()).forEach(field =>
      wrapFieldResolverResult(field, validate, object as GraphQLObjectType),
    );
  }
}

export default ValidateDirectiveVisitor;
