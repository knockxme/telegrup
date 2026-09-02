// Runs once when the server boots, before it accepts any requests. Every var
// checked here was previously validated lazily (first call throws) — that let
// a misconfigured deploy report "Up" and pass no healthcheck while every
// request touching auth/crypto/Telegram 500s. Failing here instead puts the
// problem in the boot log where it's actually seen.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const problems: string[] = [];

  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is not set");

  if (!process.env.AUTH_SECRET) problems.push("AUTH_SECRET is not set");

  const sessionKey = process.env.SESSION_ENCRYPTION_KEY;
  if (!sessionKey) {
    problems.push("SESSION_ENCRYPTION_KEY is not set");
  } else if (Buffer.from(sessionKey, "base64").length !== 32) {
    problems.push("SESSION_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes — generate with `openssl rand -base64 32`");
  }

  if (!process.env.TELEGRAM_API_ID) {
    problems.push("TELEGRAM_API_ID is not set");
  } else if (!Number.isFinite(Number(process.env.TELEGRAM_API_ID))) {
    problems.push("TELEGRAM_API_ID must be numeric");
  }

  if (!process.env.TELEGRAM_API_HASH) problems.push("TELEGRAM_API_HASH is not set");

  if (problems.length > 0) {
    throw new Error(`Invalid configuration — refusing to start:\n  - ${problems.join("\n  - ")}`);
  }
}
