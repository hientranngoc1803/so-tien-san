import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPlayers, getSession, getSessionDetail, getSessionInternalNote, getTemplates } from "@/lib/data";
import { db } from "@/lib/supabase";
import { formatShortDate } from "@/lib/money";
import { shortK } from "@/lib/session-input";
import type { SessionPayload } from "@/lib/types";
import SessionEditor from "@/components/SessionEditor";
import SessionSummary from "@/components/SessionSummary";
import CopyBox from "@/components/CopyBox";
import { deleteDraftAction, reopenSessionAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function AdminSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loi?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await getSession(id);
  if (!session) notFound();
  const [detail, players, internalNote] = await Promise.all([getSessionDetail(id), getPlayers(), getSessionInternalNote(id)]);
  const owner = players.find((p) => p.is_court_owner) ?? null;

  if (session.status === "draft") {
    const [templates, { data: link }] = await Promise.all([
      getTemplates(),
      db().from("sessions").select("template_id").eq("id", id).maybeSingle(),
    ]);
    const initial: SessionPayload & { id: string } = {
      id: session.id,
      date: session.session_date,
      title: session.title ?? "",
      internalNote: internalNote ?? "",
      femaleMode: session.female_mode,
      femaleValue: Number(session.female_value),
      overrideMale: session.override_male === null ? null : Number(session.override_male),
      overrideFemale: session.override_female === null ? null : Number(session.override_female),
      overrideReason: session.override_reason ?? "",
      participants: detail.participants.map((p) => ({
        pkey: p.pkey,
        playerId: p.player_id,
        hostPlayerId: p.host_player_id,
        guestLabel: p.guest_label ?? "",
        gender: p.gender,
      })),
      items: detail.items.map((i) => ({
        key: `i${i.id}`,
        kind: i.kind,
        label: i.label,
        amount: Number(i.amount),
        paidBy: i.paid_by_player_id,
        memberKeys: i.member_keys ?? [],
        targetPlayerId: i.target_player_id,
      })),
    };
    return (
      <>
        <div className="hstack" style={{ marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>Buổi nháp</h1>
          <span className="badge draft">Chưa ảnh hưởng số dư</span>
          <span className="spacer" />
          <form action={deleteDraftAction}>
            <input type="hidden" name="id" value={session.id} />
            <button type="submit" className="danger">
              Xoá nháp
            </button>
          </form>
        </div>
        {!owner && (
          <div className="alert warn">
            Chưa gắn hồ sơ chủ sân. Vào <Link href="/admin/nguoi-choi">Người chơi</Link> để gắn trước khi chốt.
          </div>
        )}
        <SessionEditor
          initial={initial}
          players={players}
          courtOwnerId={owner?.id ?? null}
          templates={templates.map((t) => ({ id: t.id, name: t.name, weekday: t.weekday }))}
          templateId={(link?.template_id as string | null) ?? null}
        />
      </>
    );
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";
  const rates = [
    session.male_share !== null ? `${shortK(Number(session.male_share))}/nam` : null,
    session.female_share !== null ? `${shortK(Number(session.female_share))}/nữ` : null,
  ].filter(Boolean);
  const summary = [
    `🏸 Buổi ${formatShortDate(session.session_date)}${session.title ? ` · ${session.title}` : ""}`,
    rates.join(" · "),
    `Xem sổ của bạn: ${origin}/`,
    `Chi tiết buổi: ${origin}/buoi/${session.id}`,
  ].join("\n");

  return (
    <>
      <div className="hstack" style={{ marginBottom: 12 }}>
        <span className="badge paid">Đã chốt</span>
        <Link href={`/buoi/${session.id}`}>Trang công khai →</Link>
      </div>
      <SessionSummary session={session} participants={detail.participants} items={detail.items} players={players} />
      <div className="card">
        <h2>Tin nhắn cho nhóm Messenger</h2>
        <CopyBox text={summary} />
      </div>
      {internalNote && (
        <div className="card">
          <h2>Ghi chú nội bộ</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{internalNote}</p>
        </div>
      )}
      <div className="card">
        <h2>Sửa buổi đã chốt</h2>
        <p className="muted small">Mở lại sẽ đưa buổi về nháp (tạm thời không tính vào số dư). Sửa xong bấm chốt lại.</p>
        {sp.loi === "ly-do" && <div className="alert error">Cần nhập lý do.</div>}
        <form action={reopenSessionAction} className="row">
          <input type="hidden" name="id" value={session.id} />
          <label>
            Lý do
            <input type="text" name="reason" required placeholder="VD: nhập sai tiền cầu" />
          </label>
          <button type="submit" style={{ flex: "0 0 auto" }}>
            Mở lại để sửa
          </button>
        </form>
      </div>
    </>
  );
}
