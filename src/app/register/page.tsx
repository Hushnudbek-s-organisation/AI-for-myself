"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AetherMark } from "@/components/workspace/icons";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error?.message || "Failed");
      return;
    }
    router.push("/chat");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-white/5 bg-ink-800/50 p-8">
        <AetherMark className="h-10 w-10" />
        <h1 className="mt-4 font-serif text-3xl">Create workspace</h1>
        <input
          required
          placeholder="Name"
          className="mt-6 w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2 outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          required
          type="email"
          placeholder="Email"
          className="mt-3 w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2 outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          required
          minLength={6}
          type="password"
          placeholder="Password"
          className="mt-3 w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2 outline-none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
        <button className="mt-6 w-full rounded-xl bg-iris-500 py-2.5 text-sm">Register</button>
      </form>
    </div>
  );
}
