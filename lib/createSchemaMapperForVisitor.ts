import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils';
import type { DirectiveLocation, GraphQLSchema } from 'graphql';
import { isObjectType } from 'graphql';

import type EasyDirectiveVisitor from './EasyDirectiveVisitor.js';

export type SchemaMapperFunction = (schema: GraphQLSchema) => GraphQLSchema;

export const createSchemaMapperForVisitor =
  <T extends DirectiveLocation>(
    directiveName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visitor: EasyDirectiveVisitor<any, any, T>,
  ): SchemaMapperFunction =>
  (unmappedSchema: GraphQLSchema): GraphQLSchema => {
    return mapSchema(unmappedSchema, {
      [MapperKind.QUERY](query, schema) {
        visitor.visitQuery(query, schema, directiveName);
        return query;
      },
      [MapperKind.OBJECT_TYPE](type, schema) {
        const [directive] = getDirective(schema, type, directiveName) ?? [];
        if (!directive) return type;
        // eslint-disable-next-line no-param-reassign
        visitor.args = directive;
        visitor.visitObject(type);
        return type;
      },
      [MapperKind.OBJECT_FIELD](fieldConfig, _fieldName, typeName, schema) {
        // query fields will be handled by MapperKind.QUERY
        if (typeName === 'Query') return fieldConfig;
        const [directive] =
          getDirective(schema, fieldConfig, directiveName) ?? [];
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
  };

export default createSchemaMapperForVisitor;
