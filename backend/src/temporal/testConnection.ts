import { getTemporalClient } from "./temporalClient";

(async () => {
  try {
    const client = await getTemporalClient();
    console.log("Temporal client OK:", client.options.namespace);
    process.exit(0);
  } catch (err) {
    console.error("Temporal test failed:", err);
    process.exit(1);
  }
})();
