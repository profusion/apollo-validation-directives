import {
  isInputObjectType,
  defaultFieldResolver,
  DirectiveLocation,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLString,
} from 'graphql';
import type {
  DocumentNode,
  GraphQLArgument,
  GraphQLDirective,
  GraphQLField,
  GraphQLInputField,
  GraphQLInputType,
  GraphQLInterfaceType,
  GraphQLSchema,
  GraphQLFieldConfig,
  GraphQLNamedType,
  GraphQLOutputType,
} from 'graphql';

import { getDirective, inspect } from '@graphql-tools/utils';

import EasyDirectiveVisitor, {
  getDirectiveDeclaration,
} from './EasyDirectiveVisitor.js';

import capitalize from './capitalize.js';
import ValidationError from './errors/ValidationError.js';

export enum ValidateDirectivePolicy {
  RESOLVER = 'RESOLVER',
  THROW = 'THROW',
}

export interface ValidationDirectiveArgs {
  policy: ValidateDirectivePolicy;
}

type ValidateFunctionProperties = Readonly<{
  args: Record<string, unknown>;
  directive: string;
  previous?: ValidateFunctionProperties;
}>;

type ResolverParameters<TContext> = {
  source: unknown;
  args: AnyObject;
  context: TContext;
  info: AnyObject;
};

export type ValidateFunction<TContext = object> = {
  (
    value: unknown,
    type: GraphQLNamedType | GraphQLOutputType | GraphQLInputType,
    container: GraphQLArgument | GraphQLInputObjectType | GraphQLObjectType,
    context: TContext,
    resolverInfo: AnyObject,
    resolverSource: unknown,
    resolverArgs: AnyObject,
    path?: Array<string>,
  ): unknown;
  readonly validateProperties?: ValidateFunctionProperties;
};

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
  policy: ValidateDirectivePolicy | undefined,
): void => {
  // eslint-disable-next-line no-param-reassign
  container.mustValidateInput = true;

  if (policy !== undefined) {
    // eslint-disable-next-line no-param-reassign
    entry.policy = policy;
  }

  if (!validate) {
    // We're just flagging the container since a nested
    // field requires validation.
    return;
  }
  const previousValidation = entry.validation;

  let validation: ValidateFunction<TContext> = validate;
  if (previousValidation !== undefined) {
    validation = (value: unknown, ...rest): unknown =>
      validate(previousValidation(value, ...rest), ...rest);
    Object.defineProperty(validation, 'validateProperties', {
      value: {
        ...validate.validateProperties,
        previous: previousValidation,
      },
      writable: false,
    });
  }

  // eslint-disable-next-line no-param-reassign
  entry.validation = validation;
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

interface ValidateDirectiveError extends Error {
  extensions?: AnyObject | undefined;
  validationDirectiveShouldThrow?: boolean;
}

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

const getFinalType = (
  inputField: GraphQLInputType,
): GraphQLInputType & ValidatedContainerMustValidateInput => {
  if (
    inputField instanceof GraphQLList ||
    inputField instanceof GraphQLNonNull
  ) {
    return getFinalType(inputField.ofType);
  }
  return inputField;
};

const checkMustValidateInput = (
  type: GraphQLInputType & ValidatedContainerMustValidateInput,
): boolean => {
  const finalType = getFinalType(type);

  if (finalType.mustValidateInput !== undefined) {
    return finalType.mustValidateInput;
  }

  if (finalType instanceof GraphQLInputObjectType) {
    const fieldsToCheck = Object.values(finalType.getFields()).filter(field => {
      return finalType !== getFinalType(field.type);
    });

    return fieldsToCheck.some(checkMustValidateInputField);
  }

  return false;
};

// it does not modifies `container` in-place if the validated value changed!
const validateContainerEntry = <TContext>(
  container: AnyObject,
  entry: number | string,
  type: GraphQLInputType,
  validation: ValidateFunction<TContext> | undefined,
  path: string[],
  errors: ValidatedInputError[],
  containerType: GraphQLArgument | GraphQLInputObjectType | GraphQLObjectType,
  fieldResolveParameters: ResolverParameters<TContext>,
  policy: ValidateDirectivePolicy | undefined,
): AnyObject => {
  // istanbul ignore if  (shouldn't reach)
  if (!container) return container;
  const originalValue = container[entry];
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const validatedValue = validateEntryValue(
    originalValue,
    type,
    validation,
    path.concat([entry.toString()]),
    errors,
    containerType,
    fieldResolveParameters,
    policy,
  );
  if (validatedValue !== originalValue) {
    if (Array.isArray(container)) {
      const arrayCpy = [...container];
      arrayCpy[entry as number] = validatedValue;
      return arrayCpy;
    }
    return {
      ...container,
      [entry]: validatedValue,
    };
  }
  return container;
};

// it will not change the fieldResolveParameters args in-place!
const validateFieldArguments = <TContext>(
  fieldResolveParameters: ResolverParameters<TContext>,
  definitions: readonly GraphQLArgument[],
  validationErrorsArgumentName: string,
): AnyObject => {
  let validatedArgs = fieldResolveParameters.args;
  const path: string[] = [];
  const errors: ValidatedInputError[] =
    fieldResolveParameters.info[validationErrorsArgumentName] || [];
  definitions.forEach((arg: ValidatedGraphQLArgument<TContext>): void => {
    const { name, type, validation, policy } = arg;
    validatedArgs = validateContainerEntry(
      validatedArgs,
      name,
      type,
      validation,
      path,
      errors,
      arg,
      fieldResolveParameters,
      policy,
    );
  });

  // eslint-disable-next-line no-param-reassign
  fieldResolveParameters.info[validationErrorsArgumentName] =
    errors.length > 0 ? errors : null;
  return validatedArgs;
};

// it will not change the object in-place!
const validateInputObject = <TContext>(
  obj: AnyObject,
  objectType: ValidatedGraphQLInputObjectType,
  path: string[],
  errors: ValidatedInputError[],
  fieldResolveParameters: ResolverParameters<TContext>,
): AnyObject => {
  let validatedObj = obj;
  if (!checkMustValidateInput(objectType) && !containsNonNull(objectType)) {
    return validatedObj;
  }

  Object.values(objectType.getFields()).forEach(
    ({
      name,
      type,
      validation,
      policy,
    }: ValidatedGraphQLInputField<TContext>): void => {
      validatedObj = validateContainerEntry(
        validatedObj,
        name,
        type,
        validation,
        path,
        errors,
        objectType,
        fieldResolveParameters,
        policy,
      );
    },
  );

  return validatedObj;
};

// it will not change the array in-place!
const validateList = <TContext>(
  array: AnyArray,
  itemType: GraphQLInputType & ValidatedContainerMustValidateInput,
  path: string[],
  errors: ValidatedInputError[],
  container: GraphQLArgument | GraphQLInputObjectType | GraphQLObjectType,
  mustValidateInput: boolean | undefined,
  fieldResolveParameters: ResolverParameters<TContext>,
  policy: ValidateDirectivePolicy | undefined,
): AnyArray => {
  let validatedArray = array;
  if (!mustValidateInput && !containsNonNull(itemType)) {
    return validatedArray;
  }

  const { length } = validatedArray;
  for (let i = 0; i < length; i += 1) {
    validatedArray = validateContainerEntry(
      validatedArray,
      i,
      itemType,
      undefined,
      path,
      errors,
      container,
      fieldResolveParameters,
      policy,
    ) as AnyArray;
  }

  return validatedArray;
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
  fieldResolveParameters: ResolverParameters<TContext>,
  policy: ValidateDirectivePolicy | undefined,
): unknown => {
  let type = originalType;
  let value = originalValue;

  if (validation !== undefined) {
    value = validation(
      value,
      originalType,
      container,
      fieldResolveParameters.context,
      fieldResolveParameters.info,
      fieldResolveParameters.source,
      fieldResolveParameters.args,
      path,
    );

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
      validateInputObject(
        value as AnyObject,
        type,
        path,
        errors,
        fieldResolveParameters,
      ),
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
        container.mustValidateInput,
        fieldResolveParameters,
        policy,
      ),
      originalType,
    );
  }

  // istanbul ignore else (shouldn't reach)
  if (type instanceof GraphQLScalarType || type instanceof GraphQLEnumType) {
    // istanbul ignore if  (shouldn't reach with newer graphql, but used to happen before -- ie: invalid enums)
    if (type.serialize(value) === undefined) {
      throw new ValidationError(
        `${type.name}.serialize() returned undefined for value: ${value}`,
      );
    }
    return validateNonNull(value, originalType);
  }

  /* istanbul ignore next */
  throw new TypeError(`unsupported type ${inspect(type)}`);
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
  fieldResolveParameters: ResolverParameters<TContext>,
  policy: ValidateDirectivePolicy | undefined,
): unknown => {
  try {
    return validateEntryValueThrowing(
      originalValue,
      type,
      validation,
      path,
      errors,
      container,
      fieldResolveParameters,
      policy,
    );
  } catch (ex) {
    const error: ValidateDirectiveError =
      ex instanceof Error
        ? ex
        : /* istanbul ignore next: should never happen, but let's be safe */
          new Error(`unknown error: ${ex}`);

    if (!isErrorRegistered(errors, error)) {
      // eventually the error was registered and we shouldn't do it again
      errors.push({
        error,
        message: error.message,
        path,
      });
    }

    if (policy === undefined) {
      throw error;
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
      // istanbul ignore if  (shouldn't reach with newer graphql, but used to happen before)
      if (error.extensions === undefined) {
        error.extensions = {};
      }
      if (error.extensions.validation === undefined) {
        error.extensions.validation = {
          path,
          properties: validation?.validateProperties,
        };
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
  policy: ValidateDirectivePolicy | undefined,
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
  field.resolve = function (...resolveArgs): unknown {
    const fieldResolveParameters: ResolverParameters<TContext> = {
      args: resolveArgs[1],
      context: resolveArgs[2],
      info: resolveArgs[3],
      source: resolveArgs[0],
    };
    // eslint-disable-next-line no-param-reassign
    resolveArgs[1] = validateFieldArguments(
      fieldResolveParameters,
      field.args,
      validationErrorsArgumentName,
    );
    return resolve.apply(this, resolveArgs);
  };
};

// wrap the field.resolver, calling `validate(resolvedValue)`
// If this function is called multiple times for the same field
// the validation will be chained:
// validate(previousValidation(resolvedValue))`
export const setFieldResolveToApplyOriginalResolveAndThenValidateResult = <
  TContext,
>(
  field:
    | GraphQLFieldConfig<unknown, TContext>
    | GraphQLField<unknown, TContext>,
  validate: ValidateFunction<TContext>,
  objectType: GraphQLObjectType,
): void => {
  const { resolve = defaultFieldResolver, type } = field;
  // eslint-disable-next-line no-param-reassign
  field.resolve = async function (...args): Promise<unknown> {
    const originalValue = await resolve.apply(this, args);

    const validatedValue = validate(
      originalValue,
      type,
      objectType,
      args[2],
      args[3],
      args[0],
      args[1],
    );

    if (validatedValue === undefined && validatedValue !== originalValue) {
      // mimics `GraphQLScalarType.serialize()` behavior
      throw new ValidationError('validation returned undefined');
    }
    return validatedValue;
  };
};

export const setFieldResolveToValidateAndThenApplyOriginalResolve = <TContext>(
  field:
    | GraphQLFieldConfig<unknown, TContext>
    | GraphQLField<unknown, TContext>,
  validate: ValidateFunction<TContext>,
  objectType: GraphQLObjectType,
): void => {
  const { resolve = defaultFieldResolver, type } = field;
  // eslint-disable-next-line no-param-reassign
  field.resolve = async function (...args): Promise<unknown> {
    validate(undefined, type, objectType, args[2], args[3], args[0], args[1]);

    return resolve.apply(this, args);
  };
};

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
  TContext extends object = object,
> extends EasyDirectiveVisitor<
  TArgs,
  TContext,
  | DirectiveLocation.QUERY
  | DirectiveLocation.ARGUMENT_DEFINITION
  | DirectiveLocation.INPUT_FIELD_DEFINITION
  | DirectiveLocation.INPUT_OBJECT
  | DirectiveLocation.FIELD_DEFINITION
  | DirectiveLocation.OBJECT
> {
  public static readonly commonTypes: (typeof EasyDirectiveVisitor)['commonTypes'] =
    [validatedInputErrorListType, validatedErrorOutputType] as const;

  public static readonly config: (typeof EasyDirectiveVisitor)['config'] = {
    locations: [
      DirectiveLocation.ARGUMENT_DEFINITION,
      DirectiveLocation.FIELD_DEFINITION,
      DirectiveLocation.INPUT_FIELD_DEFINITION,
      DirectiveLocation.INPUT_OBJECT,
      DirectiveLocation.OBJECT,
    ],
  };

  public static readonly defaultPolicy: ValidateDirectivePolicy =
    ValidateDirectivePolicy.RESOLVER;

  public readonly applyValidationToOutputTypesAfterOriginalResolver: Boolean =
    true;

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
          defaultValue: this.defaultPolicy,
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
   * Should check the directive arguments (`this.args`) and return a
   * validation function or `undefined` if no validation should be done
   * for those arguments.
   *
   * The function will be applied to both field resolved values or input values
   * this means GraphQL modifiers must be handled:
   *  - `null` for nullable fields;
   *  - `Array` for list fields.
   */
  public abstract getValidationForArgs(
    location: DirectiveLocation,
  ): ValidateFunction<TContext> | undefined;

  // Arguments directly annotated with the directive, such as
  //
  //   field(argName: InputType @validationDirective)
  //
  // are handled easily since we can immediately wrap its field.resolver
  // to validate the argument.
  public visitArgumentDefinition(
    argument: GraphQLArgument,
    { field }: { field: GraphQLField<unknown, TContext> },
  ): void {
    const validate = this.getValidationForArgs(
      DirectiveLocation.ARGUMENT_DEFINITION,
    );
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
    const validate = this.getValidationForArgs(DirectiveLocation.INPUT_OBJECT);
    // istanbul ignore if (shouldn't reach, visitInputObject() is called only if there is a directive)
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
    const validate = this.getValidationForArgs(
      DirectiveLocation.INPUT_FIELD_DEFINITION,
    );
    if (!validate) return;
    const { policy } = this.args;
    addContainerEntryValidation(objectType, field, validate, policy);
  }

  // Output validation is easier since we just replace the field resolver
  // and call the validation on the resolved value, this is done by:
  // wrapFieldResolverResult()

  public visitFieldDefinition(
    field:
      | GraphQLFieldConfig<unknown, TContext, TArgs>
      | GraphQLField<unknown, TContext>,
    {
      objectType,
    }: {
      objectType: GraphQLObjectType;
    },
  ): void {
    const validate = this.getValidationForArgs(
      DirectiveLocation.FIELD_DEFINITION,
    );
    if (!validate) return;
    if (this.applyValidationToOutputTypesAfterOriginalResolver) {
      setFieldResolveToApplyOriginalResolveAndThenValidateResult(
        field,
        validate,
        objectType,
      );
    } else {
      setFieldResolveToValidateAndThenApplyOriginalResolve(
        field,
        validate,
        objectType,
      );
    }
  }

  public visitObject(object: GraphQLObjectType | GraphQLInterfaceType): void {
    const validate = this.getValidationForArgs(DirectiveLocation.OBJECT);
    if (!validate) return;
    Object.values(object.getFields()).forEach(field => {
      if (this.applyValidationToOutputTypesAfterOriginalResolver) {
        setFieldResolveToApplyOriginalResolveAndThenValidateResult(
          field,
          validate,
          object as GraphQLObjectType,
        );
      } else {
        setFieldResolveToValidateAndThenApplyOriginalResolve(
          field,
          validate,
          object as GraphQLObjectType,
        );
      }
    });
  }

  public visitQuery(
    query: GraphQLObjectType<unknown, TContext>,
    schema: GraphQLSchema,
    directiveName: string,
  ): void {
    const fields = Object.values(query.getFields());
    fields.forEach(field => {
      const [directive] = getDirective(schema, field, directiveName) ?? [];
      if (directive) {
        this.args = directive as TArgs;
        this.visitFieldDefinition(field, { objectType: query });
      }

      field.args.forEach(arg => {
        const [directiveOnArg] = getDirective(schema, arg, directiveName) ?? [];
        if (directiveOnArg) {
          this.args = directiveOnArg as TArgs;
          this.visitArgumentDefinition(arg, { field });
        }

        const finalType = getFinalType(arg.type);
        if (isInputObjectType(finalType)) {
          this.visitInputFieldsRecursively(
            finalType,
            field,
            arg,
            schema,
            directiveName,
          );
        }
      });
    });

    wrapFieldsRequiringValidation(
      fields,
      ValidateDirectiveVisitor.validationErrorsArgumentName,
    );
  }

  private visitInputFieldsRecursively = (
    inputObject: GraphQLInputObjectType,
    queryField: GraphQLField<unknown, TContext, unknown>,
    arg: GraphQLArgument,
    schema: GraphQLSchema,
    directiveName: string,
    path: string[] = [],
  ): void => {
    const [directive] = getDirective(schema, inputObject, directiveName) ?? [];

    if (directive) {
      this.args = directive as TArgs;
      this.visitInputObject(inputObject);
    }

    Object.values(inputObject.getFields()).forEach(inputField => {
      const [directiveOnInputField] =
        getDirective(schema, inputField, directiveName) ?? [];

      if (directiveOnInputField) {
        this.args = directiveOnInputField as TArgs;
        this.visitInputFieldDefinition(inputField, { objectType: inputObject });
      }

      const inputFieldType = getFinalType(inputField.type);
      if (isInputObjectType(inputFieldType)) {
        this.visitInputFieldsRecursively(
          inputFieldType,
          queryField,
          arg,
          schema,
          directiveName,
          [...path, inputField.name],
        );
      }
    });
  };
}

export default ValidateDirectiveVisitor;
/*
  graphql-tools changed the typing for SchemaDirectiveVisitor and if you define a type for TArgs and TContext,
  you'll get this error: "Type 'typeof Your_Directive_Class' is not assignable to type 'typeof SchemaDirectiveVisitor'.".
  If you are using the old graphql-tools, you can use:
  extends EasyDirectiveVisitor<Record<string, never>, TContext>
*/
export const ValidateDirectiveVisitorNonTyped: typeof ValidateDirectiveVisitor<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
> = ValidateDirectiveVisitor;
