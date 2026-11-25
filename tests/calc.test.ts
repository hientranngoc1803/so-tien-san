import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSession, CalcInput, CalcParticipant, FemaleMode } from "../src/lib/calc";

function people(nam: number, nu: number): CalcParticipant[] {
  const out: CalcParticipant[] = [];
  for (let i = 0; i < nam; i++) out.push({ key: `m${i}`, gender: "M", billedTo: `M${i}`, label: "Suất nam" });
  for (let i = 0; i < nu; i++) out.push({ key: `f${i}`, gender: "F", billedTo: `F${i}`, label: "Suất nữ" });
  return out;
}

function session(total: number, nam: number, nu: number, mode: FemaleMode = "discount", value = 0): CalcInput {
  return {
    participants: people(nam, nu),
    items: [{ key: "san", kind: "shared", label: "Tiền sân", amount: total, paidBy: null }],
    femaleMode: mode,
    femaleValue: value,
    courtOwnerId: "OWNER",
  };
}

test("357k, 6 nam -> 60k, +3k", () => {
  const r = computeSession(session(357000, 6, 0));
  assert.equal(r.maleShare, 60000);
  assert.equal(r.roundingDiff, 3000);
});

test("450k, 8 nam -> 56k, -2k", () => {
  const r = computeSession(session(450000, 8, 0));
  assert.equal(r.maleShare, 56000);
  assert.equal(r.roundingDiff, -2000);
});

test("452k, 8 nam -> 57k, +4k, khong chan", () => {
  const r = computeSession(session(452000, 8, 0));
  assert.equal(r.ok, true);
  assert.equal(r.maleShare, 57000);
  assert.equal(r.roundingDiff, 4000);
});

test("462k, 6 nam 2 nu, giam 8k -> 60k/52k, +2k", () => {
  const r = computeSession(session(462000, 6, 2, "discount", 8000));
  assert.equal(r.maleShare, 60000);
  assert.equal(r.femaleShare, 52000);
  assert.equal(r.totalDue, 464000);
  assert.equal(r.roundingDiff, 2000);
});

test("668k, 15 nam -> 45k, +7k", () => {
  const r = computeSession(session(668000, 15, 0));
  assert.equal(r.maleShare, 45000);
  assert.equal(r.roundingDiff, 7000);
});

test("che do 2: 780k, 13 nam 1 nu 45k -> 57k, +6k", () => {
  const r = computeSession(session(780000, 13, 1, "fixed", 45000));
  assert.equal(r.maleShare, 57000);
  assert.equal(r.femaleShare, 45000);
  assert.equal(r.roundingDiff, 6000);
});

test("che do 2: 910k, 12 nam 2 nu 55k -> 67k, +4k", () => {
  const r = computeSession(session(910000, 12, 2, "fixed", 55000));
  assert.equal(r.maleShare, 67000);
  assert.equal(r.roundingDiff, 4000);
});

test("chi co nu: 160k, 3 nu -> 54k, +2k", () => {
  const r = computeSession(session(160000, 0, 3, "discount", 8000));
  assert.equal(r.maleShare, null);
  assert.equal(r.femaleShare, 54000);
  assert.equal(r.roundingDiff, 2000);
});

test("chia nhom 1.620k do Hien tra, 7 nguoi -> 231k, -3k, Hien duoc ghi co", () => {
  const input = session(0, 7, 0);
  input.items = [
    { key: "an", kind: "group", label: "Ăn gà", amount: 1620000, paidBy: "M0", memberKeys: ["m0", "m1", "m2", "m3", "m4", "m5", "m6"] },
  ];
  const r = computeSession(input);
  assert.equal(r.groups[0].perPerson, 231000);
  assert.equal(r.roundingDiff, -3000);
  assert.equal(r.creditsByPlayer["M0"].total, 1620000);
  assert.equal(r.chargesByPlayer["M0"].total, 231000);
});

test("khach cua Van x3 -> Van chiu 4 suat", () => {
  const input = session(500000, 0, 0);
  input.participants = [
    { key: "van", gender: "M", billedTo: "VAN", label: "Suất nam" },
    { key: "g1", gender: "M", billedTo: "VAN", label: "Khách" },
    { key: "g2", gender: "M", billedTo: "VAN", label: "Khách" },
    { key: "g3", gender: "M", billedTo: "VAN", label: "Khách" },
    { key: "a", gender: "M", billedTo: "A", label: "Suất nam" },
  ];
  const r = computeSession(input);
  assert.equal(r.maleShare, 100000);
  assert.equal(r.chargesByPlayer["VAN"].total, 400000);
  assert.equal(r.chargesByPlayer["VAN"].parts.length, 4);
});

test("chinh tay muc thu nam, tinh lai chenh lech", () => {
  const input = session(450000, 8, 0);
  input.override = { male: 57000 };
  const r = computeSession(input);
  assert.equal(r.manual, true);
  assert.equal(r.maleShare, 57000);
  assert.equal(r.roundingDiff, 6000);
});

test("muc giam nu lon hon suat nam -> loi", () => {
  const r = computeSession(session(100000, 1, 1, "discount", 200000));
  assert.equal(r.ok, false);
});

test("khoan ca nhan cong vao dung nguoi, khong lam tron", () => {
  const input = session(357000, 6, 0);
  input.items.push({ key: "nuoc", kind: "personal", label: "Nước riêng", amount: 8000, paidBy: null, targetPlayerId: "M2" });
  const r = computeSession(input);
  assert.equal(r.chargesByPlayer["M2"].total, 68000);
  assert.equal(r.roundingDiff, 3000);
});
