import { proxyActivities } from "@temporalio/workflow";

export const dummyWorkflow = async (): Promise<string> => {
  return "Temporal workflow connection OK";
};
