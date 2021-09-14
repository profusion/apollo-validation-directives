import { GraphQLNonNull, GraphQLString } from 'graphql';

import { ValidateFunction } from './ValidateDirectiveVisitor';
import createValidateDirectiveVisitor from './createValidateDirectiveVisitor';
import createPatternHandler, {
  PatternDirectiveArgs,
  defaultArgs,
} from './patternCommon';

type CleanUpPatternArgs = PatternDirectiveArgs & { replaceWith: string };

const createValidate = ({
  regexp,
  flags = null,
  replaceWith,
}: CleanUpPatternArgs): ValidateFunction | undefined => {
  if (!regexp) return undefined;
  const re = new RegExp(regexp, flags || undefined);
  return createPatternHandler((value: string): string =>
    value.replace(re, replaceWith),
  );
};

export default createValidateDirectiveVisitor({
  createValidate,
  defaultName: 'cleanupPattern',
  directiveConfig: {
    args: {
      ...defaultArgs,
      replaceWith: {
        defaultValue: '',
        type: new GraphQLNonNull(GraphQLString),
      },
    },
    description: 'replaces a text based on a regex',
  },
});
