import { GraphQLEnumType, GraphQLNonNull } from 'graphql';

import {
  ValidateFunction,
  ValidationDirectiveArgs,
} from './ValidateDirectiveVisitor';
import createValidateDirectiveVisitor from './createValidateDirectiveVisitor';
import neverAssertion from './utils/neverAssertion';
import createPatternHandler from './patternCommon';

export enum TrimMode {
  TRIM_ALL = 'TRIM_ALL',
  TRIM_END = 'TRIM_END',
  TRIM_START = 'TRIM_START',
}

export const DEFAULT_TRIM_MODE = TrimMode.TRIM_ALL;

export const trimDirectiveSchemaEnumName = 'TrimDirectiveMode';

type TrimDirectiveArgs = ValidationDirectiveArgs & { mode: TrimMode };

const trimAllHandler = createPatternHandler((value: string): string =>
  value.trim(),
);

const trimEndHandler = createPatternHandler((value: string): string =>
  value.trimRight(),
);

const trimStartHandler = createPatternHandler((value: string): string =>
  value.trimLeft(),
);

export const createValidate = ({
  mode,
}: TrimDirectiveArgs): ValidateFunction => {
  switch (mode) {
    case TrimMode.TRIM_ALL:
      return trimAllHandler;
    case TrimMode.TRIM_END:
      return trimEndHandler;
    case TrimMode.TRIM_START:
      return trimStartHandler;
    default:
      return neverAssertion(mode);
  }
};

export default createValidateDirectiveVisitor({
  createValidate,
  defaultName: 'trim',
  directiveConfig: {
    args: {
      mode: {
        defaultValue: DEFAULT_TRIM_MODE,
        type: new GraphQLNonNull(
          new GraphQLEnumType({
            name: trimDirectiveSchemaEnumName,
            values: {
              [TrimMode.TRIM_ALL]: {
                description:
                  'The value of this field will have both start and end of the string trimmed',
                value: TrimMode.TRIM_ALL,
              },
              [TrimMode.TRIM_END]: {
                description:
                  'The value of this field will have only the end of the string trimmed',
                value: TrimMode.TRIM_END,
              },
              [TrimMode.TRIM_START]: {
                description:
                  'The value of this field will have only the start of the string trimmed',
                value: TrimMode.TRIM_START,
              },
            },
          }),
        ),
      },
    },
    description: 'trims a string based on the selected mode',
  },
});
