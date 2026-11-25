import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayers, getSession, getSessionDetail } from "@/lib/data";
import SessionSummary from "@/components/SessionSummary";
import ThemeMenu from "@/components/ThemeMenu";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session || session.status !== "closed") notFound();
  const [detail, players] = await Promise.all([getSessionDetail(id), getPlayers()]);
  return (
    <main className="container" style={{ maxWidth: 720 }}>
      <div className="topbar">
        <Link href="/" className="brand">
          🏸 Sổ tiền sân
        </Link>
        <ThemeMenu />
      </div>
      <SessionSummary session={session} participants={detail.participants} items={detail.items} players={players} />
    </main>
  );
}
