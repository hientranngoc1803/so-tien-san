export type TxnKind = "payment" | "refund" | "opening" | "transfer";

export interface LedgerPlayer {
  id: string;
  shortCode: string;
  displayName: string;
}

export interface LedgerSession {
  id: string;
  date: string;
  title: string | null;
  courtOwnerId: string | null;
  seq: string;
}

export interface LedgerParticipant {
  sessionId: string;
  key: string;
  playerId: string | null;
  hostPlayerId: string | null;
  gender: "M" | "F";
  guestLabel: string | null;
  shareAmount: number;
}

export interface LedgerItem {
  id: string;
  sessionId: string;
  kind: "shared" | "group" | "personal";
  label: string;
  amount: number;
  paidBy: string | null;
  memberKeys: string[];
  targetPlayerId: string | null;
  perPerson: number | null;
}

export interface LedgerTxn {
  id: string;
  playerId: string;
  kind: TxnKind;
  amount: number;
  counterpartyId: string | null;
  date: string;
  seq: string;
  publicNote: string | null;
  label?: string | null;
}

export interface Part {
  label: string;
  amount: number;
}

export interface Entry {
  id: string;
  date: string;
  seq: string;
  amount: number;
  label: string;
  sessionId?: string;
  txnId?: string;
}

export interface Allocation {
  creditId: string;
  debitId: string;
  amount: number;
}

export type LineStatus = "paid" | "partial" | "unpaid" | "owner";

export interface SessionLine {
  sessionId: string;
  date: string;
  title: string | null;
  amount: number;
  parts: Part[];
  covered: number;
  remaining: number;
  status: LineStatus;
  coveredBy: { creditId: string; label: string; amount: number }[];
}

export interface TxnLine {
  txn: LedgerTxn;
  effect: number;
  role: "self" | "counterparty";
  label: string;
  allocations: { debitId: string; label: string; date: string; amount: number }[];
  balanceAfter: number;
}

export interface OpenDebit {
  id: string;
  date: string;
  label: string;
  amount: number;
  remaining: number;
  sessionId?: string;
}


export interface Book {
  playerId: string;
  balance: number;
  totalCredit: number;
  totalDebit: number;
  totalPaid: number;
  openDebits: OpenDebit[];
  sessionLines: SessionLine[];
  txnLines: TxnLine[];
  credits: Entry[];
  debits: Entry[];
}

export function participantBilledTo(p: LedgerParticipant): string | null {
  return p.playerId ?? p.hostPlayerId;
}

export function participantLabel(p: LedgerParticipant, names: Map<string, string>): string {
  const g = p.gender === "M" ? "nam" : "nữ";
  if (p.playerId) return `Suất ${g}`;
  const host = p.hostPlayerId ? names.get(p.hostPlayerId) ?? "?" : "?";
  return `Khách của ${host}${p.guestLabel ? ` (${p.guestLabel})` : ""} – suất ${g}`;
}

export function sessionCharges(
  participants: LedgerParticipant[],
  items: LedgerItem[],
  names: Map<string, string>,
): Map<string, Part[]> {
  const out = new Map<string, Part[]>();
  const push = (pid: string | null, part: Part) => {
    if (!pid) return;
    if (!out.has(pid)) out.set(pid, []);
    out.get(pid)!.push(part);
  };
  const byKey = new Map(participants.map((p) => [p.key, p]));
  for (const p of participants) {
    push(participantBilledTo(p), { label: participantLabel(p, names), amount: p.shareAmount });
  }
  for (const item of items) {
    if (item.kind === "group" && item.perPerson !== null) {
      const members = item.memberKeys.map((k) => byKey.get(k)).filter(Boolean) as LedgerParticipant[];
      for (const m of members) {
        push(participantBilledTo(m), { label: `${item.label} (chia ${members.length})`, amount: item.perPerson });
      }
    } else if (item.kind === "personal") {
      push(item.targetPlayerId, { label: item.label, amount: item.amount });
    }
  }
  return out;
}

function cmp(a: { date: string; seq: string }, b: { date: string; seq: string }): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0;
}

export function allocateFifo(credits: Entry[], debits: Entry[]): Allocation[] {
  const cs = [...credits].sort(cmp).map((c) => ({ ...c, left: c.amount }));
  const ds = [...debits].sort(cmp).map((d) => ({ ...d, left: d.amount }));
  const out: Allocation[] = [];
  let i = 0;
  let j = 0;
  while (i < cs.length && j < ds.length) {
    const take = Math.min(cs[i].left, ds[j].left);
    if (take > 0) out.push({ creditId: cs[i].id, debitId: ds[j].id, amount: take });
    cs[i].left -= take;
    ds[j].left -= take;
    if (cs[i].left === 0) i++;
    if (ds[j].left === 0) j++;
  }
  return out;
}

export interface LedgerData {
  players: LedgerPlayer[];
  sessions: LedgerSession[];
  participants: LedgerParticipant[];
  items: LedgerItem[];
  txns: LedgerTxn[];
  currentCourtOwnerId: string | null;
}

const KIND_LABEL: Record<TxnKind, string> = {
  payment: "Nộp tiền",
  refund: "Hoàn tiền",
  opening: "Số dư đầu kỳ",
  transfer: "Trả hộ",
};

export function txnKindLabel(t: LedgerTxn): string {
  if (t.label) return t.label;
  return KIND_LABEL[t.kind];
}

export function buildBooks(data: LedgerData): Map<string, Book> {
  const names = new Map(data.players.map((p) => [p.id, p.displayName]));
  const credits = new Map<string, Entry[]>();
  const debits = new Map<string, Entry[]>();
  const sessionLines = new Map<string, SessionLine[]>();
  const txnRefs = new Map<string, { txn: LedgerTxn; role: "self" | "counterparty"; entryId: string; effect: number; label: string }[]>();
  const add = (m: Map<string, Entry[]>, pid: string, e: Entry) => {
    if (!m.has(pid)) m.set(pid, []);
    m.get(pid)!.push(e);
  };
  const addTxnRef = (pid: string, ref: { txn: LedgerTxn; role: "self" | "counterparty"; entryId: string; effect: number; label: string }) => {
    if (!txnRefs.has(pid)) txnRefs.set(pid, []);
    txnRefs.get(pid)!.push(ref);
  };

  const partsBySession = new Map<string, LedgerParticipant[]>();
  for (const p of data.participants) {
    if (!partsBySession.has(p.sessionId)) partsBySession.set(p.sessionId, []);
    partsBySession.get(p.sessionId)!.push(p);
  }
  const itemsBySession = new Map<string, LedgerItem[]>();
  for (const it of data.items) {
    if (!itemsBySession.has(it.sessionId)) itemsBySession.set(it.sessionId, []);
    itemsBySession.get(it.sessionId)!.push(it);
  }

  for (const s of data.sessions) {
    const charges = sessionCharges(partsBySession.get(s.id) ?? [], itemsBySession.get(s.id) ?? [], names);
    for (const [pid, parts] of charges) {
      const amount = parts.reduce((sum, p) => sum + p.amount, 0);
      const entryId = `s:${s.id}:${pid}`;
      const isOwner = s.courtOwnerId !== null && pid === s.courtOwnerId;
      const line: SessionLine = {
        sessionId: s.id,
        date: s.date,
        title: s.title,
        amount,
        parts,
        covered: 0,
        remaining: 0,
        status: "unpaid",
        coveredBy: [],
      };
      if (isOwner) {
        line.status = "owner";
        line.covered = amount;
      } else if (amount > 0) {
        add(debits, pid, { id: entryId, date: s.date, seq: s.seq, amount, label: s.title ? `Buổi ${s.title}` : "Buổi chơi", sessionId: s.id });
      } else if (amount < 0) {
        add(credits, pid, { id: entryId, date: s.date, seq: s.seq, amount: -amount, label: `Giảm trừ buổi ${s.title ?? ""}`.trim(), sessionId: s.id });
        line.status = "paid";
      } else {
        line.status = "paid";
      }
      if (!sessionLines.has(pid)) sessionLines.set(pid, []);
      sessionLines.get(pid)!.push(line);
    }
    for (const it of itemsBySession.get(s.id) ?? []) {
      if (it.kind === "personal" || !it.paidBy || it.paidBy === s.courtOwnerId) continue;
      add(credits, it.paidBy, {
        id: `c:${it.id}`,
        date: s.date,
        seq: s.seq,
        amount: it.amount,
        label: `Chi hộ: ${it.label}`,
        sessionId: s.id,
      });
    }
  }

  for (const t of data.txns) {
    const cp = t.counterpartyId && t.counterpartyId !== data.currentCourtOwnerId ? t.counterpartyId : null;
    const selfId = `t:${t.id}`;
    const cpId = `t:${t.id}:cp`;
    const base = { date: t.date, seq: t.seq, txnId: t.id };
    if (t.kind === "payment") {
      add(credits, t.playerId, { ...base, id: selfId, amount: t.amount, label: txnKindLabel(t) });
      addTxnRef(t.playerId, { txn: t, role: "self", entryId: selfId, effect: t.amount, label: txnKindLabel(t) });
      if (cp) {
        const label = `Giữ hộ tiền của ${names.get(t.playerId) ?? "?"}`;
        add(debits, cp, { ...base, id: cpId, amount: t.amount, label });
        addTxnRef(cp, { txn: t, role: "counterparty", entryId: cpId, effect: -t.amount, label });
      }
    } else if (t.kind === "refund") {
      add(debits, t.playerId, { ...base, id: selfId, amount: t.amount, label: txnKindLabel(t) });
      addTxnRef(t.playerId, { txn: t, role: "self", entryId: selfId, effect: -t.amount, label: txnKindLabel(t) });
      if (cp) {
        const label = `Chuyển trả cho ${names.get(t.playerId) ?? "?"}`;
        add(credits, cp, { ...base, id: cpId, amount: t.amount, label });
        addTxnRef(cp, { txn: t, role: "counterparty", entryId: cpId, effect: t.amount, label });
      }
    } else if (t.kind === "transfer") {
      const payer = t.counterpartyId;
      const inLabel = `${names.get(payer ?? "") ?? "?"} trả hộ`;
      add(credits, t.playerId, { ...base, id: selfId, amount: t.amount, label: inLabel });
      addTxnRef(t.playerId, { txn: t, role: "self", entryId: selfId, effect: t.amount, label: inLabel });
      if (payer) {
        const outLabel = `Trả hộ ${names.get(t.playerId) ?? "?"}`;
        add(debits, payer, { ...base, id: cpId, amount: t.amount, label: outLabel });
        addTxnRef(payer, { txn: t, role: "counterparty", entryId: cpId, effect: -t.amount, label: outLabel });
      }
    } else if (t.amount > 0) {
      add(credits, t.playerId, { ...base, id: selfId, amount: t.amount, label: txnKindLabel(t) });
      addTxnRef(t.playerId, { txn: t, role: "self", entryId: selfId, effect: t.amount, label: txnKindLabel(t) });
    } else if (t.amount < 0) {
      add(debits, t.playerId, { ...base, id: selfId, amount: -t.amount, label: txnKindLabel(t) });
      addTxnRef(t.playerId, { txn: t, role: "self", entryId: selfId, effect: t.amount, label: txnKindLabel(t) });
    }
  }

  const books = new Map<string, Book>();
  for (const pl of data.players) {
    const pid = pl.id;
    const cs = credits.get(pid) ?? [];
    const ds = debits.get(pid) ?? [];
    const allocs = allocateFifo(cs, ds);
    const creditById = new Map(cs.map((c) => [c.id, c]));
    const debitById = new Map(ds.map((d) => [d.id, d]));
    const coveredByDebit = new Map<string, number>();
    for (const a of allocs) coveredByDebit.set(a.debitId, (coveredByDebit.get(a.debitId) ?? 0) + a.amount);

    const lines = (sessionLines.get(pid) ?? []).map((line) => {
      if (line.status === "owner" || line.amount <= 0) return { ...line, remaining: 0 };
      const id = `s:${line.sessionId}:${pid}`;
      const covered = coveredByDebit.get(id) ?? 0;
      const remaining = line.amount - covered;
      const status: LineStatus = remaining === 0 ? "paid" : covered > 0 ? "partial" : "unpaid";
      const coveredBy = allocs
        .filter((a) => a.debitId === id)
        .map((a) => ({ creditId: a.creditId, label: creditById.get(a.creditId)?.label ?? "", amount: a.amount }));
      return { ...line, covered, remaining, status, coveredBy };
    });
    lines.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const events = [
      ...cs.map((c) => ({ ...c, delta: c.amount })),
      ...ds.map((d) => ({ ...d, delta: -d.amount })),
    ].sort(cmp);
    const runningAfter = new Map<string, number>();
    let run = 0;
    for (const e of events) {
      run += e.delta;
      runningAfter.set(e.id, run);
    }

    const txnLines: TxnLine[] = (txnRefs.get(pid) ?? []).map((ref) => ({
      txn: ref.txn,
      effect: ref.effect,
      role: ref.role,
      label: ref.label,
      allocations: allocs
        .filter((a) => a.creditId === ref.entryId)
        .map((a) => {
          const d = debitById.get(a.debitId);
          return { debitId: a.debitId, label: d?.label ?? "", date: d?.date ?? "", amount: a.amount };
        }),
      balanceAfter: runningAfter.get(ref.entryId) ?? 0,
    }));
    txnLines.sort((a, b) => -cmp(a.txn, b.txn));

    const totalCredit = cs.reduce((s, c) => s + c.amount, 0);
    const totalDebit = ds.reduce((s, d) => s + d.amount, 0);
    const openDebits: OpenDebit[] = [...ds]
      .sort(cmp)
      .map((d) => ({
        id: d.id,
        date: d.date,
        label: d.label,
        amount: d.amount,
        remaining: d.amount - (coveredByDebit.get(d.id) ?? 0),
        sessionId: d.sessionId,
      }))
      .filter((d) => d.remaining > 0);
    const totalPaid = data.txns
      .filter((t) => t.playerId === pid && t.kind === "payment")
      .reduce((s, t) => s + t.amount, 0);
    books.set(pid, {
      playerId: pid,
      balance: totalCredit - totalDebit,
      totalCredit,
      totalDebit,
      totalPaid,
      openDebits,
      sessionLines: lines,
      txnLines,
      credits: cs,
      debits: ds,
    });
  }
  return books;
}

export function statusLabel(s: LineStatus): string {
  switch (s) {
    case "paid":
      return "Đã đủ";
    case "partial":
      return "Còn một phần";
    case "unpaid":
      return "Chưa thanh toán";
    case "owner":
      return "Chủ sân";
  }
}

export function headline(balance: number): { label: string; tone: "credit" | "debt" | "even" } {
  if (balance > 0) return { label: "Còn dư quỹ", tone: "credit" };
  if (balance < 0) return { label: "Còn phải trả", tone: "debt" };
  return { label: "Đã cân đối", tone: "even" };
}
