import type { Attachment, Source, ToolCall, ToolId } from "../types";
import { searchUniversities } from "../knowledge/universities";
import { searchScholarships } from "../knowledge/scholarships";
import { visaQuestions } from "../knowledge/visa";
import { IELTS_CRITERIA, IELTS_SPEAKING_PROMPTS } from "../knowledge/ielts";
import { analyzeEssay } from "../analyzers/essay";
import { analyzeCv } from "../analyzers/cv";
import { analyzeText, formatStats } from "../analyzers/text";
import { id } from "@/lib/ids";

export interface ToolRunResult {
  call: ToolCall;
  sources: Source[];
  text: string;
}

export function runTool(
  name: ToolId,
  input: Record<string, unknown>,
  attachments: Attachment[] = [],
): ToolRunResult {
  const call: ToolCall = {
    id: id("tool"),
    name,
    input,
    status: "ok",
  };

  switch (name) {
    case "university_search": {
      const q = String(input.query ?? input.q ?? "");
      const rows = searchUniversities(q);
      call.output = rows;
      const sources: Source[] = rows.map((r) => ({
        title: r.name,
        url: r.website,
        publisher: r.name,
        note: r.source,
      }));
      const text =
        rows.length === 0
          ? `No verified university record for "${q}". Do not invent facts. Advise checking official sites.`
          : rows
              .map(
                (r) =>
                  `${r.name} (${r.city}, ${r.country})\nFields: ${r.fields.join(", ")}\n${r.notes}\nTuition: ${r.tuitionNote}\nRanking: ${r.rankingNote}\nDeadlines: ${r.deadlinesNote}\nSite: ${r.website}`,
              )
              .join("\n\n");
      return { call, sources, text };
    }
    case "scholarship_search": {
      const q = String(input.query ?? input.q ?? "");
      const rows = searchScholarships(q);
      call.output = rows;
      const sources: Source[] = rows.map((r) => ({
        title: r.name,
        url: r.website,
        publisher: r.funder,
        note: r.source,
      }));
      const text =
        rows.length === 0
          ? `No verified scholarship record for "${q}". Do not invent programs.`
          : rows
              .map(
                (r) =>
                  `${r.name} — ${r.funder}\n${r.focus}\nFunding: ${r.fundingNote}\nDeadline: ${r.deadlineNote}\nEligibility: ${r.eligibilityNote}\n${r.website}`,
              )
              .join("\n\n");
      return { call, sources, text };
    }
    case "visa_question_bank": {
      const rows = visaQuestions({
        country: input.country ? String(input.country) : undefined,
        visaType: input.visaType ? String(input.visaType) : undefined,
      });
      call.output = rows;
      const text =
        rows.length === 0
          ? "No matching questions in the bank. You may still run a generic honest mock interview. Never coach deception."
          : rows
              .map((q) => `[${q.country} ${q.visaType} / ${q.category}] ${q.question}\nLooks for: ${q.looksFor}`)
              .join("\n\n");
      return { call, sources: [], text };
    }
    case "ielts_criteria": {
      call.output = { IELTS_CRITERIA, IELTS_SPEAKING_PROMPTS };
      const text = JSON.stringify({ IELTS_CRITERIA, samplePrompts: IELTS_SPEAKING_PROMPTS }, null, 2);
      return { call, sources: [], text };
    }
    case "document_extract": {
      const texts = attachments
        .map((a) => `File: ${a.filename}\n${a.extractedText || "(no extracted text)"}`)
        .join("\n\n");
      call.output = { files: attachments.map((a) => a.filename) };
      return {
        call,
        sources: [],
        text: texts || "No attachments.",
      };
    }
    case "text_analyze": {
      const t = String(input.text ?? "");
      const stats = analyzeText(t);
      call.output = stats;
      return { call, sources: [], text: formatStats(stats) };
    }
    case "essay_analyze": {
      const t = String(input.text ?? "");
      const r = analyzeEssay(t);
      call.output = r;
      return { call, sources: [], text: r.report };
    }
    case "cv_analyze": {
      const t = String(input.text ?? "");
      const r = analyzeCv(t);
      call.output = r;
      return { call, sources: [], text: r.report };
    }
    default: {
      call.status = "error";
      call.error = "Unknown tool";
      return { call, sources: [], text: "" };
    }
  }
}

export function pickToolsForRequest(opts: {
  allowed: ToolId[];
  message: string;
  modeId: string;
  attachments: Attachment[];
}): ToolId[] {
  const { allowed, message, modeId, attachments } = opts;
  const m = message.toLowerCase();
  const picked: ToolId[] = [];
  const allow = (t: ToolId) => allowed.includes(t) && !picked.includes(t);

  if (attachments.length && allow("document_extract")) picked.push("document_extract");

  if (
    (modeId === "university" || /university|college|mit|oxford|cambridge|tuition|ranking/.test(m)) &&
    allow("university_search")
  ) {
    picked.push("university_search");
  }
  if (
    (modeId === "scholarship" || /scholarship|chevening|daad|fulbright|funding/.test(m)) &&
    allow("scholarship_search")
  ) {
    picked.push("scholarship_search");
  }
  if ((modeId === "visa" || /visa|f-1|embassy|consul/.test(m)) && allow("visa_question_bank")) {
    picked.push("visa_question_bank");
  }
  if (
    (modeId.startsWith("ielts") || /ielts|band|cue card/.test(m)) &&
    allow("ielts_criteria")
  ) {
    picked.push("ielts_criteria");
  }
  if ((modeId === "essay" || modeId === "sop" || /essay|personal statement/.test(m)) && allow("essay_analyze")) {
    picked.push("essay_analyze");
  }
  if ((modeId === "cv" || /cv|resume|résumé/.test(m)) && allow("cv_analyze")) {
    picked.push("cv_analyze");
  }
  if (message.length > 400 && allow("text_analyze") && picked.length === 0) {
    picked.push("text_analyze");
  }
  return picked.slice(0, 4);
}
