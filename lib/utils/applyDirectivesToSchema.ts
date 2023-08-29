import type { GraphQLSchema } from 'graphql';

import type EasyDirectiveVisitor from '../EasyDirectiveVisitor.js';

interface EasyDirectiveVisitorConstructor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (): EasyDirectiveVisitor<any, any>;
}

const applyDirectivesToSchema = (
  directives: EasyDirectiveVisitorConstructor[],
  schema: GraphQLSchema,
): GraphQLSchema =>
  directives.reduce(
    (mappedSchema, Directive) => new Directive().applyToSchema(mappedSchema),
    schema,
  );

export default applyDirectivesToSchema;
