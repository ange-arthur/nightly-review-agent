import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Persistent decision register: a Markdown file owned by the humans, read and appended by the
 * agent. Open items stay visible in every report until someone closes them, so a question asked
 * on Monday cannot be forgotten by Friday. The agent only ever appends under "Open decisions".
 */
export interface Register {
  open: string[];
  resolved: string[];
  raw: string;
}

const OPEN = "## Open decisions";
const RESOLVED = "## Resolved";

export function emptyRegister(name: string): string {
  return `# Decision register — ${name}\n\n${OPEN}\n\n${RESOLVED}\n`;
}

export function parseRegister(raw: string): Register {
  const open: string[] = [];
  const resolved: string[] = [];
  let section: "open" | "resolved" | null = null;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(OPEN)) section = "open";
    else if (line.startsWith(RESOLVED)) section = "resolved";
    else if (line.startsWith("## ")) section = null;
    else if (/^- \[[ xX]\]/.test(line)) {
      if (section === "open") open.push(line);
      else if (section === "resolved") resolved.push(line);
    }
  }
  return { open, resolved, raw };
}

export function loadRegister(path: string, name: string): Register {
  return parseRegister(existsSync(path) ? readFileSync(path, "utf8") : emptyRegister(name));
}

/**
 * Appends questions as unchecked items under "Open decisions", skipping any question whose text
 * is already present (open or resolved). Returns the new raw content and the items added.
 */
export function withQuestions(raw: string, day: string, questions: string[]): { raw: string; added: string[] } {
  const reg = parseRegister(raw);
  const known = new Set([...reg.open, ...reg.resolved].map((l) => l.replace(/^- \[[ xX]\]\s*(\d{4}-\d{2}-\d{2} — )?/, "")));
  const added = questions.filter((q) => !known.has(q));
  if (added.length === 0) return { raw, added };
  const items = added.map((q) => `- [ ] ${day} — ${q}`);
  const lines = raw.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith(OPEN));
  if (idx < 0) return { raw: raw.trimEnd() + `\n\n${OPEN}\n${items.join("\n")}\n`, added };
  // insert after the heading and its optional blank line
  let insertAt = idx + 1;
  while (insertAt < lines.length && lines[insertAt]!.trim() === "") insertAt++;
  // keep existing items first, then ours
  while (insertAt < lines.length && /^- \[[ xX]\]/.test(lines[insertAt]!)) insertAt++;
  lines.splice(insertAt, 0, ...items);
  return { raw: lines.join("\n"), added };
}

export function saveRegister(path: string, raw: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, raw.endsWith("\n") ? raw : raw + "\n", "utf8");
}

/** Body of the register without its H1 and with its headings demoted one level, for embedding in a report. */
export function registerBody(raw: string): string {
  return raw
    .split(/\r?\n/)
    .filter((l, i) => !(i === 0 && l.startsWith("# ")))
    .map((l) => (l.startsWith("## ") ? "#" + l : l))
    .join("\n")
    .trim();
}
