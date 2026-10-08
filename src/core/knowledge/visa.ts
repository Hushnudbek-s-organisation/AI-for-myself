export interface VisaQuestion {
  id: string;
  country: string;
  visaType: string;
  category: string;
  question: string;
  looksFor: string;
}

export const VISA_QUESTIONS: VisaQuestion[] = [
  {
    id: "us-f1-1",
    country: "United States",
    visaType: "F-1",
    category: "intent",
    question: "Why do you want to study in the United States?",
    looksFor: "Academic purpose, program fit, not immigration intent.",
  },
  {
    id: "us-f1-2",
    country: "United States",
    visaType: "F-1",
    category: "program",
    question: "Why this university and this program?",
    looksFor: "Specific academic reasons, not prestige-only answers.",
  },
  {
    id: "us-f1-3",
    country: "United States",
    visaType: "F-1",
    category: "funding",
    question: "Who is paying for your education, and what is the source of those funds?",
    looksFor: "Clear, consistent, lawful funding. No coached fabrications.",
  },
  {
    id: "us-f1-4",
    country: "United States",
    visaType: "F-1",
    category: "ties",
    question: "What will you do after you graduate?",
    looksFor: "Plausible plans consistent with home-country ties. No guaranteed work claims.",
  },
  {
    id: "us-f1-5",
    country: "United States",
    visaType: "F-1",
    category: "consistency",
    question: "How did you choose your major?",
    looksFor: "Consistent with academic history. No invented internships.",
  },
  {
    id: "uk-student-1",
    country: "United Kingdom",
    visaType: "Student",
    category: "program",
    question: "Why this course, and how does it build on your previous study?",
    looksFor: "Genuine Student test: credibility of study path.",
  },
  {
    id: "uk-student-2",
    country: "United Kingdom",
    visaType: "Student",
    category: "funding",
    question: "How are you funding your tuition and living costs?",
    looksFor: "Maintenance funds that match documents the applicant actually has.",
  },
  {
    id: "uk-student-3",
    country: "United Kingdom",
    visaType: "Student",
    category: "intent",
    question: "What are your plans after the course ends?",
    looksFor: "Credible plans; no coaching to hide intent.",
  },
  {
    id: "schengen-1",
    country: "Schengen",
    visaType: "Short stay",
    category: "intent",
    question: "What is the purpose and duration of your trip?",
    looksFor: "Clear itinerary matching documents.",
  },
  {
    id: "schengen-2",
    country: "Schengen",
    visaType: "Short stay",
    category: "ties",
    question: "What reasons do you have to return after this trip?",
    looksFor: "Honest ties — family, study, work. Never invent jobs.",
  },
  {
    id: "ca-study-1",
    country: "Canada",
    visaType: "Study permit",
    category: "program",
    question: "Why Canada, and why this school?",
    looksFor: "Program-specific reasons.",
  },
  {
    id: "ca-study-2",
    country: "Canada",
    visaType: "Study permit",
    category: "funding",
    question: "Show how you will pay tuition and living expenses.",
    looksFor: "Lawful funds. No fake bank statements.",
  },
];

export function visaQuestions(filter: {
  country?: string;
  visaType?: string;
}): VisaQuestion[] {
  return VISA_QUESTIONS.filter((q) => {
    if (filter.country && !q.country.toLowerCase().includes(filter.country.toLowerCase())) {
      return false;
    }
    if (filter.visaType && !q.visaType.toLowerCase().includes(filter.visaType.toLowerCase())) {
      return false;
    }
    return true;
  });
}
