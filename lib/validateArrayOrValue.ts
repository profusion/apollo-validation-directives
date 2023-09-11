import type {
  GraphQLInputType,
  GraphQLNamedType,
  GraphQLOutputType,
} from 'graphql';
import { GraphQLList, GraphQLNonNull } from 'graphql';

import type { ValidateFunction } from './ValidateDirectiveVisitor.js';

const getListItemType = (
  type: GraphQLNamedType | GraphQLInputType | GraphQLOutputType,
): GraphQLNamedType | GraphQLInputType | GraphQLOutputType => {
  let itemType = type;
  if (itemType instanceof GraphQLNonNull) itemType = itemType.ofType;
  if (itemType instanceof GraphQLList) itemType = itemType.ofType;
  return itemType;
};

// regular usage:
function validateArrayOrValue<TContext = object>(
  valueValidator: ValidateFunction<TContext>,
): ValidateFunction<TContext>;
// make it easy to use in cases validator is created and may be undefined
function validateArrayOrValue(valueValidator: undefined): undefined;
function validateArrayOrValue<TContext = object>(
  valueValidator: undefined | ValidateFunction<TContext>,
): undefined | ValidateFunction<TContext>;

// function overload cannot be done on arrow-style
// eslint-disable-next-line func-style
function validateArrayOrValue<TContext = object>(
  valueValidator: ValidateFunction<TContext> | undefined,
): ValidateFunction<TContext> | undefined {
  if (!valueValidator) {
    return undefined;
  }

  const validate: ValidateFunction<TContext> = (
    value: unknown,
    type: GraphQLNamedType | GraphQLOutputType | GraphQLInputType,
    ...rest
  ): unknown => {
    if (Array.isArray(value)) {
      const itemType = getListItemType(type);
      return value.map(item => validate(item, itemType, ...rest));
    }
    return valueValidator(value, type, ...rest);
  };

  return validate;
}

export default validateArrayOrValue;
