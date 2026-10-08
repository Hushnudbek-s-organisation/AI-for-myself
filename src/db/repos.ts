import { id as makeId, now } from "@/lib/ids";
import type {
  Attachment,
  ChatMessage,
  Conversation,
  ModeId,
  PromptKind,
  SavedPrompt,
  Skill,
  SkillExample,
  ToolId,
  Usage,
  UserRole,
} from "@/core/types";
import { json, parseJson, row, rows, run } from "./index";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  role: UserRole;
  preferred_language: string;
  created_at: number;
  updated_at: number;
}

export const users = {
  byId(id: string) {
    return row<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
  },
  byEmail(email: string) {
    return row<UserRow>("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);
  },
  create(input: {
    email: string;
    name: string;
    passwordHash?: string | null;
    role?: UserRole;
  }): UserRow {
    const t = now();
    const user: UserRow = {
      id: makeId("usr"),
      email: input.email.toLowerCase(),
      name: input.name,
      password_hash: input.passwordHash ?? null,
      role: input.role ?? "user",
      preferred_language: "en",
      created_at: t,
      updated_at: t,
    };
    run(
      `INSERT INTO users (id, email, name, password_hash, role, preferred_language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.email,
        user.name,
        user.password_hash,
        user.role,
        user.preferred_language,
        user.created_at,
        user.updated_at,
      ],
    );
    return user;
  },
};

export interface CustomInstructions {
  user_id: string;
  about_user: string;
  response_style: string;
  language: string;
  enabled: number;
}

export const instructions = {
  get(userId: string) {
    return row<CustomInstructions>(
      "SELECT * FROM custom_instructions WHERE user_id = ?",
      [userId],
    );
  },
  upsert(userId: string, data: Partial<CustomInstructions>) {
    const cur = instructions.get(userId);
    const next = {
      user_id: userId,
      about_user: data.about_user ?? cur?.about_user ?? "",
      response_style: data.response_style ?? cur?.response_style ?? "",
      language: data.language ?? cur?.language ?? "",
      enabled: data.enabled ?? cur?.enabled ?? 1,
    };
    run(
      `INSERT INTO custom_instructions (user_id, about_user, response_style, language, enabled)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET about_user=excluded.about_user, response_style=excluded.response_style, language=excluded.language, enabled=excluded.enabled`,
      [next.user_id, next.about_user, next.response_style, next.language, next.enabled],
    );
    return next;
  },
  asText(userId: string): string | null {
    const c = instructions.get(userId);
    if (!c || !c.enabled) return null;
    const parts = [
      c.about_user && `About the user: ${c.about_user}`,
      c.response_style && `Preferred style: ${c.response_style}`,
      c.language && `Preferred language: ${c.language}`,
    ].filter(Boolean);
    return parts.length ? parts.join("\n") : null;
  },
};

interface ConvRow {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  mode: ModeId;
  skill_id: string | null;
  skill_version: number | null;
  model: string | null;
  pinned: number;
  archived: number;
  folder_id: string | null;
  last_message: string | null;
  created_at: number;
  updated_at: number;
}

function convFrom(r: ConvRow): Conversation {
  return {
    id: r.id,
    userId: r.user_id,
    projectId: r.project_id,
    title: r.title,
    mode: r.mode,
    skillId: r.skill_id,
    skillVersion: r.skill_version,
    model: r.model,
    pinned: Boolean(r.pinned),
    archived: Boolean(r.archived),
    folderId: r.folder_id,
    lastMessage: r.last_message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const conversations = {
  get(id: string, userId: string): Conversation | undefined {
    const r = row<ConvRow>(
      "SELECT * FROM conversations WHERE id = ? AND user_id = ?",
      [id, userId],
    );
    return r ? convFrom(r) : undefined;
  },
  getAny(id: string): Conversation | undefined {
    const r = row<ConvRow>("SELECT * FROM conversations WHERE id = ?", [id]);
    return r ? convFrom(r) : undefined;
  },
  list(userId: string, opts?: { q?: string; archived?: boolean }): Conversation[] {
    let sql = "SELECT * FROM conversations WHERE user_id = ?";
    const params: unknown[] = [userId];
    if (opts?.archived) sql += " AND archived = 1";
    else sql += " AND archived = 0";
    if (opts?.q) {
      sql +=
        " AND (title LIKE ? OR id IN (SELECT conversation_id FROM messages WHERE content LIKE ?))";
      params.push(`%${opts.q}%`, `%${opts.q}%`);
    }
    sql += " ORDER BY pinned DESC, updated_at DESC LIMIT 200";
    return rows<ConvRow>(sql, params).map(convFrom);
  },
  create(input: {
    userId: string;
    title?: string;
    mode?: ModeId;
    skillId?: string | null;
    skillVersion?: number | null;
    model?: string | null;
    projectId?: string | null;
  }): Conversation {
    const t = now();
    const c: ConvRow = {
      id: makeId("conv"),
      user_id: input.userId,
      project_id: input.projectId ?? null,
      title: input.title ?? "New Chat",
      mode: input.mode ?? "general",
      skill_id: input.skillId ?? null,
      skill_version: input.skillVersion ?? null,
      model: input.model ?? null,
      pinned: 0,
      archived: 0,
      folder_id: null,
      last_message: null,
      created_at: t,
      updated_at: t,
    };
    run(
      `INSERT INTO conversations (id, user_id, project_id, title, mode, skill_id, skill_version, model, pinned, archived, folder_id, last_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.user_id,
        c.project_id,
        c.title,
        c.mode,
        c.skill_id,
        c.skill_version,
        c.model,
        c.pinned,
        c.archived,
        c.folder_id,
        c.last_message,
        c.created_at,
        c.updated_at,
      ],
    );
    return convFrom(c);
  },
  update(
    id: string,
    userId: string,
    patch: Partial<{
      title: string;
      mode: ModeId;
      skillId: string | null;
      skillVersion: number | null;
      model: string | null;
      pinned: boolean;
      archived: boolean;
      lastMessage: string | null;
    }>,
  ): Conversation | undefined {
    const cur = conversations.get(id, userId);
    if (!cur) return undefined;
    const next = {
      ...cur,
      title: patch.title ?? cur.title,
      mode: patch.mode ?? cur.mode,
      skillId: patch.skillId === undefined ? cur.skillId : patch.skillId,
      skillVersion: patch.skillVersion === undefined ? cur.skillVersion : patch.skillVersion,
      model: patch.model === undefined ? cur.model : patch.model,
      pinned: patch.pinned ?? cur.pinned,
      archived: patch.archived ?? cur.archived,
      lastMessage: patch.lastMessage === undefined ? cur.lastMessage : patch.lastMessage,
      updatedAt: now(),
    };
    run(
      `UPDATE conversations SET title=?, mode=?, skill_id=?, skill_version=?, model=?, pinned=?, archived=?, last_message=?, updated_at=? WHERE id=? AND user_id=?`,
      [
        next.title,
        next.mode,
        next.skillId,
        next.skillVersion,
        next.model,
        next.pinned ? 1 : 0,
        next.archived ? 1 : 0,
        next.lastMessage,
        next.updatedAt,
        id,
        userId,
      ],
    );
    return next;
  },
  remove(id: string, userId: string): boolean {
    const cur = conversations.get(id, userId);
    if (!cur) return false;
    run("DELETE FROM messages WHERE conversation_id = ?", [id]);
    run("DELETE FROM conversations WHERE id = ? AND user_id = ?", [id, userId]);
    return true;
  },
};

interface MsgRow {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: ChatMessage["role"];
  content: string;
  raw_content: string | null;
  mode: ModeId | null;
  skill_id: string | null;
  skill_version: number | null;
  model: string | null;
  token_usage: string | null;
  metadata: string | null;
  created_at: number;
}

function msgFrom(r: MsgRow): ChatMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    parentId: r.parent_id,
    role: r.role,
    content: r.content,
    rawContent: r.raw_content ?? undefined,
    mode: r.mode ?? undefined,
    skillId: r.skill_id ?? undefined,
    skillVersion: r.skill_version ?? undefined,
    model: r.model ?? undefined,
    usage: parseJson<Usage | undefined>(r.token_usage, undefined),
    metadata: parseJson(r.metadata, {}),
    createdAt: r.created_at,
  };
}

export const messages = {
  list(conversationId: string): ChatMessage[] {
    return rows<MsgRow>(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversationId],
    ).map(msgFrom);
  },
  get(id: string) {
    const r = row<MsgRow>("SELECT * FROM messages WHERE id = ?", [id]);
    return r ? msgFrom(r) : undefined;
  },
  create(input: {
    conversationId: string;
    role: ChatMessage["role"];
    content: string;
    rawContent?: string;
    parentId?: string | null;
    mode?: ModeId;
    skillId?: string;
    skillVersion?: number;
    model?: string;
    usage?: Usage;
    metadata?: Record<string, unknown>;
  }): ChatMessage {
    const t = now();
    const m: MsgRow = {
      id: makeId("msg"),
      conversation_id: input.conversationId,
      parent_id: input.parentId ?? null,
      role: input.role,
      content: input.content,
      raw_content: input.rawContent ?? input.content,
      mode: input.mode ?? null,
      skill_id: input.skillId ?? null,
      skill_version: input.skillVersion ?? null,
      model: input.model ?? null,
      token_usage: json(input.usage),
      metadata: json(input.metadata ?? {}),
      created_at: t,
    };
    run(
      `INSERT INTO messages (id, conversation_id, parent_id, role, content, raw_content, mode, skill_id, skill_version, model, token_usage, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        m.id,
        m.conversation_id,
        m.parent_id,
        m.role,
        m.content,
        m.raw_content,
        m.mode,
        m.skill_id,
        m.skill_version,
        m.model,
        m.token_usage,
        m.metadata,
        m.created_at,
      ],
    );
    return msgFrom(m);
  },
  deleteAfter(conversationId: string, createdAt: number) {
    run("DELETE FROM messages WHERE conversation_id = ? AND created_at >= ?", [
      conversationId,
      createdAt,
    ]);
  },
  clear(conversationId: string) {
    run("DELETE FROM messages WHERE conversation_id = ?", [conversationId]);
  },
};

export const files = {
  create(input: {
    userId: string;
    filename: string;
    mime: string;
    size: number;
    path?: string;
    extractedText?: string;
    messageId?: string;
  }): Attachment {
    const rec = {
      id: makeId("file"),
      message_id: input.messageId ?? null,
      user_id: input.userId,
      filename: input.filename,
      mime: input.mime,
      size: input.size,
      path: input.path ?? null,
      extracted_text: input.extractedText ?? null,
      created_at: now(),
    };
    run(
      `INSERT INTO attachments (id, message_id, user_id, filename, mime, size, path, extracted_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rec.id,
        rec.message_id,
        rec.user_id,
        rec.filename,
        rec.mime,
        rec.size,
        rec.path,
        rec.extracted_text,
        rec.created_at,
      ],
    );
    return {
      id: rec.id,
      filename: rec.filename,
      mime: rec.mime,
      size: rec.size,
      extractedText: rec.extracted_text ?? undefined,
    };
  },
  get(id: string, userId: string): Attachment | undefined {
    const r = row<{
      id: string;
      filename: string;
      mime: string;
      size: number;
      extracted_text: string | null;
      user_id: string;
    }>("SELECT * FROM attachments WHERE id = ? AND user_id = ?", [id, userId]);
    if (!r) return undefined;
    return {
      id: r.id,
      filename: r.filename,
      mime: r.mime,
      size: r.size,
      extractedText: r.extracted_text ?? undefined,
    };
  },
};

interface SkillRow {
  id: string;
  owner_id: string | null;
  project_id: string | null;
  slug: string;
  name: string;
  description: string;
  category: string;
  mode: ModeId;
  instructions: string;
  allowed_tools: string;
  input_schema: string | null;
  output_schema: string | null;
  safety_rules: string;
  examples: string;
  enabled: number;
  version: number;
  status: Skill["status"];
  created_at: number;
  updated_at: number;
}

function skillFrom(r: SkillRow): Skill {
  return {
    id: r.id,
    ownerId: r.owner_id,
    projectId: r.project_id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    category: r.category,
    mode: r.mode,
    instructions: r.instructions,
    allowedTools: parseJson<ToolId[]>(r.allowed_tools, []),
    inputSchema: parseJson(r.input_schema, undefined),
    outputSchema: parseJson(r.output_schema, undefined),
    safetyRules: parseJson<string[]>(r.safety_rules, []),
    examples: parseJson<SkillExample[]>(r.examples, []),
    enabled: Boolean(r.enabled),
    version: r.version,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function insertSkill(s: Skill) {
  run(
    `INSERT INTO skills (id, owner_id, project_id, slug, name, description, category, mode, instructions, allowed_tools, input_schema, output_schema, safety_rules, examples, enabled, version, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.id,
      s.ownerId ?? null,
      s.projectId ?? null,
      s.slug,
      s.name,
      s.description,
      s.category,
      s.mode,
      s.instructions,
      json(s.allowedTools),
      json(s.inputSchema ?? null),
      json(s.outputSchema ?? null),
      json(s.safetyRules),
      json(s.examples),
      s.enabled ? 1 : 0,
      s.version,
      s.status,
      s.createdAt,
      s.updatedAt,
    ],
  );
}

export const skills = {
  list(userId: string): Skill[] {
    return rows<SkillRow>(
      "SELECT * FROM skills WHERE owner_id IS NULL OR owner_id = ? ORDER BY name",
      [userId],
    ).map(skillFrom);
  },
  get(idOrSlug: string, userId?: string): Skill | undefined {
    const r = row<SkillRow>(
      "SELECT * FROM skills WHERE (id = ? OR slug = ?) AND (owner_id IS NULL OR owner_id = ? OR ? IS NULL)",
      [idOrSlug, idOrSlug, userId ?? null, userId ?? null],
    );
    return r ? skillFrom(r) : undefined;
  },
  getOwned(id: string, userId: string): Skill | undefined {
    const r = row<SkillRow>("SELECT * FROM skills WHERE id = ? AND owner_id = ?", [id, userId]);
    return r ? skillFrom(r) : undefined;
  },
  snapshot(skill: Skill) {
    run(
      `INSERT INTO skill_versions (id, skill_id, version, snapshot, created_at) VALUES (?, ?, ?, ?, ?)`,
      [makeId("skv"), skill.id, skill.version, json(skill)!, now()],
    );
  },
  create(input: Omit<Skill, "id" | "createdAt" | "updatedAt" | "version"> & { version?: number }): Skill {
    const t = now();
    const s: Skill = {
      ...input,
      id: makeId("skill"),
      version: input.version ?? 1,
      createdAt: t,
      updatedAt: t,
    };
    insertSkill(s);
    skills.snapshot(s);
    return s;
  },
  upsertSystem(s: Skill) {
    const existing = row<SkillRow>("SELECT * FROM skills WHERE id = ?", [s.id]);
    if (existing) return skillFrom(existing);
    insertSkill(s);
    skills.snapshot(s);
    return s;
  },
  update(id: string, userId: string, patch: Partial<Skill>, newVersion = true): Skill | undefined {
    const owned = skills.getOwned(id, userId);
    if (!owned) return undefined;
    const next: Skill = {
      ...owned,
      ...patch,
      id: owned.id,
      ownerId: owned.ownerId,
      version: newVersion ? owned.version + 1 : owned.version,
      updatedAt: now(),
    };
    run(
      `UPDATE skills SET name=?, description=?, category=?, mode=?, instructions=?, allowed_tools=?, input_schema=?, output_schema=?, safety_rules=?, examples=?, enabled=?, version=?, status=?, updated_at=? WHERE id=? AND owner_id=?`,
      [
        next.name,
        next.description,
        next.category,
        next.mode,
        next.instructions,
        json(next.allowedTools),
        json(next.inputSchema ?? null),
        json(next.outputSchema ?? null),
        json(next.safetyRules),
        json(next.examples),
        next.enabled ? 1 : 0,
        next.version,
        next.status,
        next.updatedAt,
        id,
        userId,
      ],
    );
    if (newVersion) skills.snapshot(next);
    return next;
  },
  versions(skillId: string) {
    return rows<{ version: number; snapshot: string; created_at: number }>(
      "SELECT version, snapshot, created_at FROM skill_versions WHERE skill_id = ? ORDER BY version DESC",
      [skillId],
    );
  },
  rollback(skillId: string, userId: string, version: number): Skill | undefined {
    const snap = row<{ snapshot: string }>(
      "SELECT snapshot FROM skill_versions WHERE skill_id = ? AND version = ?",
      [skillId, version],
    );
    if (!snap) return undefined;
    const parsed = parseJson<Skill>(snap.snapshot, null as unknown as Skill);
    if (!parsed) return undefined;
    return skills.update(skillId, userId, { ...parsed, status: parsed.status }, true);
  },
  remove(id: string, userId: string): boolean {
    const owned = skills.getOwned(id, userId);
    if (!owned) return false;
    run("DELETE FROM skills WHERE id = ? AND owner_id = ?", [id, userId]);
    return true;
  },
};

interface PromptRow {
  id: string;
  owner_id: string | null;
  project_id: string | null;
  name: string;
  description: string;
  content: string;
  mode: ModeId | null;
  kind: PromptKind;
  version: number;
  created_at: number;
  updated_at: number;
}

function promptFrom(r: PromptRow): SavedPrompt {
  return {
    id: r.id,
    ownerId: r.owner_id,
    projectId: r.project_id,
    name: r.name,
    description: r.description,
    content: r.content,
    mode: r.mode,
    kind: r.kind,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const prompts = {
  list(userId: string, role: UserRole): SavedPrompt[] {
    const list = rows<PromptRow>(
      "SELECT * FROM prompts WHERE owner_id = ? OR (owner_id IS NULL AND kind != 'system') ORDER BY updated_at DESC",
      [userId],
    ).map(promptFrom);
    if (role === "admin") {
      return rows<PromptRow>("SELECT * FROM prompts ORDER BY kind, name").map(promptFrom);
    }
    return list.filter((p) => p.kind !== "system");
  },
  get(id: string, userId: string, role: UserRole): SavedPrompt | undefined {
    const r = row<PromptRow>("SELECT * FROM prompts WHERE id = ?", [id]);
    if (!r) return undefined;
    const p = promptFrom(r);
    if (p.kind === "system" && role !== "admin") return undefined;
    if (p.ownerId && p.ownerId !== userId && role !== "admin") return undefined;
    return p;
  },
  create(input: Omit<SavedPrompt, "id" | "createdAt" | "updatedAt" | "version">): SavedPrompt {
    const t = now();
    const p: PromptRow = {
      id: makeId("prm"),
      owner_id: input.ownerId ?? null,
      project_id: input.projectId ?? null,
      name: input.name,
      description: input.description,
      content: input.content,
      mode: input.mode ?? null,
      kind: input.kind,
      version: 1,
      created_at: t,
      updated_at: t,
    };
    run(
      `INSERT INTO prompts (id, owner_id, project_id, name, description, content, mode, kind, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id,
        p.owner_id,
        p.project_id,
        p.name,
        p.description,
        p.content,
        p.mode,
        p.kind,
        p.version,
        p.created_at,
        p.updated_at,
      ],
    );
    run(
      `INSERT INTO prompt_versions (id, prompt_id, version, snapshot, created_at) VALUES (?, ?, ?, ?, ?)`,
      [makeId("prv"), p.id, 1, json(promptFrom(p))!, t],
    );
    return promptFrom(p);
  },
  update(id: string, userId: string, patch: Partial<SavedPrompt>): SavedPrompt | undefined {
    const cur = prompts.get(id, userId, "user");
    if (!cur || cur.ownerId !== userId) return undefined;
    const next: SavedPrompt = {
      ...cur,
      ...patch,
      id: cur.id,
      ownerId: cur.ownerId,
      version: cur.version + 1,
      updatedAt: now(),
    };
    run(
      `UPDATE prompts SET name=?, description=?, content=?, mode=?, kind=?, version=?, updated_at=? WHERE id=? AND owner_id=?`,
      [
        next.name,
        next.description,
        next.content,
        next.mode,
        next.kind,
        next.version,
        next.updatedAt,
        id,
        userId,
      ],
    );
    run(
      `INSERT INTO prompt_versions (id, prompt_id, version, snapshot, created_at) VALUES (?, ?, ?, ?, ?)`,
      [makeId("prv"), next.id, next.version, json(next)!, next.updatedAt],
    );
    return next;
  },
  remove(id: string, userId: string): boolean {
    const cur = prompts.get(id, userId, "user");
    if (!cur || cur.ownerId !== userId) return false;
    run("DELETE FROM prompts WHERE id = ? AND owner_id = ?", [id, userId]);
    return true;
  },
};

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  allowed_origins: string;
  enabled_modes: string;
  enabled_skills: string;
  allowed_models: string;
  rate_limit_rpm: number;
  created_at: number;
}

export const projects = {
  list(userId: string) {
    return rows<ProjectRow>("SELECT * FROM api_projects WHERE owner_id = ? ORDER BY created_at DESC", [
      userId,
    ]);
  },
  get(id: string, userId?: string) {
    if (userId) {
      return row<ProjectRow>("SELECT * FROM api_projects WHERE id = ? AND owner_id = ?", [id, userId]);
    }
    return row<ProjectRow>("SELECT * FROM api_projects WHERE id = ?", [id]);
  },
  create(userId: string, name: string): ProjectRow {
    const p: ProjectRow = {
      id: makeId("proj"),
      owner_id: userId,
      name,
      allowed_origins: "[]",
      enabled_modes: "[]",
      enabled_skills: "[]",
      allowed_models: "[]",
      rate_limit_rpm: 60,
      created_at: now(),
    };
    run(
      `INSERT INTO api_projects (id, owner_id, name, allowed_origins, enabled_modes, enabled_skills, allowed_models, rate_limit_rpm, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id,
        p.owner_id,
        p.name,
        p.allowed_origins,
        p.enabled_modes,
        p.enabled_skills,
        p.allowed_models,
        p.rate_limit_rpm,
        p.created_at,
      ],
    );
    return p;
  },
};

export interface ApiKeyRow {
  id: string;
  project_id: string;
  owner_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string;
  rate_limit_rpm: number;
  last_used_at: number | null;
  revoked_at: number | null;
  created_at: number;
}

export const apiKeys = {
  list(userId: string) {
    return rows<ApiKeyRow>(
      "SELECT * FROM api_keys WHERE owner_id = ? ORDER BY created_at DESC",
      [userId],
    );
  },
  byHash(hash: string) {
    return row<ApiKeyRow>(
      "SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
      [hash],
    );
  },
  create(row: ApiKeyRow) {
    run(
      `INSERT INTO api_keys (id, project_id, owner_id, name, key_prefix, key_hash, scopes, rate_limit_rpm, last_used_at, revoked_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.project_id,
        row.owner_id,
        row.name,
        row.key_prefix,
        row.key_hash,
        row.scopes,
        row.rate_limit_rpm,
        row.last_used_at,
        row.revoked_at,
        row.created_at,
      ],
    );
    return row;
  },
  touch(id: string) {
    run("UPDATE api_keys SET last_used_at = ? WHERE id = ?", [now(), id]);
  },
  revoke(id: string, userId: string): boolean {
    const k = row<ApiKeyRow>("SELECT * FROM api_keys WHERE id = ? AND owner_id = ?", [id, userId]);
    if (!k) return false;
    run("UPDATE api_keys SET revoked_at = ? WHERE id = ?", [now(), id]);
    return true;
  },
};

export const usage = {
  write(e: {
    userId?: string;
    projectId?: string;
    conversationId?: string;
    skillId?: string;
    mode?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
    error?: string;
  }) {
    run(
      `INSERT INTO usage_events (id, user_id, project_id, conversation_id, skill_id, mode, model, input_tokens, output_tokens, latency_ms, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        makeId("use"),
        e.userId ?? null,
        e.projectId ?? null,
        e.conversationId ?? null,
        e.skillId ?? null,
        e.mode ?? null,
        e.model ?? null,
        e.inputTokens ?? 0,
        e.outputTokens ?? 0,
        e.latencyMs ?? 0,
        e.error ?? null,
        now(),
      ],
    );
  },
  summary(userId: string) {
    const totals = row<{
      requests: number;
      input_tokens: number;
      output_tokens: number;
      errors: number;
      avg_latency: number;
    }>(
      `SELECT COUNT(*) as requests,
              COALESCE(SUM(input_tokens),0) as input_tokens,
              COALESCE(SUM(output_tokens),0) as output_tokens,
              COALESCE(SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END),0) as errors,
              COALESCE(AVG(latency_ms),0) as avg_latency
       FROM usage_events WHERE user_id = ?`,
      [userId],
    );
    const bySkill = rows<{ skill_id: string; c: number }>(
      `SELECT skill_id, COUNT(*) as c FROM usage_events WHERE user_id = ? AND skill_id IS NOT NULL GROUP BY skill_id ORDER BY c DESC`,
      [userId],
    );
    const byMode = rows<{ mode: string; c: number }>(
      `SELECT mode, COUNT(*) as c FROM usage_events WHERE user_id = ? AND mode IS NOT NULL GROUP BY mode ORDER BY c DESC`,
      [userId],
    );
    const recent = rows(
      `SELECT * FROM usage_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [userId],
    );
    return { totals, bySkill, byMode, recent };
  },
};

export interface RuleRow {
  id: string;
  layer: string;
  name: string;
  content: string;
  enabled: number;
  version: number;
}

const MUTABLE_RULE_LAYERS = new Set(["developer", "output"]);

export const rules = {
  list(): RuleRow[] {
    return rows<RuleRow>("SELECT * FROM rules ORDER BY layer, name");
  },
  get(id: string): RuleRow | undefined {
    return row<RuleRow>("SELECT * FROM rules WHERE id = ?", [id]);
  },
  enabledText(): string {
    const list = rows<RuleRow>(
      "SELECT * FROM rules WHERE enabled = 1 AND layer IN ('developer', 'output') ORDER BY layer, name",
    );
    if (!list.length) return "";
    return list.map((r) => `${r.layer.toUpperCase()} RULE — ${r.name} (v${r.version}):\n${r.content}`).join("\n\n");
  },
  create(input: { layer: string; name: string; content: string }): RuleRow {
    if (!MUTABLE_RULE_LAYERS.has(input.layer)) {
      throw new Error("layer_locked");
    }
    const rec: RuleRow = {
      id: makeId("rule"),
      layer: input.layer,
      name: input.name,
      content: input.content,
      enabled: 1,
      version: 1,
    };
    run("INSERT INTO rules (id, layer, name, content, enabled, version) VALUES (?, ?, ?, ?, ?, ?)", [
      rec.id,
      rec.layer,
      rec.name,
      rec.content,
      rec.enabled,
      rec.version,
    ]);
    return rec;
  },
  update(
    id: string,
    patch: Partial<{ name: string; content: string; enabled: boolean }>,
  ): RuleRow | undefined {
    const cur = rules.get(id);
    if (!cur) return undefined;
    if (!MUTABLE_RULE_LAYERS.has(cur.layer)) return undefined;
    const next: RuleRow = {
      ...cur,
      name: patch.name ?? cur.name,
      content: patch.content ?? cur.content,
      enabled: patch.enabled === undefined ? cur.enabled : patch.enabled ? 1 : 0,
      version: patch.content && patch.content !== cur.content ? cur.version + 1 : cur.version,
    };
    run("UPDATE rules SET name=?, content=?, enabled=?, version=? WHERE id=?", [
      next.name,
      next.content,
      next.enabled,
      next.version,
      id,
    ]);
    return next;
  },
  remove(id: string): boolean {
    const cur = rules.get(id);
    if (!cur || !MUTABLE_RULE_LAYERS.has(cur.layer)) return false;
    run("DELETE FROM rules WHERE id = ?", [id]);
    return true;
  },
};
