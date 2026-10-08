"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Copy,
  FileUp,
  Menu,
  Mic,
  MicOff,
  PanelRight,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Send,
  Square,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { Mark } from "@/components/Mark";
import { AetherMark } from "./icons";
import { groupConversations } from "@/lib/group-chats";
import { readSSE } from "@/lib/sse";
import { cn } from "@/lib/cn";
import type { ChatMessage, Conversation, ModeId, SavedPrompt, Skill } from "@/core/types";

type User = { id: string; email?: string; name?: string; role?: string };

type PublicModel = {
  id: string;
  label: string;
  provider: string;
  available: boolean;
  mock?: boolean;
  /** Resolved wire id for the configured key (never the API key). */
  wireModel?: string | null;
  wireSource?: "env" | "discovery" | "unresolved";
  note?: string;
};

const NAV = [
  { href: "/chat", label: "Chats" },
  { href: "/skills", label: "Skills" },
  { href: "/prompts", label: "Prompts" },
  { href: "/developer", label: "Developer" },
  { href: "/settings", label: "Settings" },
];

export function ChatApp({ initialId }: { initialId?: string }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(initialId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);
  const [skillId, setSkillId] = useState<string>("");
  const [mode, setMode] = useState<ModeId>("general");
  const [files, setFiles] = useState<Array<{ id: string; filename: string; mime: string; size: number }>>([]);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [visible, setVisible] = useState<Record<string, unknown> | null>(null);
  const [mockAi, setMockAi] = useState(false);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<PublicModel[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRecognition | null>(null);

  const activeSkill = skills.find((s) => s.id === skillId || s.slug === skillId);
  const selectedModel = models.find((m) => m.id === model);
  // A key with no usable model: say so plainly instead of failing mid-answer.
  const modelProblem =
    !mockAi && selectedModel?.available && !selectedModel.wireModel ? selectedModel.note || "" : "";

  const grouped = useMemo(
    () => groupConversations(conversations.filter((c) => !search || c.title.toLowerCase().includes(search.toLowerCase()))),
    [conversations, search],
  );

  const boot = useCallback(async () => {
    let me = await fetch("/api/v1/auth/me").then((r) => r.json());
    if (!me.user) {
      await fetch("/api/v1/auth/guest", { method: "POST" });
      me = await fetch("/api/v1/auth/me").then((r) => r.json());
    }
    setUser(me.user);
    const [c, s, p, h, m] = await Promise.all([
      fetch("/api/v1/conversations").then((r) => r.json()),
      fetch("/api/v1/skills").then((r) => r.json()),
      fetch("/api/v1/prompts").then((r) => r.json()),
      fetch("/api/health").then((r) => r.json()).catch(() => ({})),
      fetch("/api/v1/models").then((r) => r.json()).catch(() => ({})),
    ]);
    setMockAi(Boolean(h?.ai?.mock));
    setConversations(c.conversations || []);
    setSkills(s.skills || []);
    setPrompts(p.prompts || []);
    const catalog: PublicModel[] = m.models || [];
    setModels(catalog);
    // Prefer the server's default provider, but never land on one whose key is missing.
    const preferred =
      catalog.find((x) => x.id === m.defaultModel && x.available)?.id ??
      catalog.find((x) => x.available)?.id ??
      m.defaultModel ??
      "";
    setModel((prev) => prev || preferred);
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    fetch(`/api/v1/conversations/${activeId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setMessages(d.messages || []);
        if (d.conversation?.mode) setMode(d.conversation.mode);
        if (d.conversation?.skillId) setSkillId(d.conversation.skillId);
        if (d.conversation?.model) setModel(d.conversation.model);
        const last = [...(d.messages || [])].reverse().find((m: ChatMessage) => m.role === "assistant");
        if (last?.metadata && typeof last.metadata === "object" && "visible" in last.metadata) {
          setVisible((last.metadata as { visible: Record<string, unknown> }).visible);
        }
      });
    router.replace(`/chat/${activeId}`, { scroll: false });
  }, [activeId, router]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamText]);

  async function refreshConvos() {
    const c = await fetch("/api/v1/conversations").then((r) => r.json());
    setConversations(c.conversations || []);
  }

  async function newChat() {
    const r = await fetch("/api/v1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, skillId: skillId || undefined, model: model || undefined }),
    }).then((x) => x.json());
    setActiveId(r.conversation.id);
    setMessages([]);
    setStreamText("");
    setVisible(null);
    refreshConvos();
  }

  async function send(text?: string, editOf?: string) {
    const message = (text ?? input).trim();
    if (!message || streaming) return;
    setInput("");
    setError(null);
    setStreaming(true);
    setStreamText("");
    const optimistic: ChatMessage = {
      id: "tmp_user",
      conversationId: activeId || "",
      role: "user",
      content: message,
      createdAt: Date.now(),
    };
    if (editOf) {
      const idx = messages.findIndex((m) => m.id === editOf);
      setMessages((prev) => (idx >= 0 ? prev.slice(0, idx) : prev).concat(optimistic));
    } else {
      setMessages((m) => [...m, optimistic]);
    }
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/v1/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId: activeId,
          mode,
          skill: skillId || undefined,
          model: model || undefined,
          files,
          editOf,
        }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
      let convId = activeId;
      await readSSE(
        res,
        (event, data) => {
          if (event === "meta") {
            convId = String(data.conversationId || convId);
            setActiveId(convId);
            if (data.visible) setVisible(data.visible as Record<string, unknown>);
          }
          if (event === "token" && data.text) {
            setStreamText((t) => t + String(data.text));
          }
          if (event === "error") {
            setError(String(data.error || "Generation error"));
          }
          if (event === "done") {
            setStreamText("");
          }
        },
        ac.signal,
      );
      if (convId) {
        const d = await fetch(`/api/v1/conversations/${convId}`).then((r) => r.json());
        setMessages(d.messages || []);
      }
      setFiles([]);
      await refreshConvos();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Failed");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  async function removeConv(id: string) {
    await fetch(`/api/v1/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) {
      setActiveId(undefined);
      setMessages([]);
      router.replace("/chat");
    }
    refreshConvos();
  }

  async function renameConv(id: string, title: string) {
    await fetch(`/api/v1/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setRenameId(null);
    refreshConvos();
  }

  async function patchConv(id: string, body: Record<string, unknown>) {
    await fetch(`/api/v1/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    refreshConvos();
  }

  async function upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/v1/files", { method: "POST", body: fd }).then((x) => x.json());
    if (r.file) setFiles((f) => [...f, r.file]);
  }

  function toggleVoice() {
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition
      || (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition;
    if (!SR) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const t = Array.from(ev.results)
        .map((r) => r[0].transcript)
        .join(" ");
      setInput(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = (ev: { error?: string }) => {
      setListening(false);
      const code = ev.error || "";
      if (code === "not-allowed" || code === "permission-denied") {
        setError("Microphone permission denied (MIC_PERMISSION_DENIED).");
      } else if (code === "network") {
        setError("Speech recognition network error (NETWORK_ERROR).");
      } else if (code === "aborted") {
        setError(null);
      } else {
        setError("Speech recognition failed (STT_FAILED). Try typing instead.");
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setError("Could not start the microphone.");
    }
  }

  function speak(text: string) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 1500));
    window.speechSynthesis.speak(u);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
  }

  async function regenerate() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    await send(lastUser.content, lastUser.id);
  }

  function applyPrompt(p: SavedPrompt) {
    setInput(p.content);
    if (p.mode) setMode(p.mode);
  }

  const displayMessages = messages.filter((m) => m.role === "user" || m.role === "assistant");

  return (
    <div className="flex h-dvh overflow-hidden text-mist-50">
      <aside
        className={cn(
          "flex w-[280px] shrink-0 flex-col border-r border-gold-400/10 bg-ink-900/80 backdrop-blur-md",
          "max-md:fixed max-md:inset-y-0 max-md:z-40 max-md:shadow-2xl",
          !sidebar && "max-md:-translate-x-full",
          !sidebar && "md:hidden",
        )}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <AetherMark className="h-8 w-8" />
          <div>
            <div className="font-serif text-lg leading-none tracking-tight">Aether</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-mist-400">Universal AI</div>
          </div>
          <button className="ml-auto rounded-md p-1 text-mist-400 md:hidden" onClick={() => setSidebar(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={newChat}
          className="mx-3 mb-3 flex items-center justify-center gap-2 rounded-xl border border-gold-400/25 bg-gold-400/10 px-3 py-2 text-sm text-gold-300 hover:bg-gold-400/20"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-ink-850 px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-mist-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations"
              className="w-full bg-transparent text-sm outline-none placeholder:text-mist-500"
            />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 text-[11px] uppercase tracking-wider text-mist-400">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-full px-2 py-1 hover:bg-white/5 hover:text-mist-50">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-4">
          {grouped.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.16em] text-mist-400">{g.label}</div>
              {g.items.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group mb-0.5 flex items-center rounded-lg px-2 py-1.5 text-sm",
                    c.id === activeId ? "bg-iris-400/15 text-white" : "text-mist-100 hover:bg-white/5",
                  )}
                >
                  {renameId === c.id ? (
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onBlur={() => renameConv(c.id, renameVal)}
                      onKeyDown={(e) => e.key === "Enter" && renameConv(c.id, renameVal)}
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  ) : (
                    <button className="min-w-0 flex-1 truncate text-left" onClick={() => setActiveId(c.id)}>
                      {c.title}
                    </button>
                  )}
                  <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                    <button
                      className="p-1 text-mist-400 hover:text-white"
                      onClick={() => {
                        setRenameId(c.id);
                        setRenameVal(c.title);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button className="p-1 text-mist-400 hover:text-white" onClick={() => patchConv(c.id, { pinned: !c.pinned })}>
                      <Pin className="h-3 w-3" />
                    </button>
                    <button className="p-1 text-mist-400 hover:text-white" onClick={() => patchConv(c.id, { archived: true })}>
                      <Archive className="h-3 w-3" />
                    </button>
                    <button className="p-1 text-mist-400 hover:text-red-400" onClick={() => removeConv(c.id)}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="border-t border-white/5 px-4 py-3 text-xs text-mist-400">
          <div className="truncate text-mist-100">{user?.name || "Workspace"}</div>
          <div className="truncate">{user?.email}</div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
          <button className="rounded-md p-1.5 hover:bg-white/5 md:hidden" onClick={() => setSidebar(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <button className="hidden rounded-md p-1.5 hover:bg-white/5 md:inline" onClick={() => setSidebar((s) => !s)}>
            <Menu className="h-5 w-5" />
          </button>
          <select
            value={skillId}
            onChange={(e) => {
              const v = e.target.value;
              setSkillId(v);
              const s = skills.find((x) => x.id === v);
              if (s) setMode(s.mode);
              if (!v) setMode("general");
            }}
            className="rounded-full border border-gold-400/20 bg-ink-850 px-3 py-1.5 text-sm outline-none"
          >
            <option value="">General AI</option>
            {skills
              .filter((s) => s.enabled && s.status !== "disabled")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="max-w-[14rem] rounded-full border border-iris-400/25 bg-ink-850 px-3 py-1.5 text-sm outline-none"
            title="Model — routed through Aether, never called from the browser"
          >
            {models.length === 0 && <option value="">Default provider</option>}
            {models.map((m) => (
              <option
                key={`${m.provider}-${m.id}`}
                value={m.id}
                disabled={!m.available && !mockAi}
                title={m.note || "Routed through Aether — the browser never calls the provider"}
              >
                {m.label}
                {!m.available && !m.mock ? " (key not set)" : ""}
                {m.available && !m.mock && !m.wireModel ? " (no free model resolved)" : ""}
              </option>
            ))}
          </select>
          <div className="hidden text-xs text-mist-400 sm:block">
            {activeSkill ? `${activeSkill.name} v${activeSkill.version}` : "General"} · {mode}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {activeId && (
              <a
                className="text-xs text-mist-400 hover:text-gold-300"
                href={`/api/v1/conversations/${activeId}/export?format=md`}
              >
                Export
              </a>
            )}
            <button className="rounded-md p-1.5 hover:bg-white/5" onClick={() => setContextOpen((v) => !v)}>
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div ref={scroller} className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6">
              {displayMessages.length === 0 && !streamText && (
                <EmptyState
                  skill={activeSkill}
                  prompts={prompts}
                  onPrompt={applyPrompt}
                  onSkill={(s) => {
                    setSkillId(s.id);
                    setMode(s.mode);
                  }}
                  skills={skills}
                />
              )}
              <div className="mx-auto flex max-w-3xl flex-col gap-6">
                {displayMessages.map((m) => (
                  <article key={m.id} className="group">
                    <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-mist-400">
                      {m.role === "user" ? "You" : "Aether"}
                    </div>
                    {editingId === m.id ? (
                      <div>
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-ink-850 p-3 text-sm outline-none"
                          rows={4}
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            className="rounded-lg bg-iris-500 px-3 py-1 text-sm"
                            onClick={() => {
                              setEditingId(null);
                              send(editDraft, m.id);
                            }}
                          >
                            Save & regenerate
                          </button>
                          <button className="text-sm text-mist-400" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : m.role === "user" ? (
                      <div className="rounded-2xl border border-white/5 bg-ink-800 px-4 py-3 text-[15px] leading-relaxed">
                        {m.content}
                      </div>
                    ) : (
                      <Mark text={m.content} />
                    )}
                    <div className="mt-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <IconBtn onClick={() => copy(m.content)} title="Copy">
                        <Copy className="h-3.5 w-3.5" />
                      </IconBtn>
                      {m.role === "user" && (
                        <IconBtn
                          onClick={() => {
                            setEditingId(m.id);
                            setEditDraft(m.content);
                          }}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                      )}
                      {m.role === "assistant" && (
                        <>
                          <IconBtn onClick={() => speak(m.content)} title="Speak">
                            <Volume2 className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn onClick={regenerate} title="Regenerate">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </IconBtn>
                        </>
                      )}
                    </div>
                  </article>
                ))}
                {streamText && (
                  <article>
                    <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-gold-400">Aether</div>
                    <Mark text={streamText} />
                  </article>
                )}
                {streaming && !streamText && (
                  <div className="flex gap-1">
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gold-400" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gold-400" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gold-400" />
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-white/5 px-4 py-3">
              {mockAi && (
                <div className="mx-auto mb-2 max-w-3xl rounded-lg border border-gold-400/30 bg-gold-400/10 px-3 py-2 text-xs text-gold-300">
                  Development fallback is on (AI_MOCK_MODE). Replies are not from ChatGPT, Gemini, or Grok. Set a provider key and AI_MOCK_MODE=false for live models.
                </div>
              )}
              {!mockAi && modelProblem && (
                <div className="mx-auto mb-2 max-w-3xl rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200">
                  {modelProblem}
                </div>
              )}
              {error && <div className="mx-auto mb-2 max-w-3xl text-sm text-red-300">{error}</div>}
              {files.length > 0 && (
                <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-2">
                  {files.map((f) => (
                    <span key={f.id} className="rounded-full border border-white/10 px-2 py-0.5 text-xs">
                      {f.filename}
                      <button className="ml-1" onClick={() => setFiles((x) => x.filter((i) => i.id !== f.id))}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <form
                className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-gold-400/20 bg-ink-850 px-3 py-2 shadow-gold"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                    e.target.value = "";
                  }}
                />
                <button type="button" className="p-2 text-mist-400 hover:text-white" onClick={() => fileRef.current?.click()}>
                  <FileUp className="h-4 w-4" />
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder="Message Aether…"
                  className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2 text-[15px] outline-none"
                />
                <button
                  type="button"
                  onClick={toggleVoice}
                  className={cn("p-2", listening ? "text-gold-400" : "text-mist-400 hover:text-white")}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
                {streaming ? (
                  <button type="button" onClick={stop} className="rounded-xl bg-white/10 p-2">
                    <Square className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="rounded-xl bg-iris-500 p-2 text-white disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </form>
              <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-mist-500">
                Same AI Core as the public API. Skills cannot override platform security.
              </p>
            </div>
          </div>

          {contextOpen && (
            <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-white/5 bg-ink-900/50 p-4 lg:block">
              <div className="font-serif text-lg">Context</div>
              <dl className="mt-4 space-y-3 text-sm">
                <Row k="Mode" v={mode} />
                <Row k="Skill" v={activeSkill ? `${activeSkill.name} v${activeSkill.version}` : "None"} />
                <Row k="Custom instructions" v={visible?.customInstructions ? "Enabled" : "Off"} />
                <Row k="Tools" v={(activeSkill?.allowedTools || []).join(", ") || "Default"} />
                <Row k="Files" v={files.map((f) => f.filename).join(", ") || "None"} />
                <Row k="Provider" v={selectedModel?.label || String(visible?.model || "Aether Engine")} />
                <Row k="Wire model" v={selectedModel?.wireModel || (mockAi ? "aether-engine-v1" : "Resolving…")} />
                <Row
                  k="Model source"
                  v={
                    mockAi
                      ? "AI_MOCK_MODE (not a real model)"
                      : selectedModel?.wireSource === "env"
                        ? `${selectedModel?.wireSource} override`
                        : selectedModel?.wireSource === "discovery"
                          ? "picked from this key's model list"
                          : selectedModel?.note || "unresolved"
                  }
                />
              </dl>
              <p className="mt-6 text-xs leading-relaxed text-mist-400">
                Internal security prompts are never shown here. This panel is what you configured — not the platform’s private
                instructions.
              </p>
              <div className="mt-6">
                <div className="text-[11px] uppercase tracking-wider text-mist-400">Saved prompts</div>
                <div className="mt-2 space-y-1">
                  {prompts.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPrompt(p)}
                      className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

function Row({ k, v }: { k: string; v: unknown }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-mist-400">{k}</dt>
      <dd className="text-mist-100">{String(v)}</dd>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button title={title} onClick={onClick} className="rounded p-1 text-mist-400 hover:bg-white/5 hover:text-white">
      {children}
    </button>
  );
}

function EmptyState({
  skill,
  skills,
  prompts,
  onPrompt,
  onSkill,
}: {
  skill?: Skill;
  skills: Skill[];
  prompts: SavedPrompt[];
  onPrompt: (p: SavedPrompt) => void;
  onSkill: (s: Skill) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-2 py-16 text-center">
      <AetherMark className="mx-auto h-14 w-14" />
      <h1 className="mt-6 font-serif text-4xl tracking-tight">Where should we begin?</h1>
      <p className="mt-3 text-mist-400">
        {skill
          ? `${skill.name} is active — ${skill.description}`
          : "Aether is a full AI operating environment, not a single chatbot. Pick a skill or just type."}
      </p>
      <div className="mt-8 grid gap-2 sm:grid-cols-2">
        {skills.slice(0, 6).map((s) => (
          <button
            key={s.id}
            onClick={() => onSkill(s)}
            className="rounded-2xl border border-white/5 bg-ink-800/60 p-4 text-left hover:border-gold-400/30"
          >
            <div className="text-sm text-gold-300">{s.name}</div>
            <div className="mt-1 text-xs text-mist-400">{s.description}</div>
          </button>
        ))}
      </div>
      {prompts[0] && (
        <button onClick={() => onPrompt(prompts[0])} className="mt-6 text-sm text-iris-300">
          Or start from “{prompts[0].name}”
        </button>
      )}
    </div>
  );
}

type SpeechRecognition = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
};
type SpeechRecognitionEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
