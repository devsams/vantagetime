/** The one documented CSV template roster import understands (see
 * backend/common/roster_import.py). Column order doesn't matter and
 * extra columns are ignored, but these headers must be present. Shipped
 * as a downloadable file rather than just described in prose, so the
 * format is something to open and fill in, not something to guess at. */
export const ROSTER_TEMPLATE_CSV = `Name,Type,Role,Location,Availability Start,Availability End,Email,Priority
Raj Malhotra,Actor,Arjun,Mumbai Apartment,2026-09-03,2026-09-08,raj@example.com,yes
Priya Shah,Actor,Maya,Mumbai Apartment,2026-09-05,2026-09-08,priya@example.com,no
Amit Kumar,Crew,DOP,Mumbai Apartment,2026-09-01,2026-09-10,amit@example.com,no
Rental Van,Other,Vehicle,,2026-09-01,2026-09-10,vendor@example.com,no
Mumbai Apartment,Location,,,2026-09-01,2026-09-10,,
`;

export function downloadRosterTemplate(): void {
  const blob = new Blob([ROSTER_TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vantagetime-roster-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}
