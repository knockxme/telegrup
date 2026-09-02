import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";

function getApiCredentials() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!apiId || !apiHash) {
    throw new Error("TELEGRAM_API_ID / TELEGRAM_API_HASH are not set");
  }
  return { apiId, apiHash };
}

export function newDetachedClient(sessionString = ""): TelegramClient {
  const { apiId, apiHash } = getApiCredentials();
  return new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
    // GramJS's own default is 1000ms between retries, applied to every
    // reconnect attempt — including the per-DC "exported sender" it opens
    // internally for actual file downloads (a different connection than the
    // main session one). On a network path with intermittent packet loss,
    // each of those retries silently adds a full second per attempt with no
    // visible error — several retries can turn one range request into
    // multiple seconds of dead time before any bytes move. Retrying sooner
    // doesn't fix an unstable path, but it shrinks the cost of each retry.
    retryDelay: 300,
  });
}

// Connected clients are expensive to set up (MTProto handshake), so we keep one
// live connection per Telegram account and reuse it across requests.
const pool = new Map<string, TelegramClient>();
// Without this, two concurrent requests for the same cold account would both
// pass the pool-miss check above, each open its own MTProto connection, and
// the second pool.set() would silently overwrite the first — leaking a
// connection nobody ever disconnects. Concurrent callers share one attempt.
const connecting = new Map<string, Promise<TelegramClient>>();

export async function getConnectedClient(accountId: string): Promise<TelegramClient> {
  const existing = pool.get(accountId);
  if (existing?.connected) return existing;

  const inFlight = connecting.get(accountId);
  if (inFlight) return inFlight;

  const task = (async () => {
    const account = await db.telegramAccount.findUniqueOrThrow({ where: { id: accountId } });
    const sessionString = decryptSecret(account.sessionStringEnc);
    const client = newDetachedClient(sessionString);
    await client.connect();
    pool.set(accountId, client);
    return client;
  })();
  connecting.set(accountId, task);

  try {
    return await task;
  } finally {
    connecting.delete(accountId);
  }
}

export async function disconnectAccountClient(accountId: string): Promise<void> {
  const client = pool.get(accountId);
  if (!client) return;
  pool.delete(accountId);
  await client.disconnect();
}
