import {
  DirectiveLocation,
  GraphQLObjectType,
  GraphQLInterfaceType,
} from 'graphql';
import { ValidationError } from 'apollo-server-errors';

import ValidateDirectiveVisitor, {
  ValidateFunction,
  wrapFieldResolverResult,
  ValidationDirectiveArgs,
} from './ValidateDirectiveVisitor';

type ToNodeId = (entityName: string, id: string) => string | null;

export type SelfNodeIdContext<_ extends object = object> = {
  toNodeId: ToNodeId;
};

export default class SelfNodeIdDirective<
  _ extends SelfNodeIdContext
> extends ValidateDirectiveVisitor<ValidationDirectiveArgs, SelfNodeIdContext> {
  public getValidationForArgs(): ValidateFunction<SelfNodeIdContext> {
    const errorMessage = `${this.name} directive only works on strings`;
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

  public static readonly config: typeof ValidateDirectiveVisitor['config'] = {
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
        wrapFieldResolverResult(field, validate, object as GraphQLObjectType);
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
