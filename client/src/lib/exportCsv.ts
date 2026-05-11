export interface CsvColumn {
  key: string;
  label: string;
  format?: (val: any, row: any) => string;
}

export function downloadCsv(filename: string, rows: any[], columns: CsvColumn[]) {
  const header = columns.map(c => `"${c.label}"`).join(",");
  const body = rows.map(row =>
    columns.map(c => {
      const raw = row[c.key] ?? "";
      const val = c.format ? c.format(raw, row) : String(raw);
      return `"${val.replace(/"/g, '""')}"`;
    }).join(",")
  ).join("\n");

  const csv = `${header}\n${body}`;
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
