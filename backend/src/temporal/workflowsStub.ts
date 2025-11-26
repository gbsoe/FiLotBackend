export const TemporalWorkflows = {
  startVerificationWorkflow: async (documentId: string): Promise<void> => {
    console.log("Temporal stub: starting workflow for", documentId);
  },

  notifyBuli2ManualReview: async (ticketId: string): Promise<void> => {
    console.log("Temporal stub: notify Buli2", ticketId);
  }
};
