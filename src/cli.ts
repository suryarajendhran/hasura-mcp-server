#!/usr/bin/env node
import { startServer } from "./server.js";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === "--endpoint" && argv[i + 1]) {
      args.set("endpoint", argv[i + 1]);
      i += 1;
    } else if (current === "--secret" && argv[i + 1]) {
      args.set("secret", argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const endpoint = args.get("endpoint") ?? argv[0] ?? process.env.HASURA_GRAPHQL_ENDPOINT;
const secret = args.get("secret") ?? argv[1] ?? process.env.HASURA_GRAPHQL_SECRET;

if (!endpoint || !secret) {
  console.error("Missing HASURA_GRAPHQL_ENDPOINT or HASURA_GRAPHQL_SECRET.");
  console.error("Provide env vars or pass --endpoint and --secret.");
  process.exit(1);
}

startServer({ endpoint, adminSecret: secret }).catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
