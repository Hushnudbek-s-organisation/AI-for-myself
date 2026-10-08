import { analyzeText, formatStats } from "./text";

const WEAK = [
  "responsible for",
  "helped with",
  "worked on",
  "duties included",
  "various",
  "several",
  "team player",
  "hardworking",
  "results-oriented",
];

export function analyzeCv(text: string): { report: string } {
  const stats = analyzeText(text);
  const lower = text.toLowerCase();
  const weak = WEAK.filter((w) => lower.includes(w));
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
  const hasDates = /\b(20\d{2}|19\d{2})\b/.test(text);
  const bullets = text.split("\n").filter((l) => /^\s*[-•*]/.test(l));
  const issues: string[] = [];

  if (!hasEmail) issues.push("No email detected — add contact details if this is a full CV.");
  if (!hasDates) issues.push("No years detected — timelines may be missing.");
  if (weak.length) issues.push(`Weak / vague phrases: ${weak.join(", ")}`);
  if (bullets.length === 0 && stats.words > 80) {
    issues.push("Few bullets — scanners and recruiters often prefer scannable bullets.");
  }
  if (/\b(\d+%|\d+\+|increased|reduced|saved|led \d+)\b/i.test(text) === false && stats.words > 120) {
    issues.push("Few measurable outcomes. Ask yourself for real metrics — I will not invent them.");
  }

  const report = [
    "## CV analysis (from your text only)",
    formatStats(stats),
    `Bullets detected: ${bullets.length}`,
    "",
    issues.length ? "### Issues\n" + issues.map((i) => `- ${i}`).join("\n") : "### Issues\n- Structure looks present.",
    "",
    "### Rules I follow",
    "- I will not invent metrics, employers, titles, or dates.",
    "- If you want stronger bullets, send a real outcome (even approximate and honest).",
    "",
    "### ATS notes",
    "- Use standard section headings (Experience, Education, Skills).",
    "- Avoid tables and text boxes if you need ATS parsing.",
    "- Spell out tools and languages as they appear in the job description you actually have.",
  ].join("\n");

  return { report };
}
