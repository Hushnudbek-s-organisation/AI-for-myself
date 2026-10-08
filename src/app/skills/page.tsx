"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "@/components/AppFrame";
import type { ModeId, Skill, ToolId } from "@/core/types";

export default function SkillsPage() {
  const [list, setList] = useState<Skill[]>([]);
  const [open, setOpen] = useState(false);
  const [builder, setBuilder] = useState("");
  const [draft, setDraft] = useState<Skill | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    mode: "general" as ModeId,
    instructions: "",
    allowedTools: "text_analyze",
  });
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    await fetch("/api/v1/auth/guest", { method: "POST" });
    const r = await fetch("/api/v1/skills").then((x) => x.json());
    setList(r.skills || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const r = await fetch("/api/v1/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        allowedTools: form.allowedTools.split(",").map((s) => s.trim()) as ToolId[],
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error?.message || "Rejected");
      return;
    }
    setOpen(false);
    load();
  }

  async function toggle(s: Skill) {
    if (!s.ownerId) return;
    await fetch(`/api/v1/skills/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !s.enabled, newVersion: false }),
    });
    load();
  }

  async function runBuilder() {
    const r = await fetch("/api/v1/skills/builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: builder, saveDraft: true }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error?.message || "Builder failed");
      return;
    }
    setDraft(d.skill);
    load();
  }

  async function approve(s: Skill) {
    await fetch(`/api/v1/skills/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, newVersion: false }),
    });
    setDraft(null);
    load();
  }

  return (
    <AppFrame title="Skills">
      <p className="max-w-2xl text-mist-400">
        Skills teach Aether a job. They sit below platform security. Built-in skills are versioned; your skills can be
        drafted, approved, disabled, exported, and rolled back.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={() => setOpen(true)} className="rounded-full bg-iris-500 px-4 py-2 text-sm">
          Create skill
        </button>
        <label className="rounded-full border border-white/10 px-4 py-2 text-sm">
          Import JSON
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const json = JSON.parse(await f.text());
                const r = await fetch("/api/v1/skills/import", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(json),
                });
                const d = await r.json();
                if (!r.ok) {
                  setErr(d.error?.message || "Import failed");
                  return;
                }
                setDraft(d.skill);
                load();
              } catch {
                setErr("Invalid skill JSON");
              }
            }}
          />
        </label>
      </div>

      <div className="mt-8 rounded-2xl border border-white/5 p-4">
        <div className="font-serif text-xl">Skill builder</div>
        <p className="mt-1 text-sm text-mist-400">Describe a skill in natural language. Drafts stay inactive until you approve.</p>
        <textarea
          value={builder}
          onChange={(e) => setBuilder(e.target.value)}
          placeholder="Create a skill that reviews scholarship essays and checks whether the essay answers the prompt."
          className="mt-3 w-full rounded-xl border border-white/10 bg-ink-850 p-3 text-sm outline-none"
          rows={3}
        />
        <button onClick={runBuilder} className="mt-2 rounded-lg border border-gold-400/30 px-3 py-1.5 text-sm text-gold-300">
          Generate draft
        </button>
        {draft && (
          <div className="mt-4 rounded-xl bg-ink-800 p-4 text-sm">
            <div className="font-medium">{draft.name} · {draft.status}</div>
            <p className="mt-2 whitespace-pre-wrap text-mist-400">{draft.instructions}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => approve(draft)} className="rounded-lg bg-iris-500 px-3 py-1">
                Approve & activate
              </button>
              <button onClick={() => setDraft(null)} className="text-mist-400">
                Keep as draft
              </button>
            </div>
          </div>
        )}
      </div>

      {err && <p className="mt-4 text-sm text-red-300">{err}</p>}

      <div className="mt-8 grid gap-3">
        {list.map((s) => (
          <div key={s.id} className="rounded-2xl border border-white/5 bg-ink-800/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">
                  {s.name}{" "}
                  <span className="text-xs text-mist-400">
                    v{s.version} · {s.mode} · {s.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-mist-400">{s.description}</p>
              </div>
              <div className="flex gap-2 text-xs">
                {s.ownerId && (
                  <button onClick={() => toggle(s)} className="rounded-full border border-white/10 px-2 py-1">
                    {s.enabled ? "Disable" : "Enable"}
                  </button>
                )}
                <a className="rounded-full border border-white/10 px-2 py-1" href={`/api/v1/skills/${s.id}/export`}>
                  Export JSON
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={create} className="w-full max-w-lg rounded-2xl bg-ink-850 p-6">
            <div className="font-serif text-2xl">New skill</div>
            <input
              required
              placeholder="Name"
              className="mt-4 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              placeholder="Description"
              className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <select
              className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2"
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value as ModeId })}
            >
              {["general", "essay", "sop", "cv", "university", "scholarship", "visa", "ielts_speaking"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <textarea
              required
              placeholder="Instructions"
              rows={6}
              className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2"
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            />
            <input
              placeholder="Allowed tools, comma-separated"
              className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2"
              value={form.allowedTools}
              onChange={(e) => setForm({ ...form, allowedTools: e.target.value })}
            />
            <div className="mt-4 flex gap-2">
              <button className="rounded-lg bg-iris-500 px-4 py-2 text-sm">Save</button>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-mist-400">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </AppFrame>
  );
}
