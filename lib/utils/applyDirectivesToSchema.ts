import type { DirectiveLocation, GraphQLSchema } from 'graphql';

import type EasyDirectiveVisitor from '../EasyDirectiveVisitor.js';

interface EasyDirectiveVisitorConstructor<T extends DirectiveLocation> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (): EasyDirectiveVisitor<any, any, T>;
}

const applyDirectivesToSchema = <T extends DirectiveLocation>(
  directives: EasyDirectiveVisitorConstructor<T>[],
  schema: GraphQLSchema,
): GraphQLSchema =>
  directives.reduce(
    (mappedSchema, Directive) => new Directive().applyToSchema(mappedSchema),
    schema,
  );

export default applyDirectivesToSchema;
