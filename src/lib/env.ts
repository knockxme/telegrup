/** Parses a positive-integer env var, falling back to `fallback` if unset,
 * non-numeric, or <= 0 — plain `Number(process.env.X ?? default)` silently
 * produces NaN on a typo'd value, which then poisons comparisons downstream
 * (e.g. `total <= NaN` is always false, so a cache-eviction guard never
 * short-circuits and ends up evicting everything on every touch). */
export function safeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
