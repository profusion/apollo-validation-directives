import { GraphQLFloat } from 'graphql';
import { ValidationError } from 'apollo-server-errors';

import { ValidateFunction } from './ValidateDirectiveVisitor';
import createValidateDirectiveVisitor from './createValidateDirectiveVisitor';

const createValidateMinMax = (min: number, max: number): ValidateFunction => {
  if (min < 0) throw new RangeError('@listLength(min) must be at least 0');
  if (max < min)
    throw new RangeError('@listLength(max) must be at least equal to min');
  const errorMessageMin = `List Length is Less than ${min}`;
  const errorMessageMax = `List Length is More than ${max}`;
  return (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const { length } = value;
      if (length < min) throw new ValidationError(errorMessageMin);
      if (length > max) throw new ValidationError(errorMessageMax);
    }
    return value;
  };
};

const createValidateMin = (min: number): ValidateFunction => {
  if (min < 0) throw new RangeError('@listLength(min) must be at least 0');
  const errorMessage = `List Length is Less than ${min}`;
  return (value: unknown): unknown => {
    if (Array.isArray(value)) {
      if (value.length < min) throw new ValidationError(errorMessage);
    }
    return value;
  };
};

const createValidateMax = (max: number): ValidateFunction => {
  if (max < 0) throw new RangeError('@listLength(max) must be at least 0');
  const errorMessage = `List Length is More than ${max}`;
  return (value: unknown): unknown => {
    if (Array.isArray(value)) {
      if (value.length > max) throw new ValidationError(errorMessage);
    }
    return value;
  };
};

type ListLengthDirectiveArgs = {
  min: number | null;
  max: number | null;
};

// istanbul ignore next (args set by default to null)
const createValidate = ({
  min = null,
  max = null,
}: ListLengthDirectiveArgs): ValidateFunction | undefined => {
  if (min !== null && max !== null) return createValidateMinMax(min, max);
  if (min !== null) return createValidateMin(min);
  if (max !== null) return createValidateMax(max);
  return undefined;
};

export default createValidateDirectiveVisitor({
  createValidate,
  defaultName: 'listLength',
  directiveConfig: {
    args: {
      max: {
        defaultValue: null,
        description:
          'The maximum list length (inclusive) to allow. If null, no upper limit is applied',
        type: GraphQLFloat,
      },
      min: {
        defaultValue: null,
        description:
          'The minimum list length (inclusive) to allow. If null, no lower limit is applied',
        type: GraphQLFloat,
      },
    },
    description: 'Ensures list length is within boundaries.',
  },
  isValidateArrayOrValue: false,
});
