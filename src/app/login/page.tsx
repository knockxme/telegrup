"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Login failed");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-2xl font-semibold tracking-tight text-[var(--text)]">Dropcast</span>
        <p className="text-sm text-[var(--text-dim)]">Private media storage and streaming.</p>
      </div>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-xl shadow-black/20"
      >
        <div className="mb-3 flex flex-col gap-1">
          <label className="text-sm text-[var(--text-dim)]">Username</label>
          <input
            className="rounded border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--accent)]"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>
        <div className="mb-4 flex flex-col gap-1">
          <label className="text-sm text-[var(--text-dim)]">Password</label>
          <input
            type="password"
            className="rounded border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--accent)]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-[var(--accent)] py-2 font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
