"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "@/components/AppFrame";
import type { SavedPrompt } from "@/core/types";

export default function PromptsPage() {
  const [list, setList] = useState<SavedPrompt[]>([]);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState<SavedPrompt | null>(null);

  async function load() {
    await fetch("/api/v1/auth/guest", { method: "POST" });
    const r = await fetch("/api/v1/prompts").then((x) => x.json());
    setList(r.prompts || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      await fetch(`/api/v1/prompts/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content }),
      });
      setEditing(null);
    } else {
      await fetch("/api/v1/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content, kind: "task" }),
      });
    }
    setName("");
    setContent("");
    load();
  }

  return (
    <AppFrame title="Prompt library">
      <p className="max-w-2xl text-mist-400">
        Reusable task prompts — not platform security prompts. System instructions are never listed here for ordinary
        users.
      </p>
      <form onSubmit={save} className="mt-6 space-y-2 rounded-2xl border border-white/5 p-4">
        <input
          required
          placeholder="Name (e.g. My Essay Reviewer)"
          className="w-full rounded-lg border border-white/10 bg-ink-850 px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          required
          rows={5}
          placeholder="Prompt content"
          className="w-full rounded-lg border border-white/10 bg-ink-850 px-3 py-2"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button className="rounded-lg bg-iris-500 px-4 py-2 text-sm">{editing ? "Save new version" : "Create"}</button>
      </form>
      <div className="mt-6 grid gap-3">
        {list.map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/5 p-4">
            <div className="flex justify-between gap-2">
              <div>
                <div className="font-medium">
                  {p.name} <span className="text-xs text-mist-400">v{p.version} · {p.kind}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-mist-400">{p.content}</p>
              </div>
              {p.ownerId && (
                <div className="flex h-fit gap-2 text-xs">
                  <button
                    onClick={() => {
                      setEditing(p);
                      setName(p.name);
                      setContent(p.content);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      await fetch(`/api/v1/prompts/${p.id}`, { method: "DELETE" });
                      load();
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </AppFrame>
  );
}
