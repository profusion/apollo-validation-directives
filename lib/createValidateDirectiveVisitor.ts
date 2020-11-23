import ValidateDirectiveVisitor, {
  ValidateFunction,
  ValidationDirectiveArgs,
} from './ValidateDirectiveVisitor';
import validateArrayOrValue from './validateArrayOrValue';

export type CreateValidate<TArgs extends object> = (
  args: TArgs,
) => ValidateFunction | undefined;

export class ConcreteValidateDirectiveVisitor<
  TArgs extends ValidationDirectiveArgs
> extends ValidateDirectiveVisitor<TArgs> {
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
  directiveConfig?: Partial<typeof ValidateDirectiveVisitor['config']>;
  extraCommonTypes?: typeof ValidateDirectiveVisitor['commonTypes'];
  isValidateArrayOrValue?: boolean; // if true uses validateArrayOrValue()
}): typeof ConcreteValidateDirectiveVisitor => {
  class CreateValidateDirectiveVisitor extends ConcreteValidateDirectiveVisitor<
    TArgs
  > {
    public static readonly commonTypes = extraCommonTypes
      ? ValidateDirectiveVisitor.commonTypes.concat(extraCommonTypes)
      : ValidateDirectiveVisitor.commonTypes;

    public static readonly config = directiveConfig
      ? ({
          ...ValidateDirectiveVisitor.config,
          ...directiveConfig,
        } as const)
      : ValidateDirectiveVisitor.config;

    public static readonly defaultName = defaultName;

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
