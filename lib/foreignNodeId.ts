import { DirectiveLocation, GraphQLNonNull, GraphQLString } from 'graphql';

import type {
  ValidateFunction,
  ValidationDirectiveArgs,
} from './ValidateDirectiveVisitor';
import { ValidateDirectiveVisitorNonTyped } from './ValidateDirectiveVisitor';
import validateArrayOrValue from './validateArrayOrValue';
import ValidationError from './errors/ValidationError';

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
  _ extends ForeignNodeIdContext<IdType>,
> extends ValidateDirectiveVisitorNonTyped {
  // eslint-disable-next-line class-methods-use-this
  public getValidationForArgs():
    | ValidateFunction<ForeignNodeIdContext<IdType>>
    | undefined {
    const { typename } = this.args;
    const wrongUsageErrorMessage = `foreignNodeId directive only works on strings`;
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

  public static readonly config: (typeof ValidateDirectiveVisitorNonTyped)['config'] =
    {
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

/*
  graphql-tools changed the typing for SchemaDirectiveVisitor and if you define a type for TArgs and TContext,
  you'll get this error: "Type 'typeof Your_Directive_Class' is not assignable to type 'typeof SchemaDirectiveVisitor'.".
  If you are using the old graphql-tools, you can use:
  extends EasyDirectiveVisitor<Record<string, never>, TContext>
*/
export const ForeignNodeIdDirectiveNonTyped: typeof ForeignNodeIdDirective<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
> = ForeignNodeIdDirective;
