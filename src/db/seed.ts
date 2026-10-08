import { BUILTIN_SKILLS } from "@/core/skills/builtin";
import { getConfig } from "@/core/config";
import { getDb } from "./index";
import { prompts, skills, users } from "./repos";
import { hashPassword } from "@/lib/auth-hash";

let seeded = false;

export function ensureSeeded(): void {
  if (seeded) return;
  getDb();
  const cfg = getConfig();
  let admin = users.byEmail("admin@aether.local");
  if (cfg.allowDemoAccounts) {
    if (!admin) {
      admin = users.create({
        email: "admin@aether.local",
        name: "Aether Admin",
        passwordHash: hashPassword("aether-admin"),
        role: "admin",
      });
    }
    if (!users.byEmail("demo@aether.local")) {
      users.create({
        email: "demo@aether.local",
        name: "Demo",
        passwordHash: hashPassword("demo"),
        role: "user",
      });
    }
  }
  if (!admin) {
    admin = users.create({
      email: "system@aether.local",
      name: "System",
      role: "admin",
    });
  }
  for (const s of BUILTIN_SKILLS) {
    skills.upsertSystem(s);
  }
  const existingPrompts = prompts.list(admin.id, "admin");
  if (!existingPrompts.some((p) => p.name === "Essay Reviewer")) {
    prompts.create({
      ownerId: admin.id,
      name: "Essay Reviewer",
      description: "Reusable admissions essay review task.",
      content:
        "Review my essay using these criteria: prompt fit, authenticity, structure, specificity, grammar. Do not invent achievements. Ask if evidence is missing.",
      mode: "essay",
      kind: "task",
    });
    prompts.create({
      ownerId: admin.id,
      name: "SOP Writer",
      description: "SOP critique scaffold.",
      content:
        "Critique this statement of purpose for motivation, academic background, program fit, career goals, evidence, and coherence. Never invent personal information.",
      mode: "sop",
      kind: "task",
    });
    prompts.create({
      ownerId: admin.id,
      name: "IELTS Practice",
      description: "Start an unofficial IELTS speaking session.",
      content: "Start IELTS Speaking Part 1. Ask one question at a time. Unofficial practice only.",
      mode: "ielts_speaking",
      kind: "task",
    });
    prompts.create({
      ownerId: admin.id,
      name: "Visa Interview",
      description: "Honest F-1 / student visa mock.",
      content:
        "Run a student visa mock interview. Country: United States. Type: F-1. Never teach deception. Never guarantee approval.",
      mode: "visa",
      kind: "task",
    });
    prompts.create({
      ownerId: admin.id,
      name: "CV Reviewer",
      description: "ATS-aware CV review without invented metrics.",
      content:
        "Review my CV. Improve bullets using only my facts. If a metric is missing, ask. Give ATS notes.",
      mode: "cv",
      kind: "task",
    });
  }
  seeded = true;
}
