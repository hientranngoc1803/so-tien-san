import type { CalcInput } from "./calc";
import type { SessionPayload } from "./types";

export function guestLabel(hostName: string, label: string | null | undefined): string {
  return `Khách của ${hostName}${label ? ` (${label})` : ""}`;
}

export function toCalcInput(p: SessionPayload, courtOwnerId: string | null, names: Map<string, string>): CalcInput {
  return {
    participants: p.participants.map((x) => ({
      key: x.pkey,
      gender: x.gender,
      billedTo: (x.playerId ?? x.hostPlayerId) as string,
      label: x.playerId
        ? x.gender === "M"
          ? "Suất nam"
          : "Suất nữ"
        : `${guestLabel(names.get(x.hostPlayerId ?? "") ?? "?", x.guestLabel)} – suất ${x.gender === "M" ? "nam" : "nữ"}`,
    })),
    items: p.items.map((i) => ({
      key: i.key,
      kind: i.kind,
      label: i.label,
      amount: i.amount,
      paidBy: i.paidBy,
      memberKeys: i.memberKeys,
      targetPlayerId: i.targetPlayerId,
    })),
    femaleMode: p.femaleMode,
    femaleValue: p.femaleValue,
    courtOwnerId,
    override: { male: p.overrideMale, female: p.overrideFemale },
  };
}

export function shortK(n: number): string {
  if (n % 1000 === 0) return `${n / 1000}k`;
  return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
}
