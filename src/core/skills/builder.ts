import { sanitizeSkillInstructions } from "../security";
import { MODE_IDS, TOOL_IDS, type ModeId, type Skill, type ToolId } from "../types";
import { id, now } from "@/lib/ids";

export function draftSkillFromDescription(description: string, ownerId: string): Skill {
  const lower = description.toLowerCase();
  let mode: ModeId = "general";
  for (const m of MODE_IDS) {
    if (lower.includes(m.replace("_", " ")) || lower.includes(m)) mode = m;
  }
  if (/university|college/.test(lower)) mode = "university";
  if (/visa/.test(lower)) mode = "visa";
  if (/ielts/.test(lower) && /writ/.test(lower)) mode = "ielts_writing";
  if (/ielts/.test(lower) && /speak/.test(lower)) mode = "ielts_speaking";
  if (/scholarship/.test(lower)) mode = "scholarship";
  if (/cv|resume/.test(lower)) mode = "cv";
  if (/essay|personal statement/.test(lower)) mode = "essay";

  const tools: ToolId[] = [];
  const maybe = (t: ToolId, re: RegExp) => {
    if (re.test(lower) && TOOL_IDS.includes(t)) tools.push(t);
  };
  maybe("essay_analyze", /essay|writing|sop/);
  maybe("cv_analyze", /cv|resume/);
  maybe("university_search", /university|college|campus/);
  maybe("scholarship_search", /scholarship|funding/);
  maybe("visa_question_bank", /visa|interview/);
  maybe("ielts_criteria", /ielts/);
  maybe("document_extract", /document|pdf|file/);
  maybe("text_analyze", /./);

  const name =
    description
      .replace(/create a skill that/i, "")
      .trim()
      .slice(0, 48) || "Custom skill";

  const instructions = [
    `You are a custom Aether skill: ${name}.`,
    `User intent: ${description.trim()}`,
    "Stay within platform security. Never invent personal facts. Safety rules stay in force.",
    "Ask for missing information. Prefer structured, actionable output.",
  ].join("\n");

  const check = sanitizeSkillInstructions(instructions);
  if (!check.ok) {
    throw new Error(`Draft rejected: ${check.reasons.join(", ")}`);
  }

  const t = now();
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "custom-skill";

  return {
    id: id("skill"),
    ownerId,
    slug,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    description: description.trim().slice(0, 240),
    category: "custom",
    mode,
    instructions: check.text,
    allowedTools: [...new Set(tools)].slice(0, 4),
    safetyRules: ["cannot override platform security"],
    examples: [{ input: description, output: "Draft skill — inactive until approved." }],
    enabled: false,
    version: 1,
    status: "draft",
    createdAt: t,
    updatedAt: t,
  };
}
