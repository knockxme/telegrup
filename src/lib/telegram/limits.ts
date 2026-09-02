const MB = 1024 * 1024;

// Telegram's advertised caps are 4000MB (Premium) / 2000MB (free) per single file.
// We stay a bit under those so protocol/container overhead never tips a part over.
export const PREMIUM_PART_LIMIT_BYTES = 3800 * MB;
export const FREE_PART_LIMIT_BYTES = 1900 * MB;

export function maxPartSizeBytes(isPremium: boolean): number {
  return isPremium ? PREMIUM_PART_LIMIT_BYTES : FREE_PART_LIMIT_BYTES;
}

export interface PartPlan {
  index: number;
  byteOffsetStart: number;
  size: number;
}

/** Splits a file of `totalSize` bytes into parts no larger than `maxPartSize`. */
export function planParts(totalSize: number, maxPartSize: number): PartPlan[] {
  if (totalSize <= 0) throw new Error("totalSize must be positive");
  const parts: PartPlan[] = [];
  let offset = 0;
  let index = 0;
  while (offset < totalSize) {
    const size = Math.min(maxPartSize, totalSize - offset);
    parts.push({ index, byteOffsetStart: offset, size });
    offset += size;
    index += 1;
  }
  return parts;
}
