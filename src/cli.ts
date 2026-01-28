#!/usr/bin/env node
import { startServer } from "./server.js";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  const headers: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === "--endpoint" && argv[i + 1]) {
      args.set("endpoint", argv[i + 1]);
      i += 1;
    } else if (current.startsWith("--")) {
      const trimmed = current.slice(2);
      if (trimmed.includes("=")) {
        const [key, ...rest] = trimmed.split("=");
        const value = rest.join("=");
        if (key) headers[key] = value;
      } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        headers[trimmed] = argv[i + 1];
        i += 1;
      }
    }
  }
  return { args, headers };
}

const argv = process.argv.slice(2);
const { args, headers } = parseArgs(argv);
const endpoint = args.get("endpoint") ?? process.env.HASURA_GRAPHQL_ENDPOINT;

if (!endpoint) {
  console.error("Missing HASURA_GRAPHQL_ENDPOINT.");
  console.error("Provide env var or pass --endpoint.");
  process.exit(1);
}


startServer({ endpoint, headers }).catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
