"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "@/components/AppFrame";
import { Mark } from "@/components/Mark";
import type { ModeId, Skill } from "@/core/types";
import { listModes } from "@/core/modes";

type PublicModel = { id: string; label: string; provider: string; available: boolean };

export default function PlaygroundPage() {
  const modes = listModes();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [mode, setMode] = useState<ModeId>("general");
  const [skill, setSkill] = useState("");
  const [model, setModel] = useState("");
  const [message, setMessage] = useState("Check my essay for grammar and structure.");
  const [out, setOut] = useState("");
  const [meta, setMeta] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/v1/auth/guest", { method: "POST" }).then(() =>
      Promise.all([fetch("/api/v1/skills").then((r) => r.json()), fetch("/api/v1/models").then((r) => r.json())]).then(
        ([s, m]) => {
          setSkills(s.skills || []);
          setModels(m.models || []);
          setModel(m.defaultModel || "");
        },
      ),
    );
  }, []);

  async function run() {
    setBusy(true);
    setOut("");
    const started = Date.now();
    const r = await fetch("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, mode, skill: skill || undefined, model: model || undefined }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setOut(d.error?.message || "Error");
      return;
    }
    setOut(d.message);
    setMeta(
      `skill=${d.skill || "none"} v${d.skillVersion || "-"} · model=${d.usage?.model} · provider=${d.provider || d.usage?.provider || "-"} · ${d.usage?.latencyMs ?? Date.now() - started}ms · tokens ${d.usage?.inputTokens}/${d.usage?.outputTokens}`,
    );
  }

  return (
    <AppFrame title="Playground">
      <p className="text-mist-400">
        Test mode, skill, and provider (ChatGPT / Gemini / Grok) against the same AI Core. The browser never talks to
        those APIs. Secrets are never shown.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <select className="rounded-lg border border-white/10 bg-ink-850 px-3 py-2" value={mode} onChange={(e) => setMode(e.target.value as ModeId)}>
          {modes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select className="rounded-lg border border-white/10 bg-ink-850 px-3 py-2" value={skill} onChange={(e) => setSkill(e.target.value)}>
          <option value="">No skill</option>
          {skills.map((s) => (
            <option key={s.id} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <select className="rounded-lg border border-white/10 bg-ink-850 px-3 py-2" value={model} onChange={(e) => setModel(e.target.value)}>
          {models.map((m) => (
            <option key={`${m.provider}-${m.id}`} value={m.id} disabled={!m.available}>
              {m.label}
              {!m.available ? " (key not set)" : ""}
            </option>
          ))}
        </select>
      </div>
      <textarea className="mt-3 w-full rounded-xl border border-white/10 bg-ink-850 p-3" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
      <button disabled={busy} onClick={run} className="mt-3 rounded-full bg-iris-500 px-4 py-2 text-sm">
        {busy ? "Running…" : "Run"}
      </button>
      {meta && <p className="mt-3 font-mono text-xs text-mist-400">{meta}</p>}
      {out && (
        <div className="mt-4 rounded-2xl border border-white/5 p-4">
          <Mark text={out} />
        </div>
      )}
    </AppFrame>
  );
}
