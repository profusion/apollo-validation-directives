import { GraphQLError } from 'graphql';

export default class ForbiddenError extends GraphQLError {
  constructor(message: string) {
    super(message, {
      extensions: {
        code: 'FORBIDDEN',
      },
    });
    Object.defineProperty(this, 'name', { value: ForbiddenError.name });
  }
}
