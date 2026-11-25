import Link from "next/link";
import { formatDate, vnd } from "@/lib/money";
import { guestLabel } from "@/lib/session-input";
import type { ItemRow, ParticipantRow, Player, SessionRow } from "@/lib/types";

export default function SessionSummary({
  session,
  participants,
  items,
  players,
  linkPlayers = true,
}: {
  session: SessionRow;
  participants: ParticipantRow[];
  items: ItemRow[];
  players: Player[];
  linkPlayers?: boolean;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string | null) => (id ? byId.get(id)?.display_name ?? "?" : "Chủ sân");
  const males = participants.filter((p) => p.gender === "M").length;
  const females = participants.length - males;
  const shared = items.filter((i) => i.kind === "shared");
  const groups = items.filter((i) => i.kind === "group");
  const personal = items.filter((i) => i.kind === "personal");
  const byKey = new Map(participants.map((p) => [p.pkey, p]));
  const partName = (p: ParticipantRow) =>
    p.player_id ? name(p.player_id) : guestLabel(name(p.host_player_id), p.guest_label);
  const ownerName = session.court_owner_id ? name(session.court_owner_id) : "Chủ sân";

  return (
    <>
      <div className="card">
        <h1>
          Buổi {formatDate(session.session_date)}
          {session.title ? ` · ${session.title}` : ""}
        </h1>
        <div className="grid-stats">
          <div className="stat">
            <div className="muted small">Người chơi</div>
            <div className="value">
              {males} nam · {females} nữ
            </div>
          </div>
          {session.male_share !== null && (
            <div className="stat">
              <div className="muted small">Suất nam</div>
              <div className="value">{vnd(session.male_share)}</div>
            </div>
          )}
          {session.female_share !== null && (
            <div className="stat">
              <div className="muted small">
                Suất nữ{session.female_mode === "discount" && session.female_value > 0 ? ` (giảm ${vnd(session.female_value)})` : ""}
              </div>
              <div className="value">{vnd(session.female_share)}</div>
            </div>
          )}
          <div className="stat">
            <div className="muted small">Chênh lệch của {ownerName}</div>
            <div className="value">{vnd(session.rounding_diff)}</div>
          </div>
        </div>
        {session.explanation.length > 0 && (
          <div className="alert warn" style={{ marginTop: 12 }}>
            {session.explanation.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Chi phí chung</h2>
        {shared.map((i) => (
          <div key={i.id} className="hstack line-item">
            <span>{i.label}</span>
            {i.paid_by_player_id && i.paid_by_player_id !== session.court_owner_id && (
              <span className="muted small">({name(i.paid_by_player_id)} trả)</span>
            )}
            <span className="spacer" />
            <span className="num">{vnd(i.amount)}</span>
          </div>
        ))}
        <div className="hstack line-item">
          <strong>Tổng</strong>
          <span className="spacer" />
          <strong className="num">{vnd(session.shared_total)}</strong>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="card">
          <h2>Khoản chia nhóm</h2>
          {groups.map((g) => (
            <div key={g.id} className="line-item" style={{ display: "block" }}>
              <div className="hstack">
                <strong>{g.label}</strong>
                <span className="spacer" />
                <span className="num">{vnd(g.amount)}</span>
              </div>
              <div className="muted small">
                {g.member_keys.length} người × {vnd(g.per_person ?? 0)}
                {g.paid_by_player_id && g.paid_by_player_id !== session.court_owner_id ? ` · ${name(g.paid_by_player_id)} trả` : ""}
                {" · "}
                {g.member_keys
                  .map((k) => byKey.get(k))
                  .filter(Boolean)
                  .map((p) => partName(p!))
                  .join(", ")}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Từng người</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Người</th>
                <th>Nhóm</th>
                <th className="num">Suất</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => {
                const pl = p.player_id ? byId.get(p.player_id) : null;
                return (
                  <tr key={p.id}>
                    <td>
                      {pl && linkPlayers ? <Link href={`/so/${pl.short_code}`}>{pl.display_name}</Link> : partName(p)}
                    </td>
                    <td>{p.gender === "M" ? "Nam" : "Nữ"}</td>
                    <td className="num">{vnd(p.share_amount ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {personal.length > 0 && (
          <>
            <h3>Khoản cá nhân</h3>
            {personal.map((i) => (
              <div key={i.id} className="hstack line-item">
                <span>{name(i.target_player_id)}</span>
                <span className="muted">{i.label}</span>
                <span className="spacer" />
                <span className="num">{vnd(i.amount)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
