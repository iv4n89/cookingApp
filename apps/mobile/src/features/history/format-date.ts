// Formats an ISO date (YYYY-MM-DD...) as DD/MM/YYYY.
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
