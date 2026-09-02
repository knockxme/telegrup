import { randomUUID } from "node:crypto";
import { Api, TelegramClient } from "telegram";
import { newDetachedClient } from "@/lib/telegram/client";
import { encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";

export type LoginStatus = "awaiting_code" | "awaiting_password" | "success" | "error";

const MAX_ERROR_RETRIES = 5;
// An attempt someone starts and then abandons (never submits a code) — or one
// that ends in "error" — otherwise sits in the map forever: a real MTProto
// connection kept alive plus unbounded memory growth over long uptime. Sweep
// anything idle this long regardless of terminal status.
const ATTEMPT_IDLE_TTL_MS = 15 * 60 * 1000;

class LoginAttempt {
  readonly id: string;
  readonly client: TelegramClient;
  readonly label: string;
  readonly phone: string;
  status: LoginStatus = "awaiting_code";
  error: string | null = null;
  accountId: string | null = null;
  lastActivity = Date.now();

  private pendingCode: ((code: string) => void) | null = null;
  private pendingPassword: ((password: string) => void) | null = null;
  private waiters: Array<() => void> = [];
  private errorCount = 0;

  constructor(client: TelegramClient, label: string, phone: string) {
    this.id = randomUUID();
    this.client = client;
    this.label = label;
    this.phone = phone;
  }

  private setStatus(status: LoginStatus, error: string | null = null) {
    this.status = status;
    this.error = error;
    this.lastActivity = Date.now();
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  /** Resolves once .status differs from `from`, or immediately if it already does. */
  waitForChange(from: LoginStatus): Promise<void> {
    if (this.status !== from) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private waitForCode(): Promise<string> {
    this.setStatus("awaiting_code");
    return new Promise((resolve) => {
      this.pendingCode = resolve;
    });
  }

  private waitForPassword(): Promise<string> {
    this.setStatus("awaiting_password");
    return new Promise((resolve) => {
      this.pendingPassword = resolve;
    });
  }

  submitCode(code: string) {
    if (!this.pendingCode) throw new Error(`Attempt is not awaiting a code (status: ${this.status})`);
    this.lastActivity = Date.now();
    const resolve = this.pendingCode;
    this.pendingCode = null;
    resolve(code);
  }

  submitPassword(password: string) {
    if (!this.pendingPassword) throw new Error(`Attempt is not awaiting a password (status: ${this.status})`);
    this.lastActivity = Date.now();
    const resolve = this.pendingPassword;
    this.pendingPassword = null;
    resolve(password);
  }

  run() {
    this.client
      .start({
        phoneNumber: async () => this.phone,
        phoneCode: async () => this.waitForCode(),
        password: async () => this.waitForPassword(),
        onError: async (err: Error) => {
          this.errorCount += 1;
          const stop = this.errorCount >= MAX_ERROR_RETRIES;
          if (stop) this.setStatus("error", err.message);
          return stop;
        },
      })
      .then(async () => {
        const account = await finalizeAccount(this);
        this.accountId = account.id;
        this.setStatus("success");
      })
      .catch((err: unknown) => {
        this.setStatus("error", err instanceof Error ? err.message : String(err));
      });
  }
}

const attempts = new Map<string, LoginAttempt>();

function sweepIdleAttempts(): void {
  const now = Date.now();
  for (const [id, attempt] of attempts) {
    if (now - attempt.lastActivity > ATTEMPT_IDLE_TTL_MS) {
      attempts.delete(id);
      attempt.client.disconnect().catch(() => {});
    }
  }
}

if (process.env.NODE_ENV !== "test") {
  setInterval(sweepIdleAttempts, 5 * 60 * 1000).unref();
}

export async function startLogin(label: string, phone: string): Promise<LoginAttempt> {
  const client = newDetachedClient();
  await client.connect();
  const attempt = new LoginAttempt(client, label, phone);
  attempts.set(attempt.id, attempt);
  attempt.run();
  return attempt;
}

export function getAttempt(id: string): LoginAttempt | undefined {
  return attempts.get(id);
}

export function submitLoginCode(id: string, code: string): LoginAttempt {
  const attempt = mustGetAttempt(id);
  attempt.submitCode(code);
  return attempt;
}

export function submitLoginPassword(id: string, password: string): LoginAttempt {
  const attempt = mustGetAttempt(id);
  attempt.submitPassword(password);
  return attempt;
}

function mustGetAttempt(id: string): LoginAttempt {
  const attempt = attempts.get(id);
  if (!attempt) throw new Error("Unknown or expired login attempt");
  return attempt;
}

async function finalizeAccount(attempt: LoginAttempt) {
  const sessionString = String(attempt.client.session.save());

  let storageChannelId: string | null = null;
  try {
    const result = await attempt.client.invoke(
      new Api.channels.CreateChannel({
        title: `telegrup-storage-${attempt.label}`,
        about: "File storage backend for telegrup. Do not delete.",
        megagroup: false,
      })
    );
    // CreateChannel returns an Updates object; pull the created Channel out of it.
    // We store "id:accessHash" so later sends can build an InputPeerChannel directly,
    // without depending on GramJS's entity cache (StringSession doesn't persist it).
    const chats = (result as { chats?: Array<{ id?: unknown; accessHash?: unknown }> }).chats ?? [];
    const channel = chats[0];
    if (channel?.id !== undefined && channel?.accessHash !== undefined) {
      storageChannelId = `${channel.id}:${channel.accessHash}`;
    }
  } catch (err) {
    // Session is valid even if channel setup failed — keep the account, let the
    // Accounts UI surface that storage still needs to be created.
    console.error(`Failed to create storage channel for account ${attempt.label}:`, err);
  } finally {
    // This throwaway client is done — future access to the account goes through
    // getConnectedClient's own pooled connection, decrypted fresh from the saved
    // session string. Leaving this one connected would waste a connection forever.
    attempts.delete(attempt.id);
    attempt.client.disconnect().catch(() => {});
  }

  const account = await db.telegramAccount.create({
    data: {
      label: attempt.label,
      phone: attempt.phone,
      sessionStringEnc: encryptSecret(sessionString),
      storageChannelId,
      status: "active",
    },
  });

  return account;
}
