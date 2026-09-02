import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="font-semibold tracking-tight text-[var(--text)]">
            telegrup
          </Link>
          <Link href="/" className="text-[var(--text-dim)] hover:text-[var(--text)]">
            Files
          </Link>
          <Link href="/accounts" className="text-[var(--text-dim)] hover:text-[var(--text)]">
            Accounts
          </Link>
          <Link href="/keys" className="text-[var(--text-dim)] hover:text-[var(--text)]">
            API Keys
          </Link>
          <Link href="/docs" className="text-[var(--text-dim)] hover:text-[var(--text)]">
            API Docs
          </Link>
        </nav>
        <LogoutButton />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
