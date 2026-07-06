// SQLite's CURRENT_TIMESTAMP produces "YYYY-MM-DD HH:MM:SS" in UTC with no
// timezone marker. Browsers parse that format as *local* time, which shifts
// every displayed date/time by the viewer's UTC offset. Normalize to an
// explicit UTC ISO string before constructing a Date.
export function parseDbTimestamp(ts: string): Date {
  const sqliteFormat = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  if (sqliteFormat.test(ts)) {
    return new Date(ts.replace(' ', 'T') + 'Z');
  }
  return new Date(ts);
}

export function formatDate(ts: string): string {
  return parseDbTimestamp(ts).toLocaleDateString();
}
