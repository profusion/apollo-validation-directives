import {
  GraphQLInputType,
  GraphQLList,
  GraphQLNamedType,
  GraphQLNonNull,
} from 'graphql';

import { ValidateFunction } from './ValidateDirectiveVisitor';

const getListItemType = (
  type: GraphQLNamedType | GraphQLInputType,
): GraphQLNamedType | GraphQLInputType => {
  let itemType = type;
  if (itemType instanceof GraphQLNonNull) itemType = itemType.ofType;
  if (itemType instanceof GraphQLList) itemType = itemType.ofType;
  return itemType;
};

// regular usage:
function validateArrayOrValue(
  valueValidator: ValidateFunction,
): ValidateFunction;
// make it easy to use in cases validator is created and may be undefined
function validateArrayOrValue(valueValidator: undefined): undefined;
function validateArrayOrValue(
  valueValidator: undefined | ValidateFunction,
): undefined | ValidateFunction;

// function overload cannot be done on arrow-style
// eslint-disable-next-line func-style
function validateArrayOrValue(
  valueValidator: ValidateFunction | undefined,
): ValidateFunction | undefined {
  if (!valueValidator) {
    return undefined;
  }

  const validate = (
    value: unknown,
    type: GraphQLNamedType | GraphQLInputType,
  ): unknown => {
    if (Array.isArray(value)) {
      const itemType = getListItemType(type);
      return value.map(item => validate(item, itemType));
    }
    return valueValidator(value, type);
  };

  return validate;
}

export default validateArrayOrValue;
