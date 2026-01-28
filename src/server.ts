import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GraphQLClient } from "graphql-request";
import { getIntrospectionQuery } from "graphql";
import { z } from "zod";

export type ServerOptions = {
  endpoint: string;
  adminSecret: string;
};

type IntrospectionTypeRef = {
  kind: string;
  name: string | null;
  ofType: IntrospectionTypeRef | null;
};

type IntrospectionField = {
  name: string;
  description: string | null;
  type: IntrospectionTypeRef;
  args: Array<{
    name: string;
    description: string | null;
    type: IntrospectionTypeRef;
  }>;
};

type IntrospectionType = {
  kind: string;
  name: string;
  description: string | null;
  fields?: IntrospectionField[] | null;
  inputFields?: Array<{ name: string; type: IntrospectionTypeRef }> | null;
  enumValues?: Array<{ name: string; description: string | null }> | null;
};

type IntrospectionSchema = {
  queryType: { name: string } | null;
  mutationType: { name: string } | null;
  subscriptionType: { name: string } | null;
  types: IntrospectionType[];
};

const IGNORE_TYPE_SUFFIXES = [
  "_aggregate",
  "_aggregate_fields",
  "_aggregate_order_by",
  "_avg_fields",
  "_bool_exp",
  "_comparison_exp",
  "_constraint",
  "_inc_input",
  "_max_fields",
  "_min_fields",
  "_mutation_response",
  "_order_by",
  "_pk_columns_input",
  "_select_column",
  "_set_input",
  "_stddev_fields",
  "_stddev_pop_fields",
  "_stddev_samp_fields",
  "_sum_fields",
  "_var_pop_fields",
  "_var_samp_fields",
  "_variance_fields",
  "_stream_cursor_input",
  "_stream_cursor_value_input"
];

const ROOT_TYPE_NAMES = new Set(["query_root", "mutation_root", "subscription_root"]);

function unwrapType(type: IntrospectionTypeRef): { name: string | null; kind: string; isList: boolean; isNonNull: boolean } {
  let current = type;
  let isList = false;
  let isNonNull = false;

  while (current.ofType) {
    if (current.kind === "NON_NULL") {
      isNonNull = true;
    }
    if (current.kind === "LIST") {
      isList = true;
    }
    current = current.ofType;
  }

  return { name: current.name, kind: current.kind, isList, isNonNull };
}

function toTypeString(type: IntrospectionTypeRef): string {
  if (type.kind === "NON_NULL" && type.ofType) {
    return `${toTypeString(type.ofType)}!`;
  }
  if (type.kind === "LIST" && type.ofType) {
    return `[${toTypeString(type.ofType)}]`;
  }
  return type.name ?? type.kind;
}

function isScalarOrEnum(typeName: string | null, schema: IntrospectionSchema): boolean {
  if (!typeName) return false;
  const found = schema.types.find((t) => t.name === typeName);
  if (!found) return false;
  return found.kind === "SCALAR" || found.kind === "ENUM";
}

function isLikelyTableType(type: IntrospectionType): boolean {
  if (type.kind !== "OBJECT") return false;
  if (!type.name || type.name.startsWith("__")) return false;
  if (ROOT_TYPE_NAMES.has(type.name)) return false;
  if (IGNORE_TYPE_SUFFIXES.some((suffix) => type.name.endsWith(suffix))) return false;
  if (!type.fields || type.fields.length === 0) return false;
  return true;
}

export async function startServer(options: ServerOptions): Promise<void> {
  const client = new GraphQLClient(options.endpoint, {
    headers: {
      "x-hasura-admin-secret": options.adminSecret
    }
  });

  const server = new McpServer({
    name: "hasura-mcp-server",
    version: "0.1.0"
  });

  let schemaCache: IntrospectionSchema | null = null;

  async function getSchema(): Promise<IntrospectionSchema> {
    if (schemaCache) return schemaCache;
    const data = await client.request<{ __schema: IntrospectionSchema }>(getIntrospectionQuery());
    schemaCache = data.__schema;
    return schemaCache;
  }

  function getRootType(schema: IntrospectionSchema, operation: "query" | "mutation" | "subscription") {
    if (operation === "query") return schema.queryType?.name ?? "query_root";
    if (operation === "mutation") return schema.mutationType?.name ?? "mutation_root";
    return schema.subscriptionType?.name ?? "subscription_root";
  }

  function getTypeByName(schema: IntrospectionSchema, name: string): IntrospectionType | undefined {
    return schema.types.find((t) => t.name === name);
  }

  function formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  server.resource(
    "schema",
    new ResourceTemplate("hasura://schema", { list: undefined }),
    async (uri) => {
      const schema = await getSchema();
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(schema, null, 2)
          }
        ]
      };
    }
  );

  server.tool(
    "health_check",
    { healthEndpointUrl: z.string().url().optional() },
    async ({ healthEndpointUrl }) => {
      try {
        if (healthEndpointUrl) {
          const response = await fetch(healthEndpointUrl, { method: "GET" });
          const text = await response.text();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ status: response.status, body: text.trim() }, null, 2)
              }
            ]
          };
        }

        const data = await client.request("query { __typename }");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Health check failed: ${formatError(error)}` }] };
      }
    }
  );

  server.tool(
    "list_tables",
    { schemaName: z.string().optional() },
    async () => {
      try {
        const schema = await getSchema();
        const tables = schema.types.filter(isLikelyTableType).map((t) => t.name).sort();
        return { content: [{ type: "text", text: JSON.stringify({ tables }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Failed to list tables: ${formatError(error)}` }] };
      }
    }
  );

  server.tool(
    "describe_table",
    { tableName: z.string(), schemaName: z.string().optional() },
    async ({ tableName, schemaName }) => {
      try {
        const schema = await getSchema();
        const candidates = [tableName];
        if (schemaName) {
          candidates.push(`${schemaName}_${tableName}`);
        }
        const lower = tableName.toLowerCase();
        const type =
          candidates.map((name) => getTypeByName(schema, name)).find(Boolean) ??
          schema.types.find((t) => t.name.toLowerCase() === lower);
        if (!type || !type.fields) {
          return { content: [{ type: "text", text: `Table not found: ${tableName}` }] };
        }
        const fields = type.fields.map((field) => ({
          name: field.name,
          description: field.description,
          type: toTypeString(field.type),
          isList: unwrapType(field.type).isList,
          isNullable: !unwrapType(field.type).isNonNull
        }));
        return { content: [{ type: "text", text: JSON.stringify({ tableName, fields }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Failed to describe table: ${formatError(error)}` }] };
      }
    }
  );

  server.tool(
    "list_root_fields",
    { fieldType: z.enum(["QUERY", "MUTATION", "SUBSCRIPTION"]).optional() },
    async ({ fieldType }) => {
      try {
        const schema = await getSchema();
        const op = (fieldType ?? "QUERY").toLowerCase() as "query" | "mutation" | "subscription";
        const rootTypeName = getRootType(schema, op);
        const rootType = getTypeByName(schema, rootTypeName);
        if (!rootType || !rootType.fields) {
          return { content: [{ type: "text", text: `Root type not found for ${op}` }] };
        }
        const fields = rootType.fields.map((field) => ({
          name: field.name,
          description: field.description,
          type: toTypeString(field.type),
          args: field.args.map((arg) => ({
            name: arg.name,
            type: toTypeString(arg.type)
          }))
        }));
        return { content: [{ type: "text", text: JSON.stringify({ fieldType: op.toUpperCase(), fields }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Failed to list root fields: ${formatError(error)}` }] };
      }
    }
  );

  server.tool(
    "describe_graphql_type",
    { typeName: z.string() },
    async ({ typeName }) => {
      try {
        const schema = await getSchema();
        const found = getTypeByName(schema, typeName);
        if (!found) {
          return { content: [{ type: "text", text: `Type not found: ${typeName}` }] };
        }
        const details = {
          name: found.name,
          kind: found.kind,
          description: found.description,
          fields: found.fields?.map((field) => ({
            name: field.name,
            description: field.description,
            type: toTypeString(field.type),
            args: field.args.map((arg) => ({
              name: arg.name,
              type: toTypeString(arg.type)
            }))
          })),
          enumValues: found.enumValues?.map((value) => ({
            name: value.name,
            description: value.description
          })),
          inputFields: found.inputFields?.map((field) => ({
            name: field.name,
            type: toTypeString(field.type)
          }))
        };
        return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Failed to describe type: ${formatError(error)}` }] };
      }
    }
  );

  server.tool(
    "preview_table_data",
    { tableName: z.string(), limit: z.number().int().positive().optional() },
    async ({ tableName, limit }) => {
      try {
        const schema = await getSchema();
        const rootTypeName = getRootType(schema, "query");
        const rootType = getTypeByName(schema, rootTypeName);
        const field = rootType?.fields?.find((f) => f.name === tableName);
        if (!field) {
          return { content: [{ type: "text", text: `Query root field not found: ${tableName}` }] };
        }

        const named = unwrapType(field.type);
        const tableType = named.name ? getTypeByName(schema, named.name) : undefined;
        if (!tableType || !tableType.fields) {
          return { content: [{ type: "text", text: `Cannot resolve object type for ${tableName}` }] };
        }

        const scalarFields = tableType.fields
          .filter((f) => {
            const info = unwrapType(f.type);
            return isScalarOrEnum(info.name, schema);
          })
          .map((f) => f.name);

        if (scalarFields.length === 0) {
          return { content: [{ type: "text", text: `No scalar fields found for ${tableName}` }] };
        }

        const selection = scalarFields.join(" ");
        const query = `query PreviewTable($limit: Int) { ${tableName}(limit: $limit) { ${selection} } }`;
        const data = await client.request(query, { limit: limit ?? 5 });

        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Failed to preview data: ${formatError(error)}` }] };
      }
    }
  );

  server.tool(
    "aggregate_data",
    {
      tableName: z.string(),
      aggregateFunction: z.enum(["count", "sum", "avg", "min", "max"]),
      field: z.string().optional(),
      filter: z.record(z.any()).optional()
    },
    async ({ tableName, aggregateFunction, field, filter }) => {
      try {
        if (aggregateFunction !== "count" && !field) {
          return { content: [{ type: "text", text: "Field is required for this aggregation." }] };
        }

        const aggregateField =
          aggregateFunction === "count"
            ? "count"
            : `${aggregateFunction} { ${field} }`;

        const varDef = filter ? `($where: ${tableName}_bool_exp!)` : "";
        const whereArg = filter ? "(where: $where)" : "";
        const query = `query Aggregate${varDef} { ${tableName}_aggregate${whereArg} { aggregate { ${aggregateField} } } }`;

        const data = await client.request(query, filter ? { where: filter } : undefined);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Failed to aggregate data: ${formatError(error)}` }] };
      }
    }
  );

  const graphqlInput = {
    query: z.string(),
    variables: z.record(z.any()).optional()
  };

  server.tool(
    "run_graphql_query",
    graphqlInput,
    async ({ query, variables }) => {
      if (/\bmutation\b/i.test(query)) {
        return { content: [{ type: "text", text: "Query contains mutation keyword. Use run_graphql_mutation instead." }] };
      }
      try {
        const data = await client.request(query, variables ?? {});
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `GraphQL query failed: ${formatError(error)}` }] };
      }
    }
  );

  server.tool(
    "run_graphql_mutation",
    { mutation: z.string(), variables: z.record(z.any()).optional() },
    async ({ mutation, variables }) => {
      if (!/\bmutation\b/i.test(mutation)) {
        return { content: [{ type: "text", text: "Mutation keyword not found. Ensure your GraphQL starts with mutation." }] };
      }
      try {
        const data = await client.request(mutation, variables ?? {});
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `GraphQL mutation failed: ${formatError(error)}` }] };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
