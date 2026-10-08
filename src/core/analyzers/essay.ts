import { analyzeText, formatStats } from "./text";

export function analyzeEssay(text: string): {
  stats: ReturnType<typeof analyzeText>;
  structure: string[];
  issues: string[];
  questions: string[];
  report: string;
} {
  const stats = analyzeText(text);
  const structure: string[] = [];
  const issues: string[] = [];
  const questions: string[] = [];

  if (stats.words < 80) {
    issues.push("Very short — not enough to judge argument or voice.");
    questions.push("Paste a fuller draft, or tell me the prompt and your key stories.");
  }
  if (stats.paragraphs < 3 && stats.words > 200) {
    issues.push("Few paragraph breaks — structure may be hard to follow.");
  }
  if (stats.avgSentenceWords > 28) {
    issues.push("Sentences run long on average. Mix in shorter lines for control.");
  }
  if (stats.cliches.length) {
    issues.push("Stock phrases flatten voice. Replace with concrete scenes.");
  }
  if (stats.words > 150 && stats.firstPerson < 3) {
    issues.push("Little first person — if this is a personal essay, the self may be missing.");
  }
  if (!/\b(because|but|however|although|therefore|so that)\b/i.test(text) && stats.words > 180) {
    issues.push("Limited causal language — claims may not be argued yet.");
  }

  const paras = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (paras.length) {
    structure.push(`Opening: ${paras[0].slice(0, 140).replace(/\s+/g, " ")}…`);
    if (paras.length > 1) {
      structure.push(`Middle: ${paras.length - 2} body paragraph(s)`);
      structure.push(`Closing: ${paras[paras.length - 1].slice(0, 120).replace(/\s+/g, " ")}…`);
    }
  }

  if (!/\d/.test(text) && stats.words > 250) {
    questions.push("Are there real numbers (years, scale, outcomes) you can add without inflating?");
  }
  questions.push("What is the exact prompt or word limit?");
  questions.push("Which experiences here are verified and which are still ideas?");

  const report = [
    "## Essay analysis (from your text only)",
    formatStats(stats),
    "",
    structure.length ? "### Structure\n" + structure.map((s) => `- ${s}`).join("\n") : "",
    issues.length ? "### Issues\n" + issues.map((s) => `- ${s}`).join("\n") : "### Issues\n- No automatic red flags; still check prompt fit.",
    "### What I will not do",
    "- I will not invent awards, jobs, grades, or stories.",
    "- I will not write a new biography for you.",
    "",
    "### Questions",
    questions.map((q) => `- ${q}`).join("\n"),
  ]
    .filter(Boolean)
    .join("\n");

  return { stats, structure, issues, questions, report };
}
