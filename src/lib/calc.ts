import { vnd } from "./money";

export type Gender = "M" | "F";
export type FemaleMode = "discount" | "fixed";
export type ItemKind = "shared" | "group" | "personal";

export const STEP = 1000;
export const SURPLUS_CAP = 3000;

export interface CalcParticipant {
  key: string;
  gender: Gender;
  billedTo: string;
  label: string;
}

export interface CalcItem {
  key: string;
  kind: ItemKind;
  label: string;
  amount: number;
  paidBy: string | null;
  memberKeys?: string[];
  targetPlayerId?: string | null;
}

export interface CalcInput {
  participants: CalcParticipant[];
  items: CalcItem[];
  femaleMode: FemaleMode;
  femaleValue: number;
  courtOwnerId: string | null;
  override?: { male?: number | null; female?: number | null };
}

export interface Candidate {
  value: number;
  diff: number;
}

export interface RoundResult {
  value: number;
  diff: number;
  tentative: number;
  candidates: Candidate[];
}

export interface ChargePart {
  label: string;
  amount: number;
}

export interface GroupResult {
  key: string;
  perPerson: number;
  diff: number;
  tentative: number;
  memberCount: number;
}

export interface CalcResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  maleCount: number;
  femaleCount: number;
  sharedTotal: number;
  tentative: number | null;
  maleShare: number | null;
  femaleShare: number | null;
  sharedDiff: number;
  groups: GroupResult[];
  roundingDiff: number;
  totalDue: number;
  manual: boolean;
  shareByParticipant: Record<string, number>;
  chargesByPlayer: Record<string, { total: number; parts: ChargePart[] }>;
  creditsByPlayer: Record<string, { total: number; parts: ChargePart[] }>;
  explanation: string[];
}

export function chooseRounded(
  numerator: number,
  denominator: number,
  diffOf: (m: number) => number,
  isValid: (m: number) => boolean = (m) => m >= 0,
): RoundResult | null {
  if (denominator <= 0) return null;
  const unit = denominator * STEP;
  const lo = Math.floor(numerator / unit) * STEP;
  const exact = numerator % unit === 0;
  const values = exact ? [lo] : [lo, lo + STEP];
  const candidates = values
    .filter(isValid)
    .map((value) => ({ value, diff: diffOf(value) }));
  if (candidates.length === 0) return null;
  const tentative = numerator / denominator;
  const up = candidates.find((c) => c.value === values[values.length - 1]);
  if (up && up.diff >= 0 && up.diff <= SURPLUS_CAP) {
    return { ...up, tentative, candidates };
  }
  let best = candidates[0];
  for (const c of candidates) {
    const better = Math.abs(c.diff) < Math.abs(best.diff);
    const tieHigher = Math.abs(c.diff) === Math.abs(best.diff) && c.value > best.value;
    if (better || tieHigher) best = c;
  }
  return { ...best, tentative, candidates };
}

function addPart(
  bucket: Record<string, { total: number; parts: ChargePart[] }>,
  playerId: string,
  label: string,
  amount: number,
) {
  if (!bucket[playerId]) bucket[playerId] = { total: 0, parts: [] };
  bucket[playerId].total += amount;
  bucket[playerId].parts.push({ label, amount });
}

function tentativeText(n: number): string {
  return vnd(Math.round(n));
}

export function computeSession(input: CalcInput): CalcResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const males = input.participants.filter((p) => p.gender === "M");
  const females = input.participants.filter((p) => p.gender === "F");
  const N = males.length;
  const F = females.length;
  const P = N + F;
  const shared = input.items.filter((i) => i.kind === "shared");
  const C = shared.reduce((s, i) => s + i.amount, 0);
  const femaleValue = F > 0 ? input.femaleValue : 0;
  const mode = input.femaleMode;

  let maleShare: number | null = null;
  let femaleShare: number | null = null;
  let sharedDiff = 0;
  let tentative: number | null = null;
  let manual = false;
  const explanation: string[] = [];

  if (P === 0) errors.push("Chưa chọn người chơi nào.");
  if (shared.some((i) => i.amount < 0)) errors.push("Chi phí chung không được âm.");
  if (femaleValue < 0) errors.push("Mức giảm hoặc suất nữ không được âm.");
  if (femaleValue % STEP !== 0) errors.push("Mức giảm hoặc suất nữ phải theo bước 1.000 đ.");

  if (P > 0 && errors.length === 0) {
    if (N > 0) {
      let r: RoundResult | null;
      if (mode === "discount") {
        const d = femaleValue;
        r = chooseRounded(
          C + F * d,
          P,
          (m) => N * m + F * (m - d) - C,
          (m) => m >= 0 && (F === 0 || m - d >= 0),
        );
        if (r) {
          maleShare = r.value;
          femaleShare = F > 0 ? r.value - d : null;
        } else {
          errors.push("Mức giảm cho nữ lớn hơn suất nam, không tính được.");
        }
      } else {
        const f = femaleValue;
        r = chooseRounded(C - F * f, N, (m) => N * m + F * f - C);
        if (r) {
          maleShare = r.value;
          femaleShare = F > 0 ? f : null;
        } else {
          errors.push("Suất nữ quá cao so với tổng chi phí.");
        }
      }
      if (r) {
        tentative = r.tentative;
        sharedDiff = r.diff;
      }
    } else {
      const r = chooseRounded(C, F, (m) => F * m - C);
      if (r) {
        femaleShare = r.value;
        tentative = r.tentative;
        sharedDiff = r.diff;
      }
    }

    const ov = input.override;
    if (ov && ((ov.male !== null && ov.male !== undefined && N > 0) || (ov.female !== null && ov.female !== undefined && F > 0))) {
      manual = true;
      if (ov.male !== null && ov.male !== undefined && N > 0) {
        maleShare = ov.male;
        if (F > 0) femaleShare = mode === "discount" ? ov.male - femaleValue : femaleValue;
      }
      if (ov.female !== null && ov.female !== undefined && F > 0) femaleShare = ov.female;
      sharedDiff = N * (maleShare ?? 0) + F * (femaleShare ?? 0) - C;
    }

    if ((maleShare ?? 0) < 0 || (femaleShare ?? 0) < 0) errors.push("Mức thu không được âm.");
    if (mode === "fixed" && N > 0 && F > 0 && maleShare !== null && femaleShare !== null && maleShare < femaleShare) {
      warnings.push("Suất nam đang thấp hơn suất nữ.");
    }

    if (tentative !== null) {
      if (N > 0 && F > 0 && mode === "discount") {
        explanation.push(
          `(${vnd(C)} + ${F} nữ × ${vnd(femaleValue)}) ÷ ${P} người = ${tentativeText(tentative)} tạm tính.`,
        );
      } else if (N > 0 && F > 0) {
        explanation.push(
          `(${vnd(C)} − ${F} nữ × ${vnd(femaleValue)}) ÷ ${N} nam = ${tentativeText(tentative)} tạm tính.`,
        );
      } else if (N > 0) {
        explanation.push(`${vnd(C)} ÷ ${N} nam = ${tentativeText(tentative)} tạm tính.`);
      } else {
        explanation.push(`${vnd(C)} ÷ ${F} nữ = ${tentativeText(tentative)} tạm tính.`);
      }
    }
    const rates: string[] = [];
    if (maleShare !== null) rates.push(`${vnd(maleShare)}/nam`);
    if (femaleShare !== null) rates.push(`${vnd(femaleShare)}/nữ`);
    if (rates.length) explanation.push(`Mức thu ${rates.join(", ")}.`);
    if (manual) explanation.push("Quản lý đã chỉnh tay mức thu.");
  }

  const shareByParticipant: Record<string, number> = {};
  const chargesByPlayer: Record<string, { total: number; parts: ChargePart[] }> = {};
  const creditsByPlayer: Record<string, { total: number; parts: ChargePart[] }> = {};

  for (const p of input.participants) {
    const share = p.gender === "M" ? maleShare : femaleShare;
    if (share === null) continue;
    shareByParticipant[p.key] = share;
    addPart(chargesByPlayer, p.billedTo, p.label, share);
  }

  const groups: GroupResult[] = [];
  const byKey = new Map(input.participants.map((p) => [p.key, p]));
  for (const item of input.items) {
    if (item.kind === "group") {
      const members = (item.memberKeys ?? []).map((k) => byKey.get(k)).filter(Boolean) as CalcParticipant[];
      if (item.amount < 0) {
        errors.push(`Khoản chia nhóm "${item.label}" không được âm.`);
        continue;
      }
      if (members.length === 0) {
        errors.push(`Khoản chia nhóm "${item.label}" chưa chọn người.`);
        continue;
      }
      const k = members.length;
      const r = chooseRounded(item.amount, k, (m) => k * m - item.amount);
      if (!r) continue;
      groups.push({ key: item.key, perPerson: r.value, diff: r.diff, tentative: r.tentative, memberCount: k });
      for (const m of members) addPart(chargesByPlayer, m.billedTo, `${item.label} (chia ${k})`, r.value);
      explanation.push(
        `${item.label}: ${vnd(item.amount)} ÷ ${k} người = ${tentativeText(r.tentative)} tạm tính, thu ${vnd(r.value)}/người.`,
      );
    } else if (item.kind === "personal") {
      if (!item.targetPlayerId) {
        errors.push(`Khoản cá nhân "${item.label}" chưa chọn người.`);
        continue;
      }
      addPart(chargesByPlayer, item.targetPlayerId, item.label, item.amount);
    }
    if (item.kind !== "personal" && item.paidBy && item.paidBy !== input.courtOwnerId) {
      addPart(creditsByPlayer, item.paidBy, `Chi hộ: ${item.label}`, item.amount);
    }
  }

  const groupDiff = groups.reduce((s, g) => s + g.diff, 0);
  const roundingDiff = sharedDiff + groupDiff;
  if (P > 0 && errors.length === 0) {
    if (roundingDiff > 0) explanation.push(`Chủ sân nhận chênh lệch ${vnd(roundingDiff)}.`);
    else if (roundingDiff < 0) explanation.push(`Chủ sân bù ${vnd(-roundingDiff)}.`);
    else explanation.push("Không có chênh lệch.");
  }

  const totalDue = Object.values(chargesByPlayer).reduce((s, c) => s + c.total, 0);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    maleCount: N,
    femaleCount: F,
    sharedTotal: C,
    tentative,
    maleShare,
    femaleShare,
    sharedDiff,
    groups,
    roundingDiff,
    totalDue,
    manual,
    shareByParticipant,
    chargesByPlayer,
    creditsByPlayer,
    explanation,
  };
}
