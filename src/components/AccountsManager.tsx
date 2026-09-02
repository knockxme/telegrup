"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiAccount } from "@/lib/types";

type WizardStep =
  | { step: "closed" }
  | { step: "form" }
  | { step: "code"; attemptId: string }
  | { step: "password"; attemptId: string }
  | { step: "error"; message: string };

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function AccountsManager({ initialAccounts }: { initialAccounts: ApiAccount[] }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [wizard, setWizard] = useState<WizardStep>({ step: "closed" });
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  function resetWizard() {
    setWizard({ step: "closed" });
    setLabel("");
    setPhone("");
    setCode("");
    setPassword("");
  }

  async function startLogin() {
    setBusy(true);
    try {
      const data = await postJson("/api/accounts/login/start", { label, phone });
      setWizard({ step: "code", attemptId: data.attemptId });
    } catch (err) {
      setWizard({ step: "error", message: err instanceof Error ? err.message : "Failed to start login" });
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(attemptId: string) {
    setBusy(true);
    try {
      const data = await postJson("/api/accounts/login/code", { attemptId, code });
      if (data.status === "awaiting_password") {
        setWizard({ step: "password", attemptId });
      } else if (data.status === "success") {
        router.refresh();
        resetWizard();
      } else {
        setWizard({ step: "error", message: data.error ?? "Login failed" });
      }
    } catch (err) {
      setWizard({ step: "error", message: err instanceof Error ? err.message : "Failed to submit code" });
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(attemptId: string) {
    setBusy(true);
    try {
      const data = await postJson("/api/accounts/login/password", { attemptId, password });
      if (data.status === "success") {
        router.refresh();
        resetWizard();
      } else {
        setWizard({ step: "error", message: data.error ?? "Login failed" });
      }
    } catch (err) {
      setWizard({ step: "error", message: err instanceof Error ? err.message : "Failed to submit password" });
    } finally {
      setBusy(false);
    }
  }

  async function togglePremium(account: ApiAccount) {
    const next = !account.isPremium;
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, isPremium: next } : a)));
    await fetch(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPremium: next }),
    });
  }

  async function removeAccount(account: ApiAccount) {
    if (!confirm(`Remove account "${account.label}"? Files already stored there stay in Telegram but this app loses access to them unless a matching account is re-added.`))
      return;
    await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
    setAccounts((prev) => prev.filter((a) => a.id !== account.id));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {accounts.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3"
          >
            <div>
              <p className="font-medium">
                {a.label} <span className="text-[var(--text-dim)]">· {a.phone}</span>
              </p>
              <p className="text-xs text-[var(--text-dim)]">
                {a.status === "active" ? "Active" : a.status === "needs_reauth" ? "⚠ Needs re-login" : "Disabled"}
                {!a.hasStorageChannel && " · ⚠ No storage channel"}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                <input type="checkbox" checked={a.isPremium} onChange={() => togglePremium(a)} />
                Premium (~4GB cap)
              </label>
              <button
                onClick={() => removeAccount(a)}
                className="text-sm text-[var(--danger)] hover:underline"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {accounts.length === 0 && <p className="text-[var(--text-dim)]">No accounts yet.</p>}
      </div>

      {wizard.step === "closed" && (
        <button
          onClick={() => setWizard({ step: "form" })}
          className="w-fit rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent-hover)]"
        >
          Add Telegram account
        </button>
      )}

      {wizard.step !== "closed" && (
        <div className="flex max-w-sm flex-col gap-3 rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          {wizard.step === "form" && (
            <>
              <Field label="Label" value={label} onChange={setLabel} placeholder="main" />
              <Field label="Phone (with country code)" value={phone} onChange={setPhone} placeholder="+8801234567890" />
              <div className="flex gap-2">
                <button
                  onClick={startLogin}
                  disabled={busy || !label || !phone}
                  className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {busy ? "Sending code…" : "Send code"}
                </button>
                <button onClick={resetWizard} className="text-sm text-[var(--text-dim)]">
                  Cancel
                </button>
              </div>
            </>
          )}

          {wizard.step === "code" && (
            <>
              <p className="text-sm text-[var(--text-dim)]">Enter the code Telegram sent to {phone}.</p>
              <Field label="Code" value={code} onChange={setCode} placeholder="12345" />
              <div className="flex gap-2">
                <button
                  onClick={() => submitCode(wizard.attemptId)}
                  disabled={busy || !code}
                  className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {busy ? "Verifying…" : "Verify"}
                </button>
                <button onClick={resetWizard} className="text-sm text-[var(--text-dim)]">
                  Cancel
                </button>
              </div>
            </>
          )}

          {wizard.step === "password" && (
            <>
              <p className="text-sm text-[var(--text-dim)]">This account has 2FA enabled — enter the cloud password.</p>
              <Field label="Password" type="password" value={password} onChange={setPassword} />
              <div className="flex gap-2">
                <button
                  onClick={() => submitPassword(wizard.attemptId)}
                  disabled={busy || !password}
                  className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {busy ? "Verifying…" : "Verify"}
                </button>
                <button onClick={resetWizard} className="text-sm text-[var(--text-dim)]">
                  Cancel
                </button>
              </div>
            </>
          )}

          {wizard.step === "error" && (
            <>
              <p className="text-sm text-[var(--danger)]">{wizard.message}</p>
              <button onClick={resetWizard} className="w-fit text-sm text-[var(--text-dim)]">
                Try again
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-[var(--text-dim)]">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
      />
    </div>
  );
}
