import type { SourceLocation } from 'graphql';
import { GraphQLError } from 'graphql';

export default class ValidationError extends GraphQLError {
  path: string[];

  locations: SourceLocation[];

  constructor(message: string) {
    super(message, {
      extensions: {
        code: 'GRAPHQL_VALIDATION_FAILED',
      },
    });
    Object.defineProperty(this, 'name', { value: ValidationError.name });
  }
}
