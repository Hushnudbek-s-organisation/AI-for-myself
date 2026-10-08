"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "@/components/AppFrame";
import Link from "next/link";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

export default function DeveloperPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [usage, setUsage] = useState<{
    totals?: { requests: number; input_tokens: number; output_tokens: number; avg_latency: number };
    bySkill?: Array<{ skill_id: string; c: number }>;
  } | null>(null);
  const [name, setName] = useState("Website key");

  async function boot() {
    await fetch("/api/v1/auth/guest", { method: "POST" });
    const [k, p, u] = await Promise.all([
      fetch("/api/v1/keys").then((r) => r.json()),
      fetch("/api/v1/projects").then((r) => r.json()),
      fetch("/api/v1/usage").then((r) => r.json()),
    ]);
    setKeys(k.keys || []);
    setProjects(p.projects || []);
    setUsage(u);
  }
  useEffect(() => {
    boot();
  }, []);

  async function createKey() {
    const r = await fetch("/api/v1/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, projectName: "Default project", scopes: ["chat", "stream", "skills"] }),
    }).then((x) => x.json());
    setPlaintext(r.key?.plaintext);
    boot();
  }

  return (
    <AppFrame title="Developer">
      <p className="max-w-2xl text-mist-400">
        Create a project, mint an API key, pick skills later. Other websites talk to the same AI Core as this chat.
      </p>
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link href="/developer/playground" className="rounded-full border border-white/10 px-4 py-2">
          Playground
        </Link>
        <Link href="/docs" className="rounded-full border border-white/10 px-4 py-2">
          API documentation
        </Link>
      </div>

      {usage?.totals && (
        <div className="mt-8 grid gap-3 sm:grid-cols-4">
          {[
            ["Requests", usage.totals.requests],
            ["Input tokens", usage.totals.input_tokens],
            ["Output tokens", usage.totals.output_tokens],
            ["Avg latency ms", Math.round(usage.totals.avg_latency || 0)],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-2xl border border-white/5 p-4">
              <div className="text-xs uppercase tracking-wider text-mist-400">{k}</div>
              <div className="mt-1 font-serif text-3xl">{v}</div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-10 font-serif text-2xl">Projects</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {projects.map((p) => (
          <li key={p.id} className="rounded-xl border border-white/5 px-3 py-2">
            {p.name} <span className="text-mist-400">{p.id}</span>
          </li>
        ))}
        {projects.length === 0 && <li className="text-mist-400">No projects yet — creating a key will make one.</li>}
      </ul>

      <h2 className="mt-10 font-serif text-2xl">API keys</h2>
      <div className="mt-3 flex gap-2">
        <input
          className="rounded-lg border border-white/10 bg-ink-850 px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button onClick={createKey} className="rounded-lg bg-iris-500 px-4 py-2 text-sm">
          Create key
        </button>
      </div>
      {plaintext && (
        <div className="mt-4 rounded-xl border border-gold-400/30 bg-gold-400/10 p-3 text-sm">
          Copy now — this is the only time the full key is shown:
          <pre className="mt-2 overflow-auto font-mono text-xs">{plaintext}</pre>
        </div>
      )}
      <div className="mt-4 space-y-2">
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between rounded-xl border border-white/5 px-3 py-2 text-sm">
            <div>
              <div>
                {k.name} · <span className="font-mono text-xs">{k.prefix}</span>
              </div>
              <div className="text-xs text-mist-400">
                {k.scopes.join(", ")} · {k.revokedAt ? "revoked" : "active"}
              </div>
            </div>
            {!k.revokedAt && (
              <button
                className="text-xs text-red-300"
                onClick={async () => {
                  await fetch(`/api/v1/keys/${k.id}`, { method: "DELETE" });
                  boot();
                }}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </AppFrame>
  );
}
