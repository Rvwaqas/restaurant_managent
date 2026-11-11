/**
 * CSV export utility — no external dependencies.
 * Outputs UTF-8 with BOM so Excel opens correctly on Windows (Urdu/English text).
 */

type CsvRow = Record<string, string | number | boolean | null | undefined>;

function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  // Wrap in quotes if contains comma, newline, or double-quote
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCsv(
  rows: CsvRow[],
  filename: string,
  headers?: string[]
): void {
  if (rows.length === 0) return;

  const cols = headers || Object.keys(rows[0]);
  const csvLines: string[] = [
    cols.map(escapeCsvCell).join(","),
    ...rows.map((row) => cols.map((col) => escapeCsvCell(row[col])).join(",")),
  ];

  const BOM = "\uFEFF";
  const csvContent = BOM + csvLines.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Build a filename like: pos-report-sales_2026-11-01_to_2026-11-05.csv */
export function buildCsvFilename(reportType: string, from: string, to: string): string {
  return `pos-report-${reportType}_${from}_to_${to}.csv`;
}
