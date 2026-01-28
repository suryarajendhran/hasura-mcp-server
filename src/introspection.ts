export type IntrospectionTypeRef = {
  kind: string;
  name: string | null;
  ofType: IntrospectionTypeRef | null;
};

export type IntrospectionField = {
  name: string;
  description: string | null;
  type: IntrospectionTypeRef;
  args: Array<{
    name: string;
    description: string | null;
    type: IntrospectionTypeRef;
  }>;
};

export type IntrospectionType = {
  kind: string;
  name: string;
  description: string | null;
  fields?: IntrospectionField[] | null;
  inputFields?: Array<{ name: string; type: IntrospectionTypeRef }> | null;
  enumValues?: Array<{ name: string; description: string | null }> | null;
};

export type IntrospectionSchema = {
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

export function unwrapType(type: IntrospectionTypeRef): {
  name: string | null;
  kind: string;
  isList: boolean;
  isNonNull: boolean;
} {
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

export function toTypeString(type: IntrospectionTypeRef): string {
  if (type.kind === "NON_NULL" && type.ofType) {
    return `${toTypeString(type.ofType)}!`;
  }
  if (type.kind === "LIST" && type.ofType) {
    return `[${toTypeString(type.ofType)}]`;
  }
  return type.name ?? type.kind;
}

export function isScalarOrEnum(typeName: string | null, schema: IntrospectionSchema): boolean {
  if (!typeName) return false;
  const found = schema.types.find((t) => t.name === typeName);
  if (!found) return false;
  return found.kind === "SCALAR" || found.kind === "ENUM";
}

export function isLikelyTableType(type: IntrospectionType): boolean {
  if (type.kind !== "OBJECT") return false;
  if (!type.name || type.name.startsWith("__")) return false;
  if (ROOT_TYPE_NAMES.has(type.name)) return false;
  if (IGNORE_TYPE_SUFFIXES.some((suffix) => type.name.endsWith(suffix))) return false;
  if (!type.fields || type.fields.length === 0) return false;
  return true;
}

export function getRootTypeName(
  schema: IntrospectionSchema,
  operation: "query" | "mutation" | "subscription"
): string {
  if (operation === "query") return schema.queryType?.name ?? "query_root";
  if (operation === "mutation") return schema.mutationType?.name ?? "mutation_root";
  return schema.subscriptionType?.name ?? "subscription_root";
}

export function getTypeByName(schema: IntrospectionSchema, name: string): IntrospectionType | undefined {
  return schema.types.find((t) => t.name === name);
}
