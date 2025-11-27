import { Connection, Client } from "@temporalio/client";

let temporalClient: Client | null = null;

export async function getTemporalClient() {
  if (temporalClient) return temporalClient;

  const address = process.env.TEMPORAL_ADDRESS || process.env.TEMPORAL_ENDPOINT;
  if (!address) {
    throw new Error("TEMPORAL_ADDRESS or TEMPORAL_ENDPOINT environment variable is required");
  }

  const namespace = process.env.TEMPORAL_NAMESPACE;
  if (!namespace) {
    throw new Error("TEMPORAL_NAMESPACE environment variable is required");
  }

  const apiKey = process.env.TEMPORAL_API_KEY;
  if (!apiKey) {
    throw new Error("TEMPORAL_API_KEY environment variable is required for Temporal Cloud authentication");
  }

  const connection = await Connection.connect({
    address,
    tls: {},
    apiKey,
  });

  temporalClient = new Client({
    connection,
    namespace,
  });

  return temporalClient;
}
