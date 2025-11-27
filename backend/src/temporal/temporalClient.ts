import { Connection, Client } from "@temporalio/client";

let temporalClient: Client | null = null;

export async function getTemporalClient() {
  if (temporalClient) return temporalClient;

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS!,
    tls: {},
  });

  temporalClient = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE!,
  });

  return temporalClient;
}
