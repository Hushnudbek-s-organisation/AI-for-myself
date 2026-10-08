export interface ScholarshipRecord {
  id: string;
  name: string;
  funder: string;
  website: string;
  regions: string[];
  level: string;
  focus: string;
  fundingNote: string;
  deadlineNote: string;
  eligibilityNote: string;
  source: string;
}

export const SCHOLARSHIPS: ScholarshipRecord[] = [
  {
    id: "chevening",
    name: "Chevening Scholarships",
    funder: "UK Foreign, Commonwealth & Development Office",
    website: "https://www.chevening.org",
    regions: ["global", "uk"],
    level: "master's",
    focus: "Leadership and one-year UK master's",
    fundingNote: "Typically covers tuition and living — verify current package on Chevening.",
    deadlineNote: "Usually annual; verify the current cycle on chevening.org.",
    eligibilityNote: "Work experience, citizenship of a Chevening-eligible country, and other criteria — verify officially.",
    source: "Aether scholarship knowledge (official site listed)",
  },
  {
    id: "daad",
    name: "DAAD Scholarships",
    funder: "German Academic Exchange Service",
    website: "https://www.daad.de",
    regions: ["global", "germany"],
    level: "various",
    focus: "Study and research in Germany",
    fundingNote: "Varies by programme. Verify on DAAD scholarship database.",
    deadlineNote: "Programme-specific. Verify on DAAD.",
    eligibilityNote: "Depends on the specific DAAD programme.",
    source: "Aether scholarship knowledge (official site listed)",
  },
  {
    id: "fulbright",
    name: "Fulbright Foreign Student Program",
    funder: "U.S. Department of State",
    website: "https://foreign.fulbrightonline.org",
    regions: ["global", "united states"],
    level: "graduate",
    focus: "Graduate study / research in the United States",
    fundingNote: "Varies by country commission. Verify locally.",
    deadlineNote: "Set by each country's Fulbright commission — verify locally.",
    eligibilityNote: "Citizenship and academic criteria vary by country.",
    source: "Aether scholarship knowledge (official site listed)",
  },
  {
    id: "erasmus-mundus",
    name: "Erasmus Mundus Joint Masters",
    funder: "European Commission",
    website: "https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en",
    regions: ["global", "europe"],
    level: "master's",
    focus: "Joint master's across European universities",
    fundingNote: "Scholarships available for selected programmes — verify catalogue.",
    deadlineNote: "Per programme, often late autumn / winter. Verify catalogue.",
    eligibilityNote: "Programme-specific academic requirements.",
    source: "Aether scholarship knowledge (official site listed)",
  },
  {
    id: "gates-cambridge",
    name: "Gates Cambridge",
    funder: "Gates Cambridge Trust",
    website: "https://www.gatescambridge.org",
    regions: ["global", "uk"],
    level: "postgraduate",
    focus: "Postgraduate study at Cambridge",
    fundingNote: "Full-cost scholarship — verify current coverage.",
    deadlineNote: "Tied to Cambridge course deadlines — verify.",
    eligibilityNote: "Outstanding academic record and leadership; not for UK citizens in some categories — verify.",
    source: "Aether scholarship knowledge (official site listed)",
  },
  {
    id: "rhodes",
    name: "Rhodes Scholarship",
    funder: "Rhodes Trust",
    website: "https://www.rhodeshouse.ox.ac.uk",
    regions: ["global", "uk"],
    level: "postgraduate",
    focus: "Postgraduate study at Oxford",
    fundingNote: "Full funding — verify current coverage.",
    deadlineNote: "Constituency-specific. Verify on Rhodes Trust.",
    eligibilityNote: "Age, citizenship constituency, and academic criteria — verify.",
    source: "Aether scholarship knowledge (official site listed)",
  },
  {
    id: "australia-awards",
    name: "Australia Awards",
    funder: "Australian Government",
    website: "https://www.australiaawards.gov.au",
    regions: ["selected partner countries", "australia"],
    level: "various",
    focus: "Study in Australia for partner-country applicants",
    fundingNote: "Typically full — verify for your country.",
    deadlineNote: "Country-specific. Verify on Australia Awards.",
    eligibilityNote: "Must be a citizen of a participating country.",
    source: "Aether scholarship knowledge (official site listed)",
  },
  {
    id: "mext",
    name: "MEXT Scholarship",
    funder: "Government of Japan",
    website: "https://www.studyinjapan.go.jp",
    regions: ["global", "japan"],
    level: "undergraduate/graduate/research",
    focus: "Study in Japan",
    fundingNote: "Typically stipend + tuition — verify embassy information.",
    deadlineNote: "Embassy vs university recommendation tracks differ — verify.",
    eligibilityNote: "Age and academic criteria vary by track.",
    source: "Aether scholarship knowledge (official site listed)",
  },
];

export function searchScholarships(query: string): ScholarshipRecord[] {
  const q = query.toLowerCase().trim();
  if (!q) return SCHOLARSHIPS;
  return SCHOLARSHIPS.filter((s) => {
    const blob = `${s.name} ${s.funder} ${s.regions.join(" ")} ${s.level} ${s.focus}`.toLowerCase();
    return q.split(/\s+/).some((tok) => blob.includes(tok) || s.id.includes(tok));
  });
}
