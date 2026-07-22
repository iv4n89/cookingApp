// Formats an ISO timestamp as DD/MM/YYYY in the device's local time zone (cooked_at is a
// timestamptz returned in UTC; slicing it would show the wrong day near midnight).
export function formatDate(iso: string): string {
  const date = new Date(iso);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}
