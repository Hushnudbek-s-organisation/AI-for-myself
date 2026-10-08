import Link from "next/link";
import { AetherMark } from "@/components/workspace/icons";

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <AetherMark />
          <span className="font-serif text-xl">Aether</span>
        </div>
        <nav className="flex items-center gap-5 text-sm text-mist-400">
          <Link href="/docs" className="hover:text-white">
            API
          </Link>
          <Link href="/login" className="hover:text-white">
            Sign in
          </Link>
          <Link
            href="/chat"
            className="rounded-full border border-gold-400/30 bg-gold-400/10 px-4 py-1.5 text-gold-300"
          >
            Open workspace
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-24 pt-10">
        <p className="text-xs uppercase tracking-[0.28em] text-gold-400">Universal AI Platform</p>
        <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[1.05] tracking-tight md:text-7xl">
          Not a clone.
          <br />
          An AI operating environment.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-mist-400">
          Chat like a modern assistant. Then go further: versioned skills, prompt libraries, trusted tools, and a
          public API that shares the same core. Connect another website without rewriting the brain.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/chat" className="rounded-full bg-iris-500 px-5 py-2.5 text-sm font-medium text-white shadow-glow">
            Launch chat
          </Link>
          <Link href="/docs" className="rounded-full border border-white/10 px-5 py-2.5 text-sm hover:bg-white/5">
            Read the API
          </Link>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            {
              t: "Web chat",
              d: "History, search, streaming, edit & regenerate, files, and voice — through the application API, never a raw model SDK in the browser.",
            },
            {
              t: "Skills & prompts",
              d: "Install, author, version, disable, import/export. Skills cannot override platform security. Drafts from the builder stay inactive until you approve them.",
            },
            {
              t: "Public API",
              d: "POST /v1/chat with an API key. Same gateway, same modes, same tools. Projects isolate keys, origins, and enabled skills.",
            },
          ].map((c) => (
            <div key={c.t} className="rounded-3xl border border-white/5 bg-ink-800/40 p-6">
              <div className="font-serif text-2xl">{c.t}</div>
              <p className="mt-2 text-sm leading-relaxed text-mist-400">{c.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 overflow-hidden rounded-3xl border border-gold-400/15 bg-ink-900">
          <pre className="overflow-auto p-6 font-mono text-xs leading-relaxed text-iris-300">{`POST /v1/chat
Authorization: Bearer aether_sk_…
{
  "message": "Check my essay",
  "mode": "essay",
  "skill": "essay-coach"
}`}</pre>
        </div>
      </section>
    </div>
  );
}
