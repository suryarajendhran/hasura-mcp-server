# hasura-mcp-server

MCP server for Hasura GraphQL, runnable via `npx hasura-mcp-server`.

## Requirements

- Node.js 18+
- Hasura GraphQL endpoint + admin secret

## Usage

```bash
export HASURA_GRAPHQL_ENDPOINT="https://your-hasura/v1/graphql"
 
npx hasura-mcp-server --x-hasura-admin-secret=your-admin-secret
```

You can also pass values directly:

```bash
npx hasura-mcp-server --endpoint https://your-hasura/v1/graphql --x-hasura-admin-secret your-admin-secret
```

Any other `--key value` or `--key=value` args are forwarded as headers:

```bash
npx hasura-mcp-server --endpoint https://your-hasura/v1/graphql \\
  --x-hasura-admin-secret=secret \\
  --x-hasura-role=readonly \\
  --authorization="Bearer token"
```

## Tools

- `health_check`
- `list_tables`
- `describe_table`
- `list_root_fields`
- `describe_graphql_type`
- `preview_table_data`
- `aggregate_data`
- `run_graphql_query`

Note: mutation operations are not allowed.

## Resource

- `hasura://schema` (GraphQL introspection schema)
