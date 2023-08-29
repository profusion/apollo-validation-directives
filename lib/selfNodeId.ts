import type { GraphQLObjectType, GraphQLInterfaceType } from 'graphql';
import { DirectiveLocation } from 'graphql';

import ValidationError from './errors/ValidationError';

import type { ValidateFunction } from './ValidateDirectiveVisitor';
import type ValidateDirectiveVisitor from './ValidateDirectiveVisitor';
import {
  setFieldResolveToApplyOriginalResolveAndThenValidateResult,
  ValidateDirectiveVisitorNonTyped,
} from './ValidateDirectiveVisitor';

type ToNodeId = (entityName: string, id: string) => string | null;

export type SelfNodeIdContext<_ extends object = object> = {
  toNodeId: ToNodeId;
};

/*
  graphql-tools changed the typing for SchemaDirectiveVisitor and if you define a type for TArgs and TContext,
  you'll get this error: "Type 'typeof Your_Directive_Class' is not assignable to type 'typeof SchemaDirectiveVisitor'.".
  If you are using the old graphql-tools, you can use:
  extends ValidateDirectiveVisitor<TArgs, TContext>
*/
export default class SelfNodeIdDirective<
  _ extends SelfNodeIdContext,
> extends ValidateDirectiveVisitorNonTyped {
  // eslint-disable-next-line class-methods-use-this
  public getValidationForArgs(): ValidateFunction<SelfNodeIdContext> {
    const errorMessage = `selfNodeId directive only works on strings`;
    return (
      value: unknown,
      _,
      { name },
      { toNodeId },
    ): string | undefined | null => {
      if (typeof value !== 'string') {
        if (value === undefined || value === null) {
          return value;
        }
        throw new ValidationError(errorMessage);
      }
      const encodedId = toNodeId(name, value);
      if (!encodedId) {
        throw new ValidationError(`Could not encode ID to typename ${name}`);
      }
      return encodedId;
    };
  }

  public static readonly config: (typeof ValidateDirectiveVisitor)['config'] = {
    description: 'ensures that the ID is converted to a global ID',
    locations: [DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT],
  };

  public visitObject(object: GraphQLObjectType | GraphQLInterfaceType): void {
    const validate = this.getValidationForArgs();
    let foundId = false;
    const fields = Object.values(object.getFields());
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i];
      if (field.name === 'id') {
        setFieldResolveToApplyOriginalResolveAndThenValidateResult(
          field,
          validate,
          object as GraphQLObjectType,
        );
        foundId = true;
        break;
      }
    }
    if (!foundId) {
      throw new ValidationError(`id field was not found in ${object.name}`);
    }
  }

  public static readonly defaultName: string = 'selfNodeId';

  public static createDirectiveContext(ctx: {
    toNodeId: ToNodeId;
  }): SelfNodeIdContext {
    return ctx;
  }
}
