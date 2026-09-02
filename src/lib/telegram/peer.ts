import bigInt from "big-integer";
import { Api } from "telegram";

/** Parses the "id:accessHash" string stored on TelegramAccount.storageChannelId. */
export function parseStorageChannel(storageChannelId: string): Api.InputPeerChannel {
  const [id, accessHash] = storageChannelId.split(":");
  if (!id || !accessHash) throw new Error(`Malformed storageChannelId: ${storageChannelId}`);
  return new Api.InputPeerChannel({
    channelId: bigInt(id),
    accessHash: bigInt(accessHash),
  });
}
