const CLICHES = [
  "since the dawn of time",
  "in today's society",
  "a passion for",
  "think outside the box",
  "at the end of the day",
  "game changer",
  "leverage",
  "synergy",
  "it goes without saying",
  "from a young age i have always",
  "i have always been passionate",
];

const HEDGES = [
  "maybe",
  "perhaps",
  "somewhat",
  "kind of",
  "sort of",
  "a bit",
  "i think",
  "i believe i",
];

export interface TextStats {
  chars: number;
  words: number;
  sentences: number;
  paragraphs: number;
  avgSentenceWords: number;
  longSentences: string[];
  repeatedWords: Array<{ word: string; count: number }>;
  cliches: string[];
  hedges: string[];
  questions: number;
  firstPerson: number;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function analyzeText(text: string): TextStats {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const sentences = splitSentences(text);
  const avg = sentences.length ? words.length / sentences.length : 0;
  const longSentences = sentences.filter((s) => s.split(/\s+/).length > 35).slice(0, 5);

  const freq = new Map<string, number>();
  for (const w of words) {
    const k = w.toLowerCase().replace(/[^a-z']/g, "");
    if (k.length < 5) continue;
    freq.set(k, (freq.get(k) || 0) + 1);
  }
  const repeatedWords = [...freq.entries()]
    .filter(([, c]) => c >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));

  const lower = text.toLowerCase();
  const cliches = CLICHES.filter((c) => lower.includes(c));
  const hedges = HEDGES.filter((h) => new RegExp(`\\b${h}\\b`, "i").test(text));
  const questions = (text.match(/\?/g) || []).length;
  const firstPerson = (text.match(/\b(I|me|my|mine|we|our)\b/g) || []).length;

  return {
    chars: text.length,
    words: words.length,
    sentences: sentences.length,
    paragraphs: paragraphs.length || (text.trim() ? 1 : 0),
    avgSentenceWords: Math.round(avg * 10) / 10,
    longSentences,
    repeatedWords,
    cliches,
    hedges,
    questions,
    firstPerson,
  };
}

export function formatStats(s: TextStats): string {
  const lines = [
    `Words: ${s.words} · Sentences: ${s.sentences} · Paragraphs: ${s.paragraphs} · Avg sentence: ${s.avgSentenceWords} words`,
  ];
  if (s.longSentences.length) {
    lines.push(`Long sentences (>35 words): ${s.longSentences.length}`);
  }
  if (s.repeatedWords.length) {
    lines.push(
      `Repeated words: ${s.repeatedWords.map((w) => `${w.word} (${w.count})`).join(", ")}`,
    );
  }
  if (s.cliches.length) lines.push(`Clichés: ${s.cliches.join("; ")}`);
  if (s.hedges.length) lines.push(`Hedge-y language: ${s.hedges.join(", ")}`);
  return lines.join("\n");
}
