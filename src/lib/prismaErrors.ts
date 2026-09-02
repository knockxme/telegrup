import { Prisma } from "@/generated/prisma/client";

/** True for Prisma's P2025 ("record not found") — thrown by update()/delete()
 * instead of returning null. Without checking for it, deleting/updating a row
 * that's already gone (a routine race — a double-click, two admin tabs) surfaces
 * as an uncaught 500 instead of a clean 404. */
export function isNotFoundError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}
