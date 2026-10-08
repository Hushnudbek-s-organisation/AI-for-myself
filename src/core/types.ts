export const MODE_IDS = [
  "general",
  "essay",
  "sop",
  "cv",
  "university",
  "scholarship",
  "admission",
  "visa",
  "ielts_speaking",
  "ielts_writing",
  "document",
  "interview",
  "career",
  "application",
] as const;

export type ModeId = (typeof MODE_IDS)[number];

export const TOOL_IDS = [
  "university_search",
  "scholarship_search",
  "visa_question_bank",
  "ielts_criteria",
  "document_extract",
  "text_analyze",
  "cv_analyze",
  "essay_analyze",
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export const MODEL_TIERS = ["fast", "balanced", "reasoning"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export const API_SCOPES = [
  "chat",
  "stream",
  "files",
  "voice",
  "tools",
  "skills",
  "memory",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export type Role = "system" | "user" | "assistant" | "tool";
export type UserRole = "user" | "admin";
export type PromptKind = "system" | "mode" | "skill" | "user" | "task";
export type RuleLayer =
  | "platform"
  | "privacy"
  | "system"
  | "developer"
  | "mode"
  | "skill"
  | "output"
  | "tool";

export interface Attachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
  extractedText?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  parentId?: string | null;
  role: Role;
  content: string;
  rawContent?: string;
  mode?: ModeId;
  skillId?: string;
  skillVersion?: number;
  model?: string;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  usage?: Usage;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface Conversation {
  id: string;
  userId: string;
  projectId?: string | null;
  title: string;
  mode: ModeId;
  skillId?: string | null;
  skillVersion?: number | null;
  model?: string | null;
  pinned: boolean;
  archived: boolean;
  folderId?: string | null;
  lastMessage?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Skill {
  id: string;
  ownerId?: string | null;
  projectId?: string | null;
  slug: string;
  name: string;
  description: string;
  category: string;
  mode: ModeId;
  instructions: string;
  allowedTools: ToolId[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  safetyRules: string[];
  examples: SkillExample[];
  enabled: boolean;
  version: number;
  status: "draft" | "active" | "disabled";
  createdAt: number;
  updatedAt: number;
}

export interface SkillExample {
  input: string;
  output: string;
}

export interface SkillVersion {
  id: string;
  skillId: string;
  version: number;
  snapshot: Skill;
  createdAt: number;
}

export interface SavedPrompt {
  id: string;
  ownerId?: string | null;
  projectId?: string | null;
  name: string;
  description: string;
  content: string;
  mode?: ModeId | null;
  kind: PromptKind;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface ToolCall {
  id: string;
  name: ToolId | string;
  input: unknown;
  output?: unknown;
  status: "pending" | "ok" | "error";
  error?: string;
}

export interface Source {
  title: string;
  url?: string;
  publisher?: string;
  retrievedAt?: string;
  note?: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
  provider: string;
  estimated?: boolean;
}

export interface AuthContext {
  kind: "session" | "api_key";
  userId: string;
  role: UserRole;
  projectId?: string | null;
  scopes: ApiScope[];
  keyId?: string;
  email?: string;
  name?: string;
  rateLimitRpm?: number;
}

export interface ExternalContext {
  [key: string]: unknown;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  mode?: ModeId;
  skill?: string;
  skillId?: string;
  context?: ExternalContext;
  files?: Attachment[];
  model?: string;
  stream?: boolean;
  regenerateOf?: string;
  editOf?: string;
}

export interface ChatResponse {
  id: string;
  message: string;
  conversationId: string;
  mode: ModeId;
  skill?: string;
  skillVersion?: number;
  promptVersion?: number;
  sources: Source[];
  usage: Usage;
  toolCalls: ToolCall[];
  title?: string;
  requestId?: string;
  provider?: string;
  mock?: boolean;
}

export interface ModeDefinition {
  id: ModeId;
  name: string;
  description: string;
  instructions: string;
  allowedSkills: string[];
  allowedTools: ToolId[];
  outputFormat: string;
  safetyRules: string[];
  contextRequirements: string[];
  languageBehavior: string;
  voiceBehavior: string;
}

export interface PromptLayer {
  layer:
    | "platform_security"
    | "privacy"
    | "system"
    | "developer"
    | "mode"
    | "skill"
    | "user_custom"
    | "trusted_context"
    | "tool_results"
    | "conversation"
    | "user_message"
    | "external_context"
    | "document";
  trusted: boolean;
  content: string;
}

export interface AssembledPrompt {
  layers: PromptLayer[];
  systemText: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  visibleToUser: {
    mode: ModeId;
    skill?: string;
    skillVersion?: number;
    customInstructions: boolean;
    tools: string[];
    files: string[];
    model: string;
  };
}

export interface GenerateParams {
  assembled: AssembledPrompt;
  mode: ModeDefinition;
  skill?: Skill | null;
  toolsAllowed: ToolId[];
  model: string;
  tier: ModelTier;
  attachments: Attachment[];
  externalContext?: ExternalContext;
  abort?: AbortSignal;
  timeoutMs?: number;
}

export interface GenerateChunk {
  type: "token" | "tool" | "source" | "usage" | "done" | "error";
  text?: string;
  tool?: ToolCall;
  source?: Source;
  usage?: Usage;
  error?: string;
}

export interface ModelProvider {
  id: string;
  name: string;
  tiers: ModelTier[];
  generate(params: GenerateParams): AsyncIterable<GenerateChunk>;
  generateStructured?(params: GenerateParams, schema: unknown): Promise<unknown>;
  supportsVision(): boolean;
  supportsTools(): boolean;
  supportsAudio(): boolean;
  healthCheck(): Promise<{ ok: boolean; configured: boolean; mock?: boolean }>;
}

export const MAX_SKILL_CHAIN = 4;
export const MAX_TOOL_CALLS = 6;
export const MAX_CONTEXT_CHARS = 24_000;
export const MAX_EXTERNAL_CONTEXT_CHARS = 4_000;
export const MAX_FILE_CHARS = 40_000;
export const MAX_HISTORY_MESSAGES = 40;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
