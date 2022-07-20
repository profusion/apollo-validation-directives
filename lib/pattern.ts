import { ValidationError } from 'apollo-server-errors';

import type { ValidateFunction } from './ValidateDirectiveVisitor';
import createValidateDirectiveVisitor from './createValidateDirectiveVisitor';
import type { PatternDirectiveArgs } from './patternCommon';
import createPatternHandler, { defaultArgs } from './patternCommon';

const createValidate = ({
  regexp,
  flags = null,
}: PatternDirectiveArgs): ValidateFunction | undefined => {
  if (!regexp) return undefined;

  const re = new RegExp(regexp, flags || undefined);
  const errorMessage = `Does not match pattern: /${regexp}/${flags || ''}`;
  return createPatternHandler((strValue: string, originalValue: unknown) => {
    if (!re.test(strValue)) {
      throw new ValidationError(errorMessage);
    }
    return originalValue;
  });
};

export default createValidateDirectiveVisitor({
  createValidate,
  defaultName: 'pattern',
  directiveConfig: {
    args: {
      ...defaultArgs,
    },
    description: 'ensures value matches pattern',
  },
});
