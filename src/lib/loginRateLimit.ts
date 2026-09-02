// Simple in-memory sliding-window limiter on failed logins, keyed by client IP.
// Not a hard security boundary (relies on the deployment's reverse proxy setting
// X-Forwarded-For honestly — if the app is exposed raw with no proxy in front,
// that header is attacker-controlled and this degrades to a shared bucket), but
// it's cheap and stops naive automated password guessing against the single
// admin account, which otherwise has no lockout at all.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const failedAttempts = new Map<string, number[]>();

export function clientIp(req: Request): string {
  // The header is a comma-separated hop chain; each proxy APPENDS the address
  // it saw the request come from. The leftmost entry is whatever the original
  // client claimed to be — fully attacker-controlled — while the rightmost is
  // the one *our* reverse proxy appended, which is the only hop we can trust.
  // Reading leftmost let an attacker rotate a random value per request and
  // get a fresh rate-limit bucket every time, i.e. no limit at all.
  const forwarded = req.headers.get("x-forwarded-for");
  const hops = forwarded?.split(",").map((h) => h.trim()).filter(Boolean);
  return hops?.[hops.length - 1] || "unknown";
}

export function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (failedAttempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  failedAttempts.set(ip, recent);
  return recent.length >= MAX_ATTEMPTS;
}

export function recordFailedLogin(ip: string): void {
  const recent = failedAttempts.get(ip) ?? [];
  recent.push(Date.now());
  failedAttempts.set(ip, recent);
}

export function clearFailedLogins(ip: string): void {
  failedAttempts.delete(ip);
}

if (process.env.NODE_ENV !== "test") {
  setInterval(
    () => {
      const now = Date.now();
      for (const [ip, timestamps] of failedAttempts) {
        const recent = timestamps.filter((t) => now - t < WINDOW_MS);
        if (recent.length === 0) failedAttempts.delete(ip);
        else failedAttempts.set(ip, recent);
      }
    },
    5 * 60 * 1000
  ).unref();
}
