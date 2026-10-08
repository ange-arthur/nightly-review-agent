import type { CheckResult, Incident } from "./types.ts";

export interface ReportInput {
  name: string;
  day: string;
  generatedAt: string;
  sections: CheckResult[];
  incidents: Incident[];
  questions: string[];
  registerBody: string;
}

const LEVEL_LABEL: Record<number, string> = {
  1: "tooling — fixed or to fix, reported",
  2: "anomaly — reported, to investigate",
  3: "production — prepared and BLOCKED until human GO",
};

export function sortIncidents(incidents: Incident[]): Incident[] {
  return [...incidents].sort((a, b) => b.level - a.level || a.check.localeCompare(b.check));
}

export function renderReport(input: ReportInput): string {
  const L: string[] = [];
  L.push(`# Nightly review — ${input.name} — ${input.day}`, "", `_Generated ${input.generatedAt}._`, "");
  input.sections.forEach((s, i) => {
    L.push(`## ${i + 1}. ${s.title}`, "", ...s.lines, "");
  });
  const n = input.sections.length;
  L.push(`## ${n + 1}. Incidents`, "");
  const sorted = sortIncidents(input.incidents);
  if (sorted.length === 0) L.push("Nothing to report.");
  else for (const inc of sorted) L.push(`- **N${inc.level}** [${inc.check}] ${inc.text}`);
  L.push("", "Levels: " + [1, 2, 3].map((l) => `N${l} = ${LEVEL_LABEL[l]}`).join("; ") + ".", "");
  L.push(`## ${n + 2}. Questions for the owner`, "");
  if (input.questions.length === 0) L.push("No question tonight.");
  else for (const q of input.questions) L.push(`- ${q}`);
  L.push("", `## ${n + 3}. Decision register (persistent)`, "", input.registerBody || "_empty_", "");
  return L.join("\n");
}

export function summaryLine(day: string, incidents: Incident[], questions: string[]): string {
  const n3 = incidents.filter((i) => i.level === 3).length;
  const n2 = incidents.filter((i) => i.level === 2).length;
  const n1 = incidents.filter((i) => i.level === 1).length;
  return `${day}: ${incidents.length} incident(s) (N3 ${n3}, N2 ${n2}, N1 ${n1}), ${questions.length} question(s)`;
}
