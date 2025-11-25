export interface NPWPData {
  npwpNumber?: string;
  name?: string;
}

export function parseNPWP(ocrText: string): NPWPData {
  const result: NPWPData = {};

  const npwpMatch = ocrText.match(/([0-9]{2}\.[0-9]{3}\.[0-9]{3}\.[0-9]\-[0-9]{3}\.[0-9]{3})/);
  if (npwpMatch) {
    result.npwpNumber = npwpMatch[1];
  }

  const nameMatch = ocrText.match(/Nama[\s:]*([A-Z\s]+)/i);
  if (nameMatch) {
    result.name = nameMatch[1].trim();
  }

  return result;
}
