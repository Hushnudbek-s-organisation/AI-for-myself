export const IELTS_CRITERIA = {
  speaking: {
    parts: [
      {
        part: 1,
        name: "Introduction and interview",
        minutes: "4–5",
        description: "Familiar topics: home, work, study, hobbies.",
      },
      {
        part: 2,
        name: "Long turn",
        minutes: "3–4 including 1 minute prep",
        description: "Speak on a cue card for up to 2 minutes.",
      },
      {
        part: 3,
        name: "Discussion",
        minutes: "4–5",
        description: "Abstract questions linked to Part 2.",
      },
    ],
    unofficialDescriptors: {
      fluency: "Speech rate, pauses, self-correction, coherence of ideas.",
      vocabulary: "Range, precision, collocation, less-common items, paraphrase.",
      grammar: "Sentence variety, accuracy, complex structures.",
      pronunciation: "Intelligibility, word stress, chunking — only if audio exists.",
    },
    disclaimer:
      "Aether does not award official IELTS scores. Any band talk is unofficial practice guidance.",
  },
  writing: {
    tasks: [
      {
        task: 1,
        academic: "Describe visual information (graph, chart, process, map).",
        general: "Write a letter (formal / semi / informal).",
        words: 150,
      },
      {
        task: 2,
        academic: "Essay responding to a point of view, argument, or problem.",
        general: "Essay, slightly more personal tone allowed.",
        words: 250,
      },
    ],
    criteria: [
      "Task achievement / task response",
      "Coherence and cohesion",
      "Lexical resource",
      "Grammatical range and accuracy",
    ],
    disclaimer:
      "Aether does not award official IELTS scores. Feedback is practice-only.",
  },
};

export const IELTS_SPEAKING_PROMPTS = {
  part1: [
    "Do you work or are you a student?",
    "What do you enjoy about your hometown?",
    "How do you usually spend weekends?",
    "Are you interested in reading? Why or why not?",
  ],
  part2: [
    "Describe a skill you would like to learn. You should say what it is, why you want to learn it, how you would learn it, and how it might help you.",
    "Describe a place you have studied or worked that you liked. Say where it was, what you did there, who you were with, and why you liked it.",
  ],
  part3: [
    "How is education changing in your country?",
    "Do you think people will need more skills in the future? Why?",
    "What is the difference between knowledge and skill?",
  ],
};
