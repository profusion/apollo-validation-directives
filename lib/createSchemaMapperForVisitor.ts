import type { SchemaMapper } from '@graphql-tools/utils';
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils';
import type {
  DirectiveLocation,
  GraphQLArgument,
  GraphQLFieldConfig,
  GraphQLObjectType,
  GraphQLSchema,
} from 'graphql';
import { isObjectType } from 'graphql';

import type EasyDirectiveVisitor from './EasyDirectiveVisitor.js';

export type SchemaMapperFunction = (schema: GraphQLSchema) => GraphQLSchema;

export const createMapper = <T extends DirectiveLocation>(
  directiveName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visitor: EasyDirectiveVisitor<any, any, T>,
): SchemaMapper => ({
  [MapperKind.QUERY](query, schema): GraphQLObjectType {
    visitor.visitQuery(query, schema, directiveName);
    return query;
  },
  [MapperKind.MUTATION](mutation, schema): GraphQLObjectType {
    visitor.visitMutation(mutation, schema, directiveName);
    return mutation;
  },
  [MapperKind.OBJECT_TYPE](type, schema): GraphQLObjectType {
    Object.values(type.getFields()).forEach(field => {
      field.args.forEach(arg => {
        const [directive] = getDirective(schema, arg, directiveName) ?? [];
        if (!directive) return;
        // eslint-disable-next-line no-param-reassign
        visitor.args = directive;
        visitor.visitArgumentDefinition(arg as GraphQLArgument, {
          field,
        });
      });
    });
    const [directive] = getDirective(schema, type, directiveName) ?? [];
    if (!directive) return type;
    // eslint-disable-next-line no-param-reassign
    visitor.args = directive;
    visitor.visitObject(type);
    return type;
  },
  [MapperKind.OBJECT_FIELD](
    fieldConfig,
    _fieldName,
    typeName,
    schema,
  ): GraphQLFieldConfig<unknown, unknown> {
    const [directive] = getDirective(schema, fieldConfig, directiveName) ?? [];
    if (!directive) return fieldConfig;
    // eslint-disable-next-line no-param-reassign
    visitor.args = directive;
    const objectType = schema.getType(typeName);
    if (isObjectType(objectType)) {
      visitor.visitFieldDefinition(fieldConfig, {
        objectType,
      });
    }
    return fieldConfig;
  },
});

export const createSchemaMapperForVisitor =
  <T extends DirectiveLocation>(
    directiveName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visitor: EasyDirectiveVisitor<any, any, T>,
  ): SchemaMapperFunction =>
  (unmappedSchema: GraphQLSchema): GraphQLSchema =>
    mapSchema(unmappedSchema, createMapper(directiveName, visitor));

export default createSchemaMapperForVisitor;
