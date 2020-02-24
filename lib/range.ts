import { GraphQLFloat } from 'graphql';
import { ValidationError } from 'apollo-server-errors';

import { ValidateFunction } from './ValidateDirectiveVisitor';
import createValidateDirectiveVisitor from './createValidateDirectiveVisitor';

const createValidateMinMax = (min: number, max: number): ValidateFunction => {
  if (max < min)
    throw new RangeError('@range(max) must be at least equal to min');
  const errorMessageMin = `Less than ${min}`;
  const errorMessageMax = `More than ${max}`;
  return (value: unknown): unknown => {
    if (typeof value === 'number') {
      if (value < min) throw new ValidationError(errorMessageMin);
      if (value > max) throw new ValidationError(errorMessageMax);
    }
    return value;
  };
};

const createValidateMin = (min: number): ValidateFunction => {
  const errorMessage = `Less than ${min}`;
  return (value: unknown): unknown => {
    if (typeof value === 'number') {
      if (value < min) throw new ValidationError(errorMessage);
    }
    return value;
  };
};

const createValidateMax = (max: number): ValidateFunction => {
  const errorMessage = `More than ${max}`;
  return (value: unknown): unknown => {
    if (typeof value === 'number') {
      if (value > max) throw new ValidationError(errorMessage);
    }
    return value;
  };
};

type RangeDirectiveArgs = {
  min: number | null;
  max: number | null;
};

// istanbul ignore next (args set by default to null)
const createValidate = ({
  min = null,
  max = null,
}: RangeDirectiveArgs): ValidateFunction | undefined => {
  if (min !== null && max !== null) return createValidateMinMax(min, max);
  if (min !== null) return createValidateMin(min);
  if (max !== null) return createValidateMax(max);
  return undefined;
};

export default createValidateDirectiveVisitor({
  createValidate,
  defaultName: 'range',
  directiveConfig: {
    args: {
      max: {
        defaultValue: null,
        description:
          'The maximum value (inclusive) to allow. If null, no upper limit is applied',
        type: GraphQLFloat,
      },
      min: {
        defaultValue: null,
        description:
          'The minimum value (inclusive) to allow. If null, no lower limit is applied',
        type: GraphQLFloat,
      },
    },
    description:
      'Ensures value is within boundaries. If used on lists, applies to every item.',
  },
});
