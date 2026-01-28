import { describe, expect, it } from "vitest";
import {
  getRootTypeName,
  isLikelyTableType,
  isScalarOrEnum,
  toTypeString,
  unwrapType,
  type IntrospectionSchema
} from "../../src/introspection.js";

describe("introspection helpers", () => {
  it("unwrapType returns base type info", () => {
    const typeRef = {
      kind: "NON_NULL",
      name: null,
      ofType: {
        kind: "LIST",
        name: null,
        ofType: {
          kind: "NON_NULL",
          name: null,
          ofType: {
            kind: "OBJECT",
            name: "book",
            ofType: null
          }
        }
      }
    };

    expect(unwrapType(typeRef)).toEqual({
      name: "book",
      kind: "OBJECT",
      isList: true,
      isNonNull: true
    });
  });

  it("toTypeString formats nested types", () => {
    const typeRef = {
      kind: "NON_NULL",
      name: null,
      ofType: {
        kind: "LIST",
        name: null,
        ofType: {
          kind: "OBJECT",
          name: "book",
          ofType: null
        }
      }
    };

    expect(toTypeString(typeRef)).toBe("[book]!");
  });

  it("isScalarOrEnum detects scalar and enum", () => {
    const schema: IntrospectionSchema = {
      queryType: { name: "query_root" },
      mutationType: { name: "mutation_root" },
      subscriptionType: null,
      types: [
        { kind: "SCALAR", name: "uuid", description: null },
        { kind: "ENUM", name: "status", description: null },
        { kind: "OBJECT", name: "book", description: null, fields: [] }
      ]
    };

    expect(isScalarOrEnum("uuid", schema)).toBe(true);
    expect(isScalarOrEnum("status", schema)).toBe(true);
    expect(isScalarOrEnum("book", schema)).toBe(false);
    expect(isScalarOrEnum("missing", schema)).toBe(false);
  });

  it("isLikelyTableType filters out root and helper types", () => {
    expect(
      isLikelyTableType({
        kind: "OBJECT",
        name: "book",
        description: null,
        fields: [
          {
            name: "id",
            description: null,
            type: { kind: "SCALAR", name: "uuid", ofType: null },
            args: []
          }
        ]
      })
    ).toBe(true);

    expect(
      isLikelyTableType({
        kind: "OBJECT",
        name: "query_root",
        description: null,
        fields: []
      })
    ).toBe(false);

    expect(
      isLikelyTableType({
        kind: "OBJECT",
        name: "book_aggregate",
        description: null,
        fields: []
      })
    ).toBe(false);
  });

  it("getRootTypeName respects schema overrides", () => {
    const schema: IntrospectionSchema = {
      queryType: { name: "custom_query" },
      mutationType: { name: "custom_mutation" },
      subscriptionType: null,
      types: []
    };

    expect(getRootTypeName(schema, "query")).toBe("custom_query");
    expect(getRootTypeName(schema, "mutation")).toBe("custom_mutation");
    expect(getRootTypeName(schema, "subscription")).toBe("subscription_root");
  });
});
