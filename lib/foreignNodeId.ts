import { DirectiveLocation, GraphQLNonNull, GraphQLString } from 'graphql';
import { ValidationError } from 'apollo-server-errors';

import ValidateDirectiveVisitor, {
  ValidateFunction,
  ValidationDirectiveArgs,
} from './ValidateDirectiveVisitor';
import validateArrayOrValue from './validateArrayOrValue';

export type ToNodeId<IdType> = (
  id: string,
) => { typename: string; id: IdType } | null;

export type ForeignNodeIdContext<IdType = string, _ extends object = object> = {
  fromNodeId: ToNodeId<IdType>;
};

export type Args = {
  typename: string;
} & ValidationDirectiveArgs;

export default class ForeignNodeIdDirective<
  IdType,
  _ extends ForeignNodeIdContext<IdType>
> extends ValidateDirectiveVisitor<Args, ForeignNodeIdContext<IdType>> {
  public getValidationForArgs():
    | ValidateFunction<ForeignNodeIdContext<IdType>>
    | undefined {
    const { typename } = this.args;
    const wrongUsageErrorMessage = `${this.name} directive only works on strings`;
    const wrongTypeNameErrorMessage = `Converted ID typename does not match. Expected: ${typename}`;
    const couldNotDecodeErrorMessage = `Could not decode ID to ${typename}`;
    const itemValidate = (
      value: unknown,
      _: unknown,
      __: unknown,
      { fromNodeId }: ForeignNodeIdContext<IdType>,
    ): IdType | undefined | null => {
      if (typeof value !== 'string') {
        if (value === null || value === undefined) {
          return value;
        }
        throw new ValidationError(wrongUsageErrorMessage);
      }
      const decodedId = fromNodeId(value);
      if (!decodedId) {
        throw new ValidationError(couldNotDecodeErrorMessage);
      }
      const { id, typename: fromNodeTypeName } = decodedId;
      if (fromNodeTypeName !== typename) {
        throw new ValidationError(wrongTypeNameErrorMessage);
      }
      return id;
    };
    return validateArrayOrValue(itemValidate);
  }

  public static readonly config: typeof ValidateDirectiveVisitor['config'] = {
    args: {
      typename: {
        description: 'The typename that this ID should match',
        type: new GraphQLNonNull(GraphQLString),
      },
    },
    description: 'Converts a global unique ID to a type ID',
    locations: [
      DirectiveLocation.ARGUMENT_DEFINITION,
      DirectiveLocation.INPUT_FIELD_DEFINITION,
    ],
  };

  public static readonly defaultName: string = 'foreignNodeId';

  public static createDirectiveContext<CtxIdType = string>(ctx: {
    fromNodeId: ToNodeId<CtxIdType>;
  }): ForeignNodeIdContext<CtxIdType> {
    return ctx;
  }
}
