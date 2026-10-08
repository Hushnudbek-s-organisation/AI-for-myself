"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "@/components/AppFrame";

export default function SettingsPage() {
  const [about, setAbout] = useState("");
  const [style, setStyle] = useState("");
  const [language, setLanguage] = useState("");
  const [saved, setSaved] = useState(false);
  const [ai, setAi] = useState<{
    mock?: boolean;
    configured?: boolean;
    provider?: string;
    providers?: { openai: boolean; gemini: boolean; grok: boolean };
  } | null>(null);

  useEffect(() => {
    fetch("/api/v1/auth/guest", { method: "POST" }).then(() =>
      Promise.all([fetch("/api/v1/settings").then((r) => r.json()), fetch("/api/health").then((r) => r.json())]).then(
        ([d, h]) => {
          const c = d.customInstructions;
          if (c) {
            setAbout(c.about_user || "");
            setStyle(c.response_style || "");
            setLanguage(c.language || "");
          }
          setAi(h.ai || null);
        },
      ),
    );
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/v1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ about_user: about, response_style: style, language, enabled: 1 }),
    });
    setSaved(true);
  }

  const providers = [
    { id: "openai", label: "ChatGPT", ok: Boolean(ai?.providers?.openai) },
    { id: "gemini", label: "Gemini", ok: Boolean(ai?.providers?.gemini) },
    { id: "grok", label: "Grok (xAI)", ok: Boolean(ai?.providers?.grok) },
  ];

  return (
    <AppFrame title="Settings">
      <p className="text-mist-400">
        Custom instructions sit below security, mode, and skill rules. They never override platform policy. Keys stay on
        the server.
      </p>

      <h2 className="mt-8 font-serif text-2xl">Providers</h2>
      <p className="mt-1 text-sm text-mist-400">
        Status only — never paste API keys in the browser. Configure OPENAI_API_KEY, GEMINI_API_KEY, and XAI_API_KEY on
        the server.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {providers.map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/5 p-4">
            <div className="text-xs uppercase tracking-wider text-mist-400">{p.label}</div>
            <div className={`mt-1 text-sm ${p.ok ? "text-gold-300" : "text-mist-400"}`}>
              {ai?.mock ? "Mock mode (not live)" : p.ok ? "Configured" : "Key not set"}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={save} className="mt-8 max-w-xl space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-mist-400">What should Aether know about you?</label>
          <textarea className="mt-1 w-full rounded-xl border border-white/10 bg-ink-850 p-3" rows={4} value={about} onChange={(e) => setAbout(e.target.value)} />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-mist-400">How should it respond?</label>
          <textarea className="mt-1 w-full rounded-xl border border-white/10 bg-ink-850 p-3" rows={3} value={style} onChange={(e) => setStyle(e.target.value)} />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-mist-400">Preferred language</label>
          <input className="mt-1 w-full rounded-xl border border-white/10 bg-ink-850 px-3 py-2" value={language} onChange={(e) => setLanguage(e.target.value)} />
        </div>
        <button className="rounded-full bg-iris-500 px-4 py-2 text-sm">Save</button>
        {saved && <span className="ml-3 text-sm text-gold-300">Saved</span>}
      </form>
    </AppFrame>
  );
}
