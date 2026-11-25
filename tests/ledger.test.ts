import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBooks, LedgerData, LedgerParticipant, LedgerSession, LedgerTxn } from "../src/lib/ledger";

const players = [
  { id: "HAI", shortCode: "P001", displayName: "Hải" },
  { id: "NGOC", shortCode: "P002", displayName: "Ngọc" },
  { id: "HIEN", shortCode: "P003", displayName: "Hiển" },
  { id: "TA", shortCode: "P004", displayName: "Tạ Anh" },
];

function s(id: string, date: string): LedgerSession {
  return { id, date, title: id, courtOwnerId: "TA", seq: id };
}

function part(sessionId: string, playerId: string, amount: number): LedgerParticipant {
  return { sessionId, key: playerId, playerId, hostPlayerId: null, gender: "M", guestLabel: null, shareAmount: amount };
}

function txn(id: string, playerId: string, kind: LedgerTxn["kind"], amount: number, date: string, counterpartyId: string | null = null): LedgerTxn {
  return { id, playerId, kind, amount, counterpartyId, date, seq: id, publicNote: null };
}

function data(partial: Partial<LedgerData>): LedgerData {
  return { players, sessions: [], participants: [], items: [], txns: [], currentCourtOwnerId: "TA", ...partial };
}

test("nop truoc 300k, hai buoi 60k va 70k -> con du 170k", () => {
  const books = buildBooks(
    data({
      sessions: [s("b1", "2026-12-01"), s("b2", "2026-12-03")],
      participants: [part("b1", "HAI", 60000), part("b2", "HAI", 70000)],
      txns: [txn("t1", "HAI", "payment", 300000, "2026-11-30")],
    }),
  );
  const hai = books.get("HAI")!;
  assert.equal(hai.balance, 170000);
  assert.ok(hai.sessionLines.every((l) => l.status === "paid"));
  assert.equal(hai.txnLines[0].balanceAfter, 300000);
  assert.equal(hai.txnLines[0].allocations.length, 2);
});

test("no 60k va 70k, tra gop 100k -> buoi dau du, buoi sau con 30k", () => {
  const books = buildBooks(
    data({
      sessions: [s("b1", "2026-12-01"), s("b2", "2026-12-03")],
      participants: [part("b1", "NGOC", 60000), part("b2", "NGOC", 70000)],
      txns: [txn("t1", "NGOC", "payment", 100000, "2026-12-04")],
    }),
  );
  const ngoc = books.get("NGOC")!;
  assert.equal(ngoc.balance, -30000);
  const b1 = ngoc.sessionLines.find((l) => l.sessionId === "b1")!;
  const b2 = ngoc.sessionLines.find((l) => l.sessionId === "b2")!;
  assert.equal(b1.status, "paid");
  assert.equal(b2.status, "partial");
  assert.equal(b2.remaining, 30000);
});

test("chu san tu thanh toan phan cua minh", () => {
  const books = buildBooks(
    data({
      sessions: [s("b1", "2026-12-01")],
      participants: [part("b1", "TA", 60000), part("b1", "HAI", 60000)],
    }),
  );
  assert.equal(books.get("TA")!.balance, 0);
  assert.equal(books.get("TA")!.sessionLines[0].status, "owner");
  assert.equal(books.get("HAI")!.balance, -60000);
});

test("Ngoc chuyen Hien giu ho 100k, Hien chuyen tra 30k", () => {
  const books = buildBooks(
    data({
      txns: [
        txn("t1", "NGOC", "payment", 100000, "2026-12-01", "HIEN"),
        txn("t2", "NGOC", "refund", 30000, "2026-12-02", "HIEN"),
      ],
    }),
  );
  assert.equal(books.get("NGOC")!.balance, 70000);
  assert.equal(books.get("HIEN")!.balance, -70000);
});

test("chi ho: Hien tra 1.620k, chia 7 nguoi 231k", () => {
  const ids = ["HIEN", "HAI", "NGOC", "TA", "X1", "X2", "X3"];
  const extra = ["X1", "X2", "X3"].map((id) => ({ id, shortCode: id, displayName: id }));
  const books = buildBooks({
    players: [...players, ...extra],
    sessions: [s("b1", "2026-12-01")],
    participants: ids.map((id) => part("b1", id, 0)),
    items: [
      { id: "i1", sessionId: "b1", kind: "group", label: "Ăn gà", amount: 1620000, paidBy: "HIEN", memberKeys: ids, targetPlayerId: null, perPerson: 231000 },
    ],
    txns: [],
    currentCourtOwnerId: "TA",
  });
  assert.equal(books.get("HIEN")!.balance, 1620000 - 231000);
  assert.equal(books.get("HAI")!.balance, -231000);
});

test("so du dau ky am duoc tru truoc", () => {
  const books = buildBooks(
    data({
      sessions: [s("b1", "2026-12-01")],
      participants: [part("b1", "HAI", 60000)],
      txns: [txn("o1", "HAI", "opening", -50000, "2026-11-25"), txn("t1", "HAI", "payment", 80000, "2026-12-02")],
    }),
  );
  const hai = books.get("HAI")!;
  assert.equal(hai.balance, -30000);
  assert.equal(hai.sessionLines[0].status, "partial");
  assert.equal(hai.sessionLines[0].remaining, 30000);
});

test("khoan con no giu dung ngay goc, cu nhat truoc", () => {
  const t = (id: string, amount: number, date: string, label: string): LedgerTxn => ({
    id, playerId: "HAI", kind: "opening", amount, counterpartyId: null, date, seq: id, publicNote: null, label,
  });
  const books = buildBooks(
    data({
      sessions: [s("b1", "2026-12-01")],
      participants: [part("b1", "HAI", 60000)],
      txns: [
        t("o1", -172000, "2026-11-22", "Nợ cũ 22/11"),
        t("o2", -290000, "2026-11-24", "Nợ cũ 24/11"),
        txn("p1", "HAI", "payment", 200000, "2026-12-02"),
        { ...txn("p2", "HAI", "payment", 50000, "2026-11-20"), label: "Nộp quỹ trước" },
      ],
    }),
  );
  const hai = books.get("HAI")!;
  assert.equal(hai.balance, -272000);
  assert.deepEqual(
    hai.openDebits.map((d) => [d.date, d.remaining]),
    [["2026-11-24", 212000], ["2026-12-01", 60000]],
  );
  assert.equal(hai.fundDeposits, 50000);
});
