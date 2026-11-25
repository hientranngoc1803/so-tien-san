import "server-only";
import { db, fetchAll } from "./supabase";
import { buildBooks, Book, LedgerData } from "./ledger";
import type { ItemRow, ParticipantRow, Player, SessionRow, TxnRow } from "./types";

const PLAYER_COLS = "id, short_code, display_name, gender, is_active, is_court_owner";
const SESSION_COLS =
  "id, session_date, title, status, female_mode, female_value, override_male, override_female, override_reason, male_share, female_share, is_manual_override, shared_total, total_due, rounding_diff, explanation, court_owner_id, closed_at, created_at";
const TXN_COLS =
  "id, client_request_id, player_id, kind, label, amount, counterparty_player_id, txn_date, bank_ref, group_ref, public_note, created_by, created_at";

export async function getPlayers(): Promise<Player[]> {
  const { data, error } = await db().from("players").select(PLAYER_COLS).order("display_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Player[];
}

export async function getClosedSessions(): Promise<SessionRow[]> {
  return fetchAll<SessionRow>((from, to) =>
    db()
      .from("sessions")
      .select(SESSION_COLS)
      .eq("status", "closed")
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to),
  );
}

export async function getSession(id: string): Promise<SessionRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db().from("sessions").select(SESSION_COLS).eq("id", id).maybeSingle();
  return (data as SessionRow) ?? null;
}

export async function getSessionInternalNote(id: string): Promise<string | null> {
  const { data } = await db().from("sessions").select("internal_note").eq("id", id).maybeSingle();
  return (data?.internal_note as string | null) ?? null;
}

export async function getSessionDetail(id: string) {
  const [{ data: parts, error: e1 }, { data: items, error: e2 }] = await Promise.all([
    db().from("session_participants").select("*").eq("session_id", id).order("id"),
    db().from("session_items").select("*").eq("session_id", id).order("position").order("id"),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  return { participants: (parts ?? []) as ParticipantRow[], items: (items ?? []) as ItemRow[] };
}

export async function getActiveTxns(): Promise<TxnRow[]> {
  return fetchAll<TxnRow>((from, to) =>
    db().from("transactions").select(TXN_COLS).is("voided_at", null).order("id").range(from, to),
  );
}

function seqOf(createdAt: string, id: string | number): string {
  return `${createdAt}|${String(id).padStart(12, "0")}`;
}

export interface LedgerBundle {
  players: Player[];
  sessions: SessionRow[];
  books: Map<string, Book>;
  txns: TxnRow[];
  courtOwner: Player | null;
  lastUpdated: string | null;
}

export async function loadLedger(): Promise<LedgerBundle> {
  const [players, sessions, txns] = await Promise.all([getPlayers(), getClosedSessions(), getActiveTxns()]);
  const ids = sessions.map((s) => s.id);
  const participants: ParticipantRow[] = [];
  const items: ItemRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [p, it] = await Promise.all([
      fetchAll<ParticipantRow>((from, to) =>
        db().from("session_participants").select("*").in("session_id", chunk).order("id").range(from, to),
      ),
      fetchAll<ItemRow>((from, to) =>
        db().from("session_items").select("*").in("session_id", chunk).order("id").range(from, to),
      ),
    ]);
    participants.push(...p);
    items.push(...it);
  }
  const courtOwner = players.find((p) => p.is_court_owner) ?? null;
  const data: LedgerData = {
    players: players.map((p) => ({ id: p.id, shortCode: p.short_code, displayName: p.display_name })),
    sessions: sessions.map((s) => ({
      id: s.id,
      date: s.session_date,
      title: s.title,
      courtOwnerId: s.court_owner_id,
      seq: seqOf(s.created_at, s.id),
    })),
    participants: participants.map((p) => ({
      sessionId: p.session_id,
      key: p.pkey,
      playerId: p.player_id,
      hostPlayerId: p.host_player_id,
      gender: p.gender,
      guestLabel: p.guest_label,
      shareAmount: Number(p.share_amount ?? 0),
    })),
    items: items.map((i) => ({
      id: String(i.id),
      sessionId: i.session_id,
      kind: i.kind,
      label: i.label,
      amount: Number(i.amount),
      paidBy: i.paid_by_player_id,
      memberKeys: i.member_keys ?? [],
      targetPlayerId: i.target_player_id,
      perPerson: i.per_person === null ? null : Number(i.per_person),
    })),
    txns: txns.map((t) => ({
      id: String(t.id),
      playerId: t.player_id,
      kind: t.kind,
      amount: Number(t.amount),
      counterpartyId: t.counterparty_player_id,
      date: t.txn_date,
      seq: seqOf(t.created_at, t.id),
      publicNote: t.public_note,
      label: t.label,
    })),
    currentCourtOwnerId: courtOwner?.id ?? null,
  };
  const stamps = [...sessions.map((s) => s.closed_at ?? ""), ...txns.map((t) => t.created_at)].filter(Boolean).sort();
  return {
    players,
    sessions,
    books: buildBooks(data),
    txns,
    courtOwner,
    lastUpdated: stamps.length ? stamps[stamps.length - 1] : null,
  };
}
