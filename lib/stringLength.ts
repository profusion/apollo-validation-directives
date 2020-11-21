import { GraphQLFloat, GraphQLString } from 'graphql';
import { ValidationError } from 'apollo-server-errors';

import {
  ValidateFunction,
  ValidationDirectiveArgs,
} from './ValidateDirectiveVisitor';
import createValidateDirectiveVisitor from './createValidateDirectiveVisitor';

const createValidateMinMax = (
  min: number,
  max: number,
  fieldName: string,
): ValidateFunction => {
  if (min < 0) throw new RangeError('@stringLength(min) must be at least 0');
  if (max < min)
    throw new RangeError('@stringLength(max) must be at least equal to min');
  const errorMessageMin = `${fieldName} Length is Less than ${min}`;
  const errorMessageMax = `${fieldName} Length is More than ${max}`;
  return (value: unknown): unknown => {
    if (typeof value === 'string') {
      const { length } = value;
      if (length < min) throw new ValidationError(errorMessageMin);
      if (length > max) throw new ValidationError(errorMessageMax);
    }
    return value;
  };
};

const createValidateMin = (
  min: number,
  fieldName: string,
): ValidateFunction => {
  if (min < 0) throw new RangeError('@stringLength(min) must be at least 0');
  const errorMessage = `${fieldName} Length is Less than ${min}`;
  return (value: unknown): unknown => {
    if (typeof value === 'string') {
      if (value.length < min) throw new ValidationError(errorMessage);
    }
    return value;
  };
};

const createValidateMax = (
  max: number,
  fieldName: string,
): ValidateFunction => {
  if (max < 0) throw new RangeError('@stringLength(max) must be at least 0');
  const errorMessage = `${fieldName} Length is More than ${max}`;
  return (value: unknown): unknown => {
    if (typeof value === 'string') {
      if (value.length > max) throw new ValidationError(errorMessage);
    }
    return value;
  };
};

type StringLengthDirectiveArgs = {
  min: number | null;
  max: number | null;
  fieldName: string;
} & ValidationDirectiveArgs;

// istanbul ignore next (args set by default to null)
const createValidate = ({
  min = null,
  max = null,
  fieldName = 'String',
}: StringLengthDirectiveArgs): ValidateFunction | undefined => {
  if (min !== null && max !== null)
    return createValidateMinMax(min, max, fieldName);
  if (min !== null) return createValidateMin(min, fieldName);
  if (max !== null) return createValidateMax(max, fieldName);
  return undefined;
};

export default createValidateDirectiveVisitor({
  createValidate,
  defaultName: 'stringLength',
  directiveConfig: {
    args: {
      fieldName: {
        defaultValue: 'String',
        description:
          'The field name identifier. Defaults to "String" if not provided',
        type: GraphQLString,
      },
      max: {
        defaultValue: null,
        description:
          'The maximum string length (inclusive) to allow. If null, no upper limit is applied',
        type: GraphQLFloat,
      },
      min: {
        defaultValue: null,
        description:
          'The minimum string length (inclusive) to allow. If null, no lower limit is applied',
        type: GraphQLFloat,
      },
    },
    description:
      'Ensures string length is within boundaries. If used on lists, applies to every item.',
  },
});
