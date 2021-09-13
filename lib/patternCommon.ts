import { ValidationError } from 'apollo-server-errors';
import { GraphQLNonNull, GraphQLString } from 'graphql';

import {
  ValidationDirectiveArgs,
  ValidateFunction,
} from './ValidateDirectiveVisitor';

export type PatternDirectiveArgs = {
  regexp: string;
  flags?: string | null;
} & ValidationDirectiveArgs;

export type PatternHandler = (
  strValue: string,
  orginalValue: unknown,
) => unknown;

export const defaultArgs = {
  flags: { type: GraphQLString },
  regexp: { type: new GraphQLNonNull(GraphQLString) },
};

const createPatternHandler = (handler: PatternHandler): ValidateFunction => (
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
  } else if (value === undefined) {
    return value;
  } else {
    throw new ValidationError('could not convert value to string');
  }
  return handler(str, value);
};

export default createPatternHandler;
