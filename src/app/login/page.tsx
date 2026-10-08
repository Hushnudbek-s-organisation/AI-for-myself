"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AetherMark } from "@/components/workspace/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setDemo(Boolean(d.demoAccounts)))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErr(d.error?.message || "Failed");
      return;
    }
    router.push("/chat");
  }

  async function guest() {
    await fetch("/api/v1/auth/guest", { method: "POST" });
    router.push("/chat");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-white/5 bg-ink-800/50 p-8">
        <AetherMark className="h-10 w-10" />
        <h1 className="mt-4 font-serif text-3xl">Sign in</h1>
        {demo && (
          <p className="mt-1 text-sm text-mist-400">Dev demo: demo@aether.local / demo (disabled in production)</p>
        )}
        <label className="mt-6 block text-xs uppercase tracking-wider text-mist-400">Email</label>
        <input
          className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2 outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
        <label className="mt-4 block text-xs uppercase tracking-wider text-mist-400">Password</label>
        <input
          type="password"
          className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2 outline-none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
        <button disabled={busy} className="mt-6 w-full rounded-xl bg-iris-500 py-2.5 text-sm">
          Continue
        </button>
        <button type="button" onClick={guest} className="mt-2 w-full py-2 text-sm text-mist-400">
          Continue as guest
        </button>
        <p className="mt-4 text-center text-sm text-mist-400">
          No account?{" "}
          <Link href="/register" className="text-gold-300">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}
