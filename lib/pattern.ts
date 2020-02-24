import { ValidationError } from 'apollo-server-errors';

import { GraphQLNonNull, GraphQLString } from 'graphql';

import { ValidateFunction } from './ValidateDirectiveVisitor';
import createValidateDirectiveVisitor from './createValidateDirectiveVisitor';

const validatePattern = (
  re: RegExp,
  errorMessage: string,
  value: unknown,
): unknown => {
  let str = '';
  // istanbul ignore else (should not reach)
  if (typeof value === 'string') {
    str = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    str = value.toString();
  } else if (typeof value === 'object') {
    if (value === null) {
      return value;
    }
    str = value.toString();
  } else {
    throw new ValidationError('could not convert value to string');
  }
  if (!re.test(str)) {
    throw new ValidationError(errorMessage);
  }
  return value;
};

type PatternDirectiveArgs = {
  regexp: string;
  flags?: string | null;
};

const createValidate = ({
  regexp,
  flags = null,
}: PatternDirectiveArgs): ValidateFunction | undefined => {
  if (!regexp) return undefined;

  const re = new RegExp(regexp, flags || undefined);
  const errorMessage = `Does not match pattern: /${regexp}/${flags || ''}`;
  return (value: unknown): unknown => validatePattern(re, errorMessage, value);
};

export default createValidateDirectiveVisitor({
  createValidate,
  defaultName: 'pattern',
  directiveConfig: {
    args: {
      flags: { type: GraphQLString },
      regexp: { type: new GraphQLNonNull(GraphQLString) },
    },
    description: 'ensures value matches pattern',
  },
});
