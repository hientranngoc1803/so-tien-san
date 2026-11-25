import Link from "next/link";
import { getPlayers } from "@/lib/data";
import PlayerPicker from "@/components/PlayerPicker";
import ThemeMenu from "@/components/ThemeMenu";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ chon?: string }> }) {
  const sp = await searchParams;
  const players = (await getPlayers()).filter((p) => p.is_active);
  const nameCount = new Map<string, number>();
  players.forEach((p) => nameCount.set(p.display_name, (nameCount.get(p.display_name) ?? 0) + 1));
  const options = players.map((p) => ({
    code: p.short_code,
    label: (nameCount.get(p.display_name) ?? 0) > 1 ? `${p.display_name} · ${p.short_code}` : p.display_name,
  }));
  return (
    <main className="container" style={{ maxWidth: 480 }}>
      <div className="topbar">
        <span className="brand">🏸 Sổ tiền sân</span>
        <div className="hstack">
          <Link href="/admin" className="small">
            Quản lý
          </Link>
          <ThemeMenu />
        </div>
      </div>
      <div className="card">
        <h1>Bạn là ai?</h1>
        <p className="muted">Chọn tên để xem số tiền của bạn. Máy sẽ nhớ cho lần sau.</p>
        <PlayerPicker options={options} forcePick={sp.chon === "1"} />
      </div>
    </main>
  );
}
