"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "@/components/AppFrame";

interface RuleRow {
  id: string;
  layer: string;
  name: string;
  content?: string;
  enabled: boolean;
  version: number;
}

export default function RulesPage() {
  const [list, setList] = useState<RuleRow[]>([]);
  const [name, setName] = useState("Workspace tone");
  const [content, setContent] = useState("Prefer concise, sourced answers. Never invent credentials.");
  const [error, setError] = useState<string | null>(null);

  async function boot() {
    await fetch("/api/v1/auth/guest", { method: "POST" });
    const d = await fetch("/api/v1/rules").then((r) => r.json());
    setList(d.rules || []);
  }

  useEffect(() => {
    boot();
  }, []);

  async function create() {
    setError(null);
    const r = await fetch("/api/v1/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layer: "developer", name, content }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error?.message || "Could not save (admin only)");
      return;
    }
    boot();
  }

  return (
    <AppFrame title="Rules">
      <p className="max-w-2xl text-mist-400">
        Developer and output rules sit below platform security. They cannot override privacy or jailbreak policy.
        Platform / privacy / system layers are code, not this table.
      </p>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      <div className="mt-6 max-w-xl space-y-3">
        <input
          className="w-full rounded-lg border border-white/10 bg-ink-850 px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="w-full rounded-xl border border-white/10 bg-ink-850 p-3 text-sm"
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button onClick={create} className="rounded-full bg-iris-500 px-4 py-2 text-sm">
          Add developer rule
        </button>
      </div>
      <ul className="mt-8 space-y-2">
        {list.map((r) => (
          <li key={r.id} className="rounded-xl border border-white/5 p-3 text-sm">
            <div className="text-mist-50">
              {r.name} <span className="text-mist-400">· {r.layer} v{r.version}</span>
              {!r.enabled && <span className="ml-2 text-xs text-mist-400">disabled</span>}
            </div>
            {r.content && <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-mist-400">{r.content}</pre>}
          </li>
        ))}
        {list.length === 0 && <li className="text-mist-400">No extra rules yet.</li>}
      </ul>
    </AppFrame>
  );
}
