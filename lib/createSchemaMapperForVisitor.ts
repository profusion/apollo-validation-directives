import type { SchemaMapper } from '@graphql-tools/utils';
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils';
import type {
  DirectiveLocation,
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
): SchemaMapper => {
  let haveVisitedInputs = false;
  return {
    [MapperKind.OBJECT_TYPE](type, schema): GraphQLObjectType {
      if (!haveVisitedInputs) {
        visitor.addInputTypesValidations(schema, directiveName);
        haveVisitedInputs = true;
      }
      visitor.visitObjectFieldsAndArgumentInputs(type, schema, directiveName);
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
  };
};

export const createSchemaMapperForVisitor =
  <T extends DirectiveLocation>(
    directiveName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visitor: EasyDirectiveVisitor<any, any, T>,
  ): SchemaMapperFunction =>
  (unmappedSchema: GraphQLSchema): GraphQLSchema =>
    mapSchema(unmappedSchema, createMapper(directiveName, visitor));

export default createSchemaMapperForVisitor;
