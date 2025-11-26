export interface Buli2SendResult {
  ticketId: string;
  status: string;
}

export async function sendToBuli2(
  document: any,
  parsedData: any,
  aiScore: number
): Promise<Buli2SendResult> {
  console.log("Mock: Sending document to Buli2 queue", {
    documentId: document.id,
    documentType: document.type,
    aiScore,
  });

  return {
    ticketId: `BULI2-${Date.now()}`,
    status: 'queued'
  };
}
