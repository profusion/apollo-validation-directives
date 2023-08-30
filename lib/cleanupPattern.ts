import { GraphQLNonNull, GraphQLString } from 'graphql';

import type { ValidateFunction } from './ValidateDirectiveVisitor.js';
import createValidateDirectiveVisitor from './createValidateDirectiveVisitor.js';
import type { PatternDirectiveArgs } from './patternCommon.js';
import createPatternHandler, { defaultArgs } from './patternCommon.js';

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

const Visitor = createValidateDirectiveVisitor({
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

export default Visitor;
