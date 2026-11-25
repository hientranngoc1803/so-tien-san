"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { computeSession } from "@/lib/calc";
import { getPlayers, loadLedger } from "@/lib/data";
import { isSimilarName } from "@/lib/names";
import { toCalcInput } from "@/lib/session-input";
import { db } from "@/lib/supabase";
import type { SessionPayload } from "@/lib/types";
import { todayVN } from "@/lib/money";
import { PREPAY_LABEL } from "@/lib/ledger";
import { BANK_KEY, QR_DATA_URL, QR_KEY, QR_MAX_BYTES } from "@/lib/settings";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

function done() {
  revalidatePath("/", "layout");
}

export interface SaveResult {
  ok: boolean;
  id?: string;
  errors?: string[];
}

export async function saveSessionAction(payload: SessionPayload, close: boolean): Promise<SaveResult> {
  const admin = await requireAdmin();
  const players = await getPlayers();
  const byId = new Map(players.map((p) => [p.id, p]));
  const owner = players.find((p) => p.is_court_owner) ?? null;
  const errors: string[] = [];

  if (!DATE_RE.test(payload.date)) errors.push("Ngày không hợp lệ.");
  if (!["discount", "fixed"].includes(payload.femaleMode)) errors.push("Chế độ phí nữ không hợp lệ.");
  if (!isInt(payload.femaleValue) || payload.femaleValue < 0) errors.push("Mức nữ không hợp lệ.");
  for (const v of [payload.overrideMale, payload.overrideFemale]) {
    if (v !== null && (!isInt(v) || v < 0)) errors.push("Mức chỉnh tay không hợp lệ.");
  }

  const pkeys = new Set<string>();
  const memberIds = new Set<string>();
  for (const p of payload.participants) {
    if (!p.pkey || pkeys.has(p.pkey)) errors.push("Danh sách người bị trùng.");
    pkeys.add(p.pkey);
    if (p.gender !== "M" && p.gender !== "F") errors.push("Nhóm tính phí không hợp lệ.");
    if (p.playerId) {
      if (!byId.has(p.playerId)) errors.push("Có người chơi không tồn tại.");
      if (memberIds.has(p.playerId)) errors.push(`${byId.get(p.playerId)?.display_name} bị chọn hai lần.`);
      memberIds.add(p.playerId);
      if (p.hostPlayerId) errors.push("Dòng khách không hợp lệ.");
    } else if (!p.hostPlayerId || !byId.has(p.hostPlayerId)) {
      errors.push("Khách chưa có người mời.");
    }
  }

  const items = payload.items.filter((i) => i.amount !== 0);
  for (const i of items) {
    if (!["shared", "group", "personal"].includes(i.kind)) errors.push("Loại khoản không hợp lệ.");
    if (!isInt(i.amount)) errors.push(`Số tiền "${i.label}" không hợp lệ.`);
    if (i.kind !== "personal" && i.amount < 0) errors.push(`Khoản "${i.label}" không được âm.`);
    if (i.paidBy && !byId.has(i.paidBy)) errors.push(`Người trả "${i.label}" không tồn tại.`);
    if (i.kind === "group" && i.memberKeys.some((k) => !pkeys.has(k))) errors.push(`Khoản "${i.label}" có người không có mặt.`);
    if (i.kind === "personal" && (!i.targetPlayerId || !byId.has(i.targetPlayerId))) {
      errors.push(`Khoản cá nhân "${i.label}" chưa chọn người.`);
    }
  }
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };

  const clean: SessionPayload = { ...payload, items };
  const names = new Map(players.map((p) => [p.id, p.display_name]));
  const calc = computeSession(toCalcInput(clean, owner?.id ?? null, names));
  const overrideReason = (payload.overrideReason ?? "").trim();
  if (close) {
    if (!owner) return { ok: false, errors: ["Chưa gắn hồ sơ chủ sân (vào mục Người chơi)."] };
    if (!calc.ok) return { ok: false, errors: calc.errors };
    if (calc.manual && !overrideReason) return { ok: false, errors: ["Nhập lý do chỉnh tay mức thu."] };
  }
  const explanation = calc.explanation.map((e) =>
    calc.manual && overrideReason && e === "Quản lý đã chỉnh tay mức thu." ? `Quản lý đã chỉnh tay mức thu: ${overrideReason}.` : e,
  );

  const p = {
    id: payload.id ?? null,
    session_date: payload.date,
    title: payload.title,
    female_mode: payload.femaleMode,
    female_value: payload.femaleValue,
    override_male: payload.overrideMale,
    override_female: payload.overrideFemale,
    override_reason: overrideReason,
    internal_note: payload.internalNote,
    participants: payload.participants.map((x) => ({
      pkey: x.pkey,
      player_id: x.playerId,
      host_player_id: x.hostPlayerId,
      guest_label: x.guestLabel,
      gender: x.gender,
      share_amount: close ? calc.shareByParticipant[x.pkey] ?? 0 : null,
    })),
    items: items.map((i, idx) => ({
      position: idx,
      kind: i.kind,
      label: i.label.trim() || "Khoản khác",
      amount: i.amount,
      paid_by_player_id: i.paidBy && i.paidBy !== owner?.id ? i.paidBy : null,
      member_keys: i.kind === "group" ? i.memberKeys : [],
      target_player_id: i.kind === "personal" ? i.targetPlayerId : null,
      per_person: close && i.kind === "group" ? calc.groups.find((g) => g.key === i.key)?.perPerson ?? null : null,
    })),
    result: close
      ? {
          male_share: calc.maleShare,
          female_share: calc.femaleShare,
          is_manual_override: calc.manual,
          shared_total: calc.sharedTotal,
          total_due: calc.totalDue,
          rounding_diff: calc.roundingDiff,
          explanation,
        }
      : null,
  };
  const { data, error } = await db().rpc("save_session", { p, p_actor: admin.email, p_close: close });
  if (error) return { ok: false, errors: [error.message] };
  done();
  return { ok: true, id: data as string };
}

export async function createSessionAction(formData: FormData) {
  const admin = await requireAdmin();
  const fromPrevious = formData.get("from") === "previous";
  const payload: Record<string, unknown> = {
    session_date: todayVN(),
    female_mode: "discount",
    female_value: 0,
    participants: [],
    items: [],
  };
  if (fromPrevious) {
    const { data: prev } = await db()
      .from("sessions")
      .select("id, female_mode, female_value")
      .eq("status", "closed")
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prev) {
      const { data: parts } = await db()
        .from("session_participants")
        .select("pkey, player_id, host_player_id, guest_label, gender")
        .eq("session_id", prev.id)
        .order("id");
      const players = await getPlayers();
      const active = new Set(players.filter((p) => p.is_active).map((p) => p.id));
      payload.female_mode = prev.female_mode;
      payload.female_value = prev.female_value;
      payload.participants = (parts ?? []).filter((p) => active.has(p.player_id ?? p.host_player_id));
    }
  }
  const { data, error } = await db().rpc("save_session", { p: payload, p_actor: admin.email, p_close: false });
  if (error) throw new Error(error.message);
  done();
  redirect(`/admin/buoi/${data}`);
}

export async function reopenSessionAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) redirect(`/admin/buoi/${id}?loi=ly-do`);
  const { error } = await db().rpc("reopen_session", { p_id: id, p_reason: reason, p_actor: admin.email });
  if (error) throw new Error(error.message);
  done();
  redirect(`/admin/buoi/${id}`);
}

export async function deleteDraftAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const { error } = await db().from("sessions").delete().eq("id", id).eq("status", "draft");
  if (error) throw new Error(error.message);
  done();
  redirect("/admin/buoi");
}

export interface TxnInput {
  requestId: string;
  mode: "payment" | "prepay" | "refund" | "split" | "adjust";
  direction?: "debt" | "credit";
  adjustLabel?: string;
  playerId: string;
  amount: number;
  date: string;
  counterpartyId: string | null;
  bankRef: string;
  publicNote: string;
  internalNote: string;
  splitPayer: string;
  splitTotal: number;
  splitRows: { playerId: string; amount: number }[];
}

export interface TxnResult {
  ok: boolean;
  error?: string;
  duplicate?: boolean;
  count?: number;
}

export async function recordTransactionAction(input: TxnInput): Promise<TxnResult> {
  const admin = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(input.requestId)) return { ok: false, error: "Mã yêu cầu không hợp lệ." };
  if (!DATE_RE.test(input.date)) return { ok: false, error: "Ngày không hợp lệ." };

  const { data: existing } = await db()
    .from("transactions")
    .select("id")
    .like("client_request_id", `${input.requestId}%`)
    .limit(1);
  if (existing && existing.length > 0) return { ok: true, duplicate: true, count: 0 };

  const ledger = await loadLedger();
  const byId = new Map(ledger.players.map((p) => [p.id, p]));
  const ownerId = ledger.courtOwner?.id ?? null;
  const cp = input.counterpartyId && input.counterpartyId !== ownerId ? input.counterpartyId : null;
  if (cp && !byId.has(cp)) return { ok: false, error: "Người nhận/chuyển không tồn tại." };

  const base = {
    txn_date: input.date,
    bank_ref: input.bankRef.trim(),
    internal_note: input.internalNote.trim(),
  };
  let rows: Record<string, unknown>[] = [];

  if (input.mode === "adjust") {
    if (!byId.has(input.playerId)) return { ok: false, error: "Chưa chọn người." };
    if (!isInt(input.amount) || input.amount <= 0) return { ok: false, error: "Số tiền phải lớn hơn 0." };
    if (input.direction !== "debt" && input.direction !== "credit") return { ok: false, error: "Chọn ghi nợ hoặc ghi dư." };
    if (!input.publicNote.trim()) return { ok: false, error: "Nhập lý do điều chỉnh." };
    rows = [
      {
        ...base,
        client_request_id: input.requestId,
        player_id: input.playerId,
        kind: "opening",
        label: (input.adjustLabel ?? "").trim() || (input.direction === "debt" ? "Nợ đầu kỳ" : "Dư đầu kỳ"),
        amount: input.direction === "debt" ? -input.amount : input.amount,
        counterparty_player_id: null,
        public_note: input.publicNote.trim(),
      },
    ];
  } else if (input.mode === "split") {
    const valid = input.splitRows.filter((r) => r.playerId);
    if (valid.length === 0) return { ok: false, error: "Chưa chọn người được trả hộ." };
    if (valid.some((r) => !isInt(r.amount) || r.amount <= 0 || !byId.has(r.playerId))) {
      return { ok: false, error: "Số tiền từng dòng phải lớn hơn 0." };
    }
    if (new Set(valid.map((r) => r.playerId)).size !== valid.length) return { ok: false, error: "Một người bị nhập hai dòng." };
    const sum = valid.reduce((s, r) => s + r.amount, 0);
    if (!isInt(input.splitTotal) || sum !== input.splitTotal) {
      return { ok: false, error: `Tổng các dòng (${sum.toLocaleString("vi-VN")} đ) phải bằng số tiền nhận.` };
    }
    if (valid.some((r) => r.playerId === cp)) return { ok: false, error: "Người nhận tiền không thể là người được trả hộ." };
    const note = [`Chuyển hộ bởi ${input.splitPayer.trim() || "?"}`, input.publicNote.trim()].filter(Boolean).join(" · ");
    rows = valid.map((r, i) => ({
      ...base,
      client_request_id: `${input.requestId}:${i}`,
      player_id: r.playerId,
      kind: "payment",
      label: "Chuyển hộ",
      amount: r.amount,
      counterparty_player_id: cp,
      group_ref: input.requestId,
      public_note: note,
    }));
  } else {
    if (!byId.has(input.playerId)) return { ok: false, error: "Chưa chọn người." };
    if (!isInt(input.amount) || input.amount <= 0) return { ok: false, error: "Số tiền phải lớn hơn 0." };
    if (cp === input.playerId) return { ok: false, error: "Người nhận/chuyển phải khác người nộp." };
    if (input.mode === "refund") {
      const balance = ledger.books.get(input.playerId)?.balance ?? 0;
      if (input.amount > balance) {
        return { ok: false, error: `Chỉ hoàn tối đa phần đang dư: ${Math.max(0, balance).toLocaleString("vi-VN")} đ.` };
      }
    }
    rows = [
      {
        ...base,
        client_request_id: input.requestId,
        player_id: input.playerId,
        kind: input.mode === "refund" ? "refund" : "payment",
        label: input.mode === "prepay" ? PREPAY_LABEL : null,
        amount: input.amount,
        counterparty_player_id: cp,
        public_note: input.publicNote.trim(),
      },
    ];
  }

  const { data, error } = await db().rpc("record_transactions", { p_rows: rows, p_actor: admin.email });
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true, count: Array.isArray(data) ? data.length : rows.length };
}

export async function voidTransactionAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const reason = String(formData.get("reason") ?? "").trim();
  const back = String(formData.get("back") ?? "/admin/giao-dich");
  if (!reason) redirect(`${back}${back.includes("?") ? "&" : "?"}loi=ly-do`);
  const { error } = await db().rpc("void_transaction", { p_id: id, p_reason: reason, p_actor: admin.email });
  if (error) throw new Error(error.message);
  done();
  redirect(back);
}

export interface PlayerFormState {
  ok?: string;
  warning?: string;
  error?: string;
  needConfirm?: boolean;
  name?: string;
  gender?: string;
}

export async function addPlayerAction(_prev: PlayerFormState, formData: FormData): Promise<PlayerFormState> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const gender = String(formData.get("gender") ?? "");
  const confirmed = formData.get("confirm") === "1";
  if (!name) return { error: "Nhập tên hiển thị.", gender };
  if (gender !== "M" && gender !== "F") return { error: "Chọn nhóm Nam hoặc Nữ.", name };
  const players = await getPlayers();
  const similar = players.filter((p) => isSimilarName(p.display_name, name));
  if (similar.length > 0 && !confirmed) {
    return {
      needConfirm: true,
      name,
      gender,
      warning: `Đã có hồ sơ giống tên: ${similar.map((p) => `${p.display_name} · ${p.short_code}${p.is_active ? "" : " (đã nghỉ)"}`).join(", ")}. Nếu đúng là người mới, tick xác nhận rồi bấm thêm lại.`,
    };
  }
  const { data, error } = await db().from("players").insert({ display_name: name, gender }).select("short_code").single();
  if (error) return { error: error.message };
  await db().from("audit_log").insert({ entity: "player", entity_id: data.short_code, action: "create", after: { name, gender }, actor: admin.email });
  done();
  return { ok: `Đã thêm ${name} · ${data.short_code}.` };
}

export async function updatePlayerAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const gender = String(formData.get("gender") ?? "");
  const active = formData.get("active") === "1";
  if (!name || (gender !== "M" && gender !== "F")) redirect("/admin/nguoi-choi?loi=du-lieu");
  const { data: before } = await db().from("players").select("display_name, gender, is_active").eq("id", id).single();
  const { error } = await db()
    .from("players")
    .update({ display_name: name, gender, is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await db().from("audit_log").insert({
    entity: "player",
    entity_id: id,
    action: "update",
    before,
    after: { display_name: name, gender, is_active: active },
    actor: admin.email,
  });
  done();
  redirect("/admin/nguoi-choi");
}

export async function setCourtOwnerAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const { error } = await db().rpc("set_court_owner", { p_player: id, p_actor: admin.email });
  if (error) throw new Error(error.message);
  done();
  redirect("/admin/nguoi-choi");
}

export async function addAdminAction(formData: FormData) {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/admin/nguoi-choi?loi=email");
  const { error } = await db().from("admins").upsert({ email });
  if (error) throw new Error(error.message);
  await db().from("audit_log").insert({ entity: "admin", entity_id: email, action: "add", actor: admin.email });
  done();
  redirect("/admin/nguoi-choi");
}

export async function removeAdminAction(formData: FormData) {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "").toLowerCase();
  if (email === admin.email) redirect("/admin/nguoi-choi?loi=tu-xoa");
  const { error } = await db().from("admins").delete().eq("email", email);
  if (error) throw new Error(error.message);
  await db().from("audit_log").insert({ entity: "admin", entity_id: email, action: "remove", actor: admin.email });
  done();
  redirect("/admin/nguoi-choi");
}

export async function deletePlayerAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/admin/nguoi-choi?loi=du-lieu");
  const refs = await Promise.all([
    db().from("session_participants").select("id", { count: "exact", head: true }).or(`player_id.eq.${id},host_player_id.eq.${id}`),
    db().from("session_items").select("id", { count: "exact", head: true }).or(`paid_by_player_id.eq.${id},target_player_id.eq.${id}`),
    db().from("transactions").select("id", { count: "exact", head: true }).or(`player_id.eq.${id},counterparty_player_id.eq.${id}`),
    db().from("admins").select("email", { count: "exact", head: true }).eq("player_id", id),
    db().from("players").select("id", { count: "exact", head: true }).eq("id", id).eq("is_court_owner", true),
  ]);
  if (refs.some((r) => r.error || (r.count ?? 0) > 0)) redirect("/admin/nguoi-choi?loi=co-lich-su");
  const { data: before } = await db().from("players").select("*").eq("id", id).single();
  const { error } = await db().from("players").delete().eq("id", id);
  if (error) redirect("/admin/nguoi-choi?loi=co-lich-su");
  await db().from("audit_log").insert({ entity: "player", entity_id: id, action: "delete", before, actor: admin.email });
  done();
  redirect("/admin/nguoi-choi");
}

async function putSetting(key: string, value: string | null, actor: string) {
  const { error } = await db().from("settings").upsert({ key, value, updated_by: actor, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await db().from("audit_log").insert({ entity: "setting", entity_id: key, action: value ? "set" : "clear", actor });
}

export async function saveQrAction(dataUrl: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const m = typeof dataUrl === "string" ? QR_DATA_URL.exec(dataUrl) : null;
  if (!m) return { ok: false, error: "Chỉ nhận ảnh PNG, JPG hoặc WebP." };
  if (Buffer.from(m[2], "base64").length > QR_MAX_BYTES) return { ok: false, error: "Ảnh cần nhỏ hơn 1,4 MB." };
  await putSetting(QR_KEY, dataUrl, admin.email);
  done();
  return { ok: true };
}

export async function removeQrAction() {
  const admin = await requireAdmin();
  await putSetting(QR_KEY, null, admin.email);
  done();
}

export async function saveBankInfoAction(formData: FormData) {
  const admin = await requireAdmin();
  const text = String(formData.get("bankInfo") ?? "").trim().slice(0, 300);
  await putSetting(BANK_KEY, text || null, admin.email);
  done();
  redirect("/admin/cai-dat?ok=1");
}
