import type {
  ValidateFunction,
  ValidationDirectiveArgs,
} from './ValidateDirectiveVisitor';
import { ValidateDirectiveVisitorNonTyped } from './ValidateDirectiveVisitor';
import validateArrayOrValue from './validateArrayOrValue';

export type CreateValidate<TArgs extends object> = (
  args: TArgs,
) => ValidateFunction | undefined;

/*
  graphql-tools changed the typing for SchemaDirectiveVisitor and if you define a type for TArgs and TContext,
  you'll get this error: "Type 'typeof Your_Directive_Class' is not assignable to type 'typeof SchemaDirectiveVisitor'.".
  If you are using the old graphql-tools, you can use:

  export class ConcreteValidateDirectiveVisitor<
    TArgs extends ValidationDirectiveArgs,
    TContext extends object,
  > extends ValidateDirectiveVisitor<TArgs, TContext> {
*/
export class ConcreteValidateDirectiveVisitor extends ValidateDirectiveVisitorNonTyped {
  // istanbul ignore next (this shouldn't be used)
  // eslint-disable-next-line class-methods-use-this
  public getValidationForArgs(): ValidateFunction | undefined {
    throw new Error(
      'ValidateDirectiveVisitor.getValidationForArgs() must be implemented',
    );
  }
}

const createValidateDirectiveVisitor = <TArgs extends ValidationDirectiveArgs>({
  createValidate,
  defaultName,
  directiveConfig,
  extraCommonTypes,
  isValidateArrayOrValue = true,
}: {
  createValidate: CreateValidate<TArgs>;
  defaultName: string;
  directiveConfig?: Partial<
    (typeof ValidateDirectiveVisitorNonTyped)['config']
  >;
  extraCommonTypes?: (typeof ValidateDirectiveVisitorNonTyped)['commonTypes'];
  isValidateArrayOrValue?: boolean; // if true uses validateArrayOrValue()
}): typeof ConcreteValidateDirectiveVisitor => {
  class CreateValidateDirectiveVisitor extends ConcreteValidateDirectiveVisitor {
    public static readonly commonTypes = extraCommonTypes
      ? ValidateDirectiveVisitorNonTyped.commonTypes.concat(extraCommonTypes)
      : ValidateDirectiveVisitorNonTyped.commonTypes;

    public static readonly config = directiveConfig
      ? ({
          ...ValidateDirectiveVisitorNonTyped.config,
          ...directiveConfig,
        } as const)
      : ValidateDirectiveVisitorNonTyped.config;

    public static readonly defaultName = defaultName;

    // eslint-disable-next-line class-methods-use-this
    public getValidationForArgs(): ValidateFunction | undefined {
      const validate = createValidate(this.args);
      if (
        typeof validate === 'function' &&
        !('validateProperties' in validate)
      ) {
        Object.defineProperty(validate, 'validateProperties', {
          value: {
            args: this.args,
            directive: defaultName,
          },
          writable: false,
        });
      }
      return isValidateArrayOrValue ? validateArrayOrValue(validate) : validate;
    }
  }

  Object.defineProperty(CreateValidateDirectiveVisitor, 'name', {
    value: `${
      defaultName[0].toUpperCase() + defaultName.slice(1)
    }DirectiveVisitor`,
    writable: false,
  });

  return CreateValidateDirectiveVisitor as typeof ConcreteValidateDirectiveVisitor;
};

export default createValidateDirectiveVisitor;
