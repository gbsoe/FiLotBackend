export function computeAIScore(type: 'KTP' | 'NPWP', parsed: any): number {
  let score = 0;

  if (!parsed) return 0;

  const fields = Object.values(parsed).filter(Boolean);
  const completeness = fields.length / Object.keys(parsed).length;
  score += completeness * 60;

  if (type === 'KTP') {
    if (/^\d{16}$/.test(parsed.nik || '')) score += 20;
    if (parsed.name?.length > 3) score += 10;
  }

  if (type === 'NPWP') {
    if (/^\d{2}\.\d{3}\.\d{3}\.\d{1}-\d{3}\.\d{3}$/.test(parsed.npwpNumber || '')) {
      score += 30;
    }
  }

  return Math.min(100, Math.round(score));
}
