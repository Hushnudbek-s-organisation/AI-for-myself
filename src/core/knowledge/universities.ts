export interface UniversityRecord {
  id: string;
  name: string;
  country: string;
  city: string;
  website: string;
  fields: string[];
  notes: string;
  tuitionNote: string;
  rankingNote: string;
  deadlinesNote: string;
  source: string;
}

/**
 * Curated, conservative records. Numeric tuition/rankings/deadlines are
 * intentionally omitted or described as "verify officially" so the model
 * cannot treat stale numbers as facts.
 */
export const UNIVERSITIES: UniversityRecord[] = [
  {
    id: "mit",
    name: "Massachusetts Institute of Technology",
    country: "United States",
    city: "Cambridge, MA",
    website: "https://www.mit.edu",
    fields: ["computer science", "engineering", "physics", "economics"],
    notes: "Strong in STEM. Highly selective. Research-intensive.",
    tuitionNote: "Verify current tuition and aid on MIT's official admissions/financial aid pages.",
    rankingNote: "Widely recognised globally; do not cite a single official ranking number from this tool.",
    deadlinesNote: "Verify current undergraduate and graduate deadlines on MIT admissions.",
    source: "Aether university knowledge (institutional website listed)",
  },
  {
    id: "stanford",
    name: "Stanford University",
    country: "United States",
    city: "Stanford, CA",
    website: "https://www.stanford.edu",
    fields: ["computer science", "engineering", "business", "humanities"],
    notes: "Research university with strong CS and entrepreneurship ecosystem.",
    tuitionNote: "Verify on Stanford Student Financial Services / graduate program pages.",
    rankingNote: "Globally recognised; no ranking number in this record.",
    deadlinesNote: "Verify on Stanford admissions for the specific program.",
    source: "Aether university knowledge (institutional website listed)",
  },
  {
    id: "oxford",
    name: "University of Oxford",
    country: "United Kingdom",
    city: "Oxford",
    website: "https://www.ox.ac.uk",
    fields: ["humanities", "law", "sciences", "ppe", "medicine"],
    notes: "Collegiate university. Graduate applications are department-specific.",
    tuitionNote: "UK fees differ for home vs overseas; verify on Oxford fees pages.",
    rankingNote: "Globally recognised; no ranking number in this record.",
    deadlinesNote: "Many graduate courses have early December deadlines — verify per course.",
    source: "Aether university knowledge (institutional website listed)",
  },
  {
    id: "cambridge",
    name: "University of Cambridge",
    country: "United Kingdom",
    city: "Cambridge",
    website: "https://www.cam.ac.uk",
    fields: ["sciences", "engineering", "humanities", "mathematics"],
    notes: "Collegiate. Supervision system. Funding via colleges and departments.",
    tuitionNote: "Verify on Cambridge postgraduate fees pages.",
    rankingNote: "Globally recognised; no ranking number in this record.",
    deadlinesNote: "Verify per course on the postgraduate course directory.",
    source: "Aether university knowledge (institutional website listed)",
  },
  {
    id: "eth",
    name: "ETH Zurich",
    country: "Switzerland",
    city: "Zurich",
    website: "https://ethz.ch",
    fields: ["engineering", "computer science", "architecture", "natural sciences"],
    notes: "Public research university. Many master's taught in English.",
    tuitionNote: "Swiss public tuition is typically modest vs US private; verify on ETH.",
    rankingNote: "Globally recognised in STEM; no number in this record.",
    deadlinesNote: "Verify on ETH admissions for the specific programme.",
    source: "Aether university knowledge (institutional website listed)",
  },
  {
    id: "toronto",
    name: "University of Toronto",
    country: "Canada",
    city: "Toronto",
    website: "https://www.utoronto.ca",
    fields: ["computer science", "life sciences", "engineering", "arts"],
    notes: "Large public research university. Multiple campuses.",
    tuitionNote: "International fees differ by program; verify on U of T.",
    rankingNote: "Globally recognised; no number in this record.",
    deadlinesNote: "Verify per faculty.",
    source: "Aether university knowledge (institutional website listed)",
  },
  {
    id: "melbourne",
    name: "University of Melbourne",
    country: "Australia",
    city: "Melbourne",
    website: "https://www.unimelb.edu.au",
    fields: ["arts", "science", "engineering", "law", "business"],
    notes: "Go8 research university. Graduate coursework and research degrees.",
    tuitionNote: "Verify on Melbourne fees pages.",
    rankingNote: "Globally recognised; no number in this record.",
    deadlinesNote: "Intake often semester-based — verify per program.",
    source: "Aether university knowledge (institutional website listed)",
  },
  {
    id: "nus",
    name: "National University of Singapore",
    country: "Singapore",
    city: "Singapore",
    website: "https://www.nus.edu.sg",
    fields: ["computer science", "engineering", "business", "life sciences"],
    notes: "Research-intensive. Competitive regional and global applicant pool.",
    tuitionNote: "Verify on NUS Office of Admissions / graduate school.",
    rankingNote: "Globally recognised; no number in this record.",
    deadlinesNote: "Verify per faculty.",
    source: "Aether university knowledge (institutional website listed)",
  },
  {
    id: "tum",
    name: "Technical University of Munich",
    country: "Germany",
    city: "Munich",
    website: "https://www.tum.de",
    fields: ["engineering", "computer science", "natural sciences"],
    notes: "TU9. Many MSc programmes in English. Public tuition model (verify semester fees).",
    tuitionNote: "Germany public universities often have low tuition plus semester contribution — verify on TUM.",
    rankingNote: "Strong in engineering; no number in this record.",
    deadlinesNote: "Verify on TUM for winter/summer intake.",
    source: "Aether university knowledge (institutional website listed)",
  },
  {
    id: "kaist",
    name: "KAIST",
    country: "South Korea",
    city: "Daejeon",
    website: "https://www.kaist.ac.kr",
    fields: ["engineering", "computer science", "natural sciences"],
    notes: "Science and technology research university. International graduate programs.",
    tuitionNote: "Verify on KAIST admissions; scholarships may exist — verify officially.",
    rankingNote: "Regionally and globally recognised in STEM; no number in this record.",
    deadlinesNote: "Verify on KAIST graduate admissions.",
    source: "Aether university knowledge (institutional website listed)",
  },
];

export function searchUniversities(query: string): UniversityRecord[] {
  const q = query.toLowerCase().trim();
  if (!q) return UNIVERSITIES.slice(0, 8);
  return UNIVERSITIES.filter((u) => {
    const blob = `${u.name} ${u.country} ${u.city} ${u.fields.join(" ")} ${u.notes}`.toLowerCase();
    return q.split(/\s+/).every((tok) => blob.includes(tok) || u.id.includes(tok));
  });
}
