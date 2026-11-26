import type { FemaleMode, Gender, ItemKind } from "./calc";

export interface Player {
  id: string;
  short_code: string;
  display_name: string;
  gender: Gender;
  is_active: boolean;
  is_court_owner: boolean;
}

export interface SessionRow {
  id: string;
  session_date: string;
  title: string | null;
  status: "draft" | "closed";
  female_mode: FemaleMode;
  female_value: number;
  override_male: number | null;
  override_female: number | null;
  override_reason: string | null;
  male_share: number | null;
  female_share: number | null;
  is_manual_override: boolean;
  shared_total: number;
  total_due: number;
  rounding_diff: number;
  explanation: string[];
  court_owner_id: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface ParticipantRow {
  id: number;
  session_id: string;
  pkey: string;
  player_id: string | null;
  host_player_id: string | null;
  guest_label: string | null;
  gender: Gender;
  share_amount: number | null;
}

export interface ItemRow {
  id: number;
  session_id: string;
  position: number;
  kind: ItemKind;
  label: string;
  amount: number;
  paid_by_player_id: string | null;
  member_keys: string[];
  target_player_id: string | null;
  per_person: number | null;
}

export interface TxnRow {
  id: number;
  client_request_id: string;
  player_id: string;
  kind: "payment" | "refund" | "opening";
  label: string | null;
  amount: number;
  counterparty_player_id: string | null;
  txn_date: string;
  bank_ref: string | null;
  group_ref: string | null;
  public_note: string | null;
  created_by: string;
  created_at: string;
}

export interface TemplateItem {
  label: string;
  amount: number | null;
  paidBy: string | null;
}

export interface SessionTemplate {
  id: string;
  name: string;
  weekday: number | null;
  female_mode: FemaleMode;
  female_value: number;
  player_ids: string[];
  items: TemplateItem[];
  updated_at: string;
}

export interface TemplateInput {
  id: string | null;
  name: string;
  weekday: number | null;
  femaleMode: FemaleMode;
  femaleValue: number;
  playerIds: string[];
  items: TemplateItem[];
}

export const WEEKDAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

export interface SessionPayload {
  id?: string;
  date: string;
  title: string;
  internalNote: string;
  femaleMode: FemaleMode;
  femaleValue: number;
  overrideMale: number | null;
  overrideFemale: number | null;
  overrideReason?: string;
  participants: {
    pkey: string;
    playerId: string | null;
    hostPlayerId: string | null;
    guestLabel: string;
    gender: Gender;
  }[];
  items: {
    key: string;
    kind: ItemKind;
    label: string;
    amount: number;
    paidBy: string | null;
    memberKeys: string[];
    targetPlayerId: string | null;
  }[];
}
