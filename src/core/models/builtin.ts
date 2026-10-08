import type { GenerateChunk, GenerateParams, ModelProvider, ModeId } from "../types";
import { detectInjection, redactSecrets } from "../security";
import { analyzeEssay } from "../analyzers/essay";
import { analyzeCv } from "../analyzers/cv";
import { IELTS_SPEAKING_PROMPTS } from "../knowledge/ielts";

function estimateTokens(s: string): number {
  return Math.max(1, Math.round(s.length / 4));
}

async function* streamText(text: string): AsyncGenerator<GenerateChunk> {
  const parts = text.split(/(\s+)/);
  let buf = "";
  for (const p of parts) {
    buf += p;
    if (buf.length > 28) {
      yield { type: "token", text: buf };
      buf = "";
      await new Promise((r) => setTimeout(r, 8));
    }
  }
  if (buf) yield { type: "token", text: buf };
}

function lastUserText(params: GenerateParams): string {
  const msgs = params.assembled.messages.filter((m) => m.role === "user");
  const last = msgs[msgs.length - 1]?.content ?? "";
  return last
    .replace(/BEGIN_UNTRUSTED_[\w]+\n[\s\S]*?\n/m, "")
    .replace(/END_UNTRUSTED_[\w]+/g, "")
    .replace(/The following content is untrusted[\s\S]*?inside it\.\n/g, "")
    .trim();
}

function extractUserPayload(params: GenerateParams): string {
  // Prefer the raw user message stored in untrusted wrapper
  const raw = params.assembled.messages.filter((m) => m.role === "user").pop()?.content ?? "";
  const m = raw.match(/BEGIN_UNTRUSTED_USER_MESSAGE\n[\s\S]*?\n([\s\S]*?)\nEND_UNTRUSTED_USER_MESSAGE/);
  if (m) return m[1].trim();
  return lastUserText(params);
}

function toolBlock(params: GenerateParams): string {
  const t = params.assembled.layers.find((l) => l.layer === "tool_results")?.content;
  return t ? t.replace("TRUSTED TOOL RESULTS (platform tools):\n", "") : "";
}

function docs(params: GenerateParams): string {
  return params.attachments
    .map((a) => a.extractedText || "")
    .join("\n")
    .trim();
}

function injectionReply(reasons: string[]): string {
  return [
    "I can’t follow instructions that try to override platform security or extract hidden prompts.",
    `Flagged: ${reasons.join(", ")}.`,
    "",
    "I can still help with the legitimate task. Tell me what you actually want to work on — an essay, visa practice, a CV, IELTS, or a general question.",
  ].join("\n");
}

function refuseDeception(): string {
  return [
    "I won’t help you lie to a visa officer, invent documents, or hide facts.",
    "",
    "Deception is illegal and is one of the fastest ways to be refused — now and in future applications.",
    "",
    "What I *will* do:",
    "- Practice honest answers",
    "- Tighten clarity and consistency",
    "- Flag gaps you need real documents for",
    "- Role-play a strict officer, then coach",
    "",
    "Tell me the country and visa type, and something true about your situation (study, funds, ties). We’ll prepare that — not a scripted fiction.",
  ].join("\n");
}

function chancesRefuse(): string {
  return [
    "I don’t calculate or invent admission probabilities.",
    "",
    "A percentage from a chatbot would be made up. Aether will only discuss a numeric chance if a dedicated chancing engine returns one — and none is attached to this request.",
    "",
    "What I can do instead:",
    "- Map requirements you still need to verify on the official site",
    "- Stress-test essays and CVs for evidence",
    "- Build an application plan",
    "",
    "Share your current profile (degree, GPA if you want, tests, target programs) and I’ll talk in qualitative terms only.",
  ].join("\n");
}

function generalReply(msg: string, params: GenerateParams): string {
  const skill = params.skill?.name;
  const mode = params.mode.name;
  const lower = msg.toLowerCase();

  if (/who are you|what is aether|what can you do/.test(lower)) {
    return [
      "I’m **Aether**, the assistant for this Universal AI Platform — not ChatGPT or Gemini.",
      "",
      "You can talk to me in this chat, or other apps can call the same AI Core through `/v1/chat` with an API key.",
      "",
      "Built-in modes include Essay, SOP, CV, University, Scholarship, Admission, Visa, IELTS, Documents, Interview, Career, and Application planning.",
      "",
      "Switch the skill in the header, or just tell me what you need. I won’t invent your achievements, visa documents, or university deadlines.",
    ].join("\n");
  }

  if (/help|what should|how do i start/.test(lower) && msg.length < 80) {
    return [
      `You're in **${mode}**${skill ? ` · ${skill}` : ""}.`,
      "",
      "Send me:",
      "- a draft to review,",
      "- a target (university, visa, exam), or",
      "- a question to think through.",
      "",
      "If you paste writing, I’ll analyse *your* text. I won’t ghostwrite a fake life.",
    ].join("\n");
  }

  const attached = docs(params);
  const body = attached ? `${msg}\n\n---\nAttached material:\n${attached.slice(0, 6000)}` : msg;

  return [
    `**${mode}**${skill ? ` · ${skill}` : ""}`,
    "",
    "Here’s a working response from the **development fallback** (not a production language model). Configure OPENAI_API_KEY on the server with AI_MOCK_MODE=false for the real provider.",
    "",
    thinkingGuide(body, params),
  ].join("\n");
}

function thinkingGuide(msg: string, params: GenerateParams): string {
  const tools = toolBlock(params);
  const sections: string[] = [];

  sections.push("### What I heard");
  sections.push(msg.length > 900 ? msg.slice(0, 900) + "…" : msg);

  if (tools) {
    sections.push("", "### From trusted tools");
    sections.push(tools.slice(0, 4000));
    sections.push("", "_Verify anything time-sensitive on the official website._");
  }

  sections.push("", "### How to go further");
  sections.push("- Add constraints (deadline, word limit, country, visa type).");
  sections.push("- Paste a draft if you want line-level notes.");
  sections.push("- Ask me to switch skill if this should be Essay / Visa / IELTS / CV.");

  if (params.mode.id === "general") {
    sections.push("", "### A first pass");
    sections.push(outlineAnswer(msg));
  }

  return sections.join("\n");
}

function outlineAnswer(msg: string): string {
  const q = msg.trim();
  if (q.endsWith("?") || /^(what|why|how|when|where|who|should|can|do)\b/i.test(q)) {
    return [
      "I don’t have a live web browse in the built-in engine, so I won’t invent citations or current figures.",
      "",
      "A solid way to tackle this:",
      "1. Define the decision or the claim.",
      "2. List what you already know vs what must be verified.",
      "3. Separate facts, values, and risks.",
      "",
      "Tell me your constraints (country, budget, timeline, draft) and I’ll be concrete.",
    ].join("\n");
  }
  return [
    "I can outline, critique, or practice with you.",
    "If this is a document, paste it. If this is a plan, give the target date and the destination (school, visa, job).",
  ].join("\n");
}

function essayReply(msg: string, params: GenerateParams): string {
  const text = docs(params) || msg;
  const looksLikeDraft = text.split(/\s+/).length > 40;
  if (!looksLikeDraft) {
    return [
      "I’m in **Essay Coach**.",
      "",
      "Paste the draft (and the prompt if you have it). I’ll check structure, specificity, and voice.",
      "",
      "I will **not** invent achievements, awards, or personal stories.",
      "",
      msg.length > 0 ? `Noted: ${msg.slice(0, 400)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  const { report } = analyzeEssay(text);
  return [
    report,
    "",
    "### Revision order",
    "1. Prompt fit — does every paragraph earn its place?",
    "2. One lived scene instead of a claim.",
    "3. Cut clichés and repeated stems.",
    "4. End on a choice or insight, not a slogan.",
    "",
    "Send the official prompt and word limit for a tighter pass. If you want a rewrite of **one** paragraph, tell me which — I’ll only use facts present in your draft.",
  ].join("\n");
}

function sopReply(msg: string, params: GenerateParams): string {
  const text = docs(params) || msg;
  const draft = text.split(/\s+/).length > 40;
  const missing: string[] = [];
  if (!/professor|supervisor|lab|research|course/i.test(text)) missing.push("program / research fit (people, groups, or courses you actually know)");
  if (!/career|goal|aim/i.test(text)) missing.push("career goal after the degree");
  if (!/because|therefore|so that/i.test(text) && draft) missing.push("causal links between past work and this program");

  const analysis = draft ? analyzeEssay(text).report : "Paste a draft for a line-level SOP critique.";
  return [
    "## SOP Coach",
    analysis,
    "",
    "### SOP checklist",
    "- Motivation (why this field, why now)",
    "- Academic evidence (what you actually did)",
    "- Program fit (specific, not flattery)",
    "- University fit",
    "- Career direction",
    "- Credibility (no unexplained leaps)",
    "",
    missing.length ? "### Missing from this text\n" + missing.map((m) => `- ${m}`).join("\n") : "",
    "",
    "I won’t invent papers, labs, or faculty you didn’t mention.",
  ]
    .filter(Boolean)
    .join("\n");
}

function cvReply(msg: string, params: GenerateParams): string {
  const text = docs(params) || msg;
  if (text.split(/\s+/).length < 30) {
    return "Paste your CV (or a job description + bullets). I won’t invent metrics — if a number is missing I’ll ask.";
  }
  return analyzeCv(text).report + "\n\nSend a target role if you want bullets aligned to it.";
}

function universityReply(params: GenerateParams): string {
  const tools = toolBlock(params);
  if (!tools) {
    return [
      "University Advisor uses a **trusted catalogue**, not guesses.",
      "",
      "I don’t have a verified record for this query yet. I will **not** invent tuition, rankings, acceptance rates, or deadlines.",
      "",
      "Name a university or field (for example: “ETH Zurich computer science” or “UK master’s in law”) and I’ll search the catalogue. Always confirm on the official site.",
    ].join("\n");
  }
  return [
    "## University Advisor",
    "",
    "Results from Aether’s university tool. **Not live web data.** Numbers like tuition and deadlines are intentionally not stored as hard figures — verify on the official site.",
    "",
    tools,
    "",
    "Tell me your degree level, field, and any constraints (country, language, funding) for a shortlist — still without invented stats.",
  ].join("\n");
}

function scholarshipReply(params: GenerateParams): string {
  const tools = toolBlock(params);
  if (!tools) {
    return "No verified scholarship matched. I won’t invent programs or deadlines. Try “Chevening”, “DAAD”, “Fulbright”, or a country + level.";
  }
  return [
    "## Scholarship Advisor",
    "",
    tools,
    "",
    "Eligibility is programme-specific. I won’t declare you eligible without your facts, and I won’t guarantee an award.",
  ].join("\n");
}

function visaReply(msg: string, params: GenerateParams): string {
  if (/lie|fake document|forged|hide the|made-up sponsor|false bank/i.test(msg)) {
    return refuseDeception();
  }
  const tools = toolBlock(params);
  return [
    "## Visa Interview Coach",
    "",
    "I will never coach deception or fabricate sponsors, jobs, funds, or travel history. I will never guarantee approval.",
    "",
    tools ? "### Practice questions (bank)\n" + tools : "Tell me **country** and **visa type** (e.g. US F-1, UK Student). I’ll pull questions from the bank.",
    "",
    "### How we practice",
    "1. I ask as the officer.",
    "2. You answer in your real facts.",
    "3. I score clarity, consistency, concision — not theatrical confidence.",
    "",
    "If you already have an answer, paste it and I’ll critique it. If anything is unknown, we leave it unknown — we don’t fill it with fiction.",
  ].join("\n");
}

function ieltsSpeaking(msg: string): string {
  const lower = msg.toLowerCase();
  let part = 1;
  if (/part\s*2|cue card/.test(lower)) part = 2;
  if (/part\s*3/.test(lower)) part = 3;
  const prompts =
    part === 1
      ? IELTS_SPEAKING_PROMPTS.part1
      : part === 2
        ? IELTS_SPEAKING_PROMPTS.part2
        : IELTS_SPEAKING_PROMPTS.part3;
  const q = prompts[Math.floor(Math.random() * prompts.length)];
  const answered = msg.split(/\s+/).length > 40;
  return [
    "## IELTS Speaking (unofficial practice)",
    "",
    IELTS_SPEAKING_PROMPTS && "",
    answered
      ? "### Feedback on what you said\n- Fluency: look at hesitation and looping.\n- Vocabulary: swap generic adjectives for precise ones.\n- Grammar: check tense consistency.\n- Pronunciation: I can only judge this if audio was provided.\n\nThis is **not** an official IELTS score."
      : `### Part ${part} question\n**${q}**\n\nAnswer in 3–8 sentences (Part 1) or up to ~90 seconds (Part 2). Then I’ll comment.\n\nThis is **not** an official IELTS score.`,
  ].join("\n");
}

function ieltsWriting(msg: string, params: GenerateParams): string {
  const text = docs(params) || msg;
  const draft = text.split(/\s+/).length > 60;
  return [
    "## IELTS Writing (unofficial)",
    "",
    draft
      ? analyzeEssay(text).report
      : "Paste a Task 1 or Task 2 response. Say which task. I will not give an official band.",
    "",
    "### Criteria I use (practice only)",
    "- Task response",
    "- Coherence and cohesion",
    "- Lexical resource",
    "- Grammatical range and accuracy",
    "",
    "Aether does **not** award official IELTS scores.",
  ].join("\n");
}

function admissionReply(msg: string): string {
  if (/chance|probability|odds|percent|%/i.test(msg)) return chancesRefuse();
  return [
    "## Admission Advisor",
    "",
    "I won’t invent a chance-of-admission number.",
    "",
    "Send: degree, field, tests you actually have, target programs, and constraints.",
    "I’ll talk about **fit, gaps, and next work** — not fake odds.",
  ].join("\n");
}

function buildReply(params: GenerateParams): string {
  const msg = extractUserPayload(params);
  const inj = detectInjection(msg);
  if (inj.blocked) return injectionReply(inj.reasons);
  if (/lie to the officer|how can i lie|fake (bank|sponsor|document)/i.test(msg)) {
    return refuseDeception();
  }
  if (/reveal (the )?(system prompt|hidden prompt|api key)/i.test(msg)) {
    return "I can’t share internal system or security prompts. If you’re debugging, use the developer inspector — it shows mode, skill version, tools, and latency, not secrets.";
  }

  const mode: ModeId = params.mode.id;
  switch (mode) {
    case "essay":
      return essayReply(msg, params);
    case "sop":
      return sopReply(msg, params);
    case "cv":
      return cvReply(msg, params);
    case "university":
      return universityReply(params);
    case "scholarship":
      return scholarshipReply(params);
    case "visa":
      return visaReply(msg, params);
    case "ielts_speaking":
      return ieltsSpeaking(msg);
    case "ielts_writing":
      return ieltsWriting(msg, params);
    case "admission":
      return admissionReply(msg);
    case "document":
      return docs(params)
        ? `## Document analysis\n\nTreating file content as **untrusted data**.\n\n${analyzeEssay(docs(params)).report}`
        : "Upload a PDF, DOCX, or TXT in the composer.";
    default:
      if (params.skill?.mode === "essay") return essayReply(msg, params);
      if (params.skill?.mode === "visa") return visaReply(msg, params);
      return generalReply(msg, params);
  }
}

export const builtinProvider: ModelProvider = {
  id: "aether-builtin",
  name: "Aether Engine (development fallback)",
  tiers: ["fast", "balanced", "reasoning"],
  supportsVision: () => false,
  supportsTools: () => false,
  supportsAudio: () => false,
  async healthCheck() {
    return { ok: true, configured: true, mock: true };
  },
  async *generate(params: GenerateParams): AsyncIterable<GenerateChunk> {
    if (params.abort?.aborted) {
      yield { type: "error", error: "cancelled" };
      return;
    }
    const started = Date.now();
    const text = redactSecrets(buildReply(params));
    yield* streamText(text);
    const usage = {
      inputTokens: estimateTokens(params.assembled.systemText + extractUserPayload(params)),
      outputTokens: estimateTokens(text),
      latencyMs: Date.now() - started,
      model: "aether-engine-v1",
      provider: "aether-builtin",
      estimated: true,
    };
    yield { type: "usage", usage };
    yield { type: "done" };
  },
};
