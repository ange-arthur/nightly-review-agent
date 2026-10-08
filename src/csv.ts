import { existsSync, readFileSync, statSync } from "node:fs";

export interface CsvTable {
  header: string[];
  rows: Record<string, string>[];
}

/** Picks the delimiter that splits the header into the most columns (";" first, then ","). */
export function detectDelimiter(headerLine: string): string {
  const semi = headerLine.split(";").length;
  const comma = headerLine.split(",").length;
  return semi >= comma ? ";" : ",";
}

/**
 * Minimal CSV parser for machine-written logs: one record per line, no quoted delimiters.
 * Blank lines are skipped; short rows are padded with empty strings; long rows keep extra
 * columns under their positional index so nothing is silently dropped.
 */
export function parseCsv(text: string, delimiter?: string): CsvTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const sep = delimiter ?? detectDelimiter(lines[0]!);
  const header = lines[0]!.split(sep).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(sep);
    const row: Record<string, string> = {};
    const n = Math.max(cells.length, header.length);
    for (let i = 0; i < n; i++) {
      const key = header[i] ?? String(i);
      row[key] = (cells[i] ?? "").trim();
    }
    return row;
  });
  return { header, rows };
}

/** Returns null when the file is missing: callers decide whether that is an incident. */
export function readCsvFile(path: string): CsvTable | null {
  if (!existsSync(path)) return null;
  return parseCsv(readFileSync(path, "utf8"));
}

/**
 * Age of a file in minutes relative to `nowMs` (real UTC). Negative ages (file newer than the
 * injected "now") are returned as 0 so reproducible runs on archived data stay deterministic.
 */
export function fileAgeMinutes(path: string, nowMs: number): number | null {
  if (!existsSync(path)) return null;
  const age = (nowMs - statSync(path).mtimeMs) / 60_000;
  return age < 0 ? 0 : age;
}
