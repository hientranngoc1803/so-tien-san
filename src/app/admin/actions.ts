"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { computeSession } from "@/lib/calc";
import { getPlayers, getSessionDetail, loadLedger } from "@/lib/data";
import { isSimilarName } from "@/lib/names";
import { toCalcInput } from "@/lib/session-input";
import { db } from "@/lib/supabase";
import type { SessionPayload, TemplateInput, TemplateItem } from "@/lib/types";
import { lastWeekdayOnOrBefore, todayVN } from "@/lib/money";
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

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function createSessionAction(formData: FormData) {
  const admin = await requireAdmin();
  const from = String(formData.get("from") ?? "");
  const players = await getPlayers();
  const active = new Map(players.filter((p) => p.is_active).map((p) => [p.id, p]));
  const owner = players.find((p) => p.is_court_owner) ?? null;
  const today = todayVN();
  const payload: Record<string, unknown> = {
    session_date: today,
    female_mode: "discount",
    female_value: 0,
    participants: [],
    items: [],
  };
  let templateId: string | null = null;

  const memberRows = (ids: string[]) =>
    [...new Set(ids)]
      .filter((id) => active.has(id))
      .map((id) => ({ pkey: `p:${id}`, player_id: id, gender: active.get(id)!.gender }));
  const itemRows = (list: TemplateItem[]) =>
    list.map((i, idx) => ({
      position: idx,
      kind: "shared",
      label: i.label,
      amount: i.amount ?? 0,
      paid_by_player_id: i.paidBy && i.paidBy !== owner?.id && active.has(i.paidBy) ? i.paidBy : null,
    }));

  if (from.startsWith("template:")) {
    const id = from.slice("template:".length);
    if (!UUID_RE.test(id)) redirect("/admin/buoi");
    const { data: t } = await db().from("session_templates").select("*").eq("id", id).maybeSingle();
    if (!t) redirect("/admin/buoi");
    templateId = t.id;
    payload.session_date = t.weekday === null ? today : lastWeekdayOnOrBefore(today, t.weekday);
    payload.title = t.name;
    payload.female_mode = t.female_mode;
    payload.female_value = t.female_value;
    payload.participants = memberRows(t.player_ids ?? []);
    payload.items = itemRows((t.items ?? []) as TemplateItem[]);
  } else if (from === "previous") {
    const { data: prev } = await db()
      .from("sessions")
      .select("id, title, female_mode, female_value, template_id")
      .eq("status", "closed")
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prev) {
      const { participants, items } = await getSessionDetail(prev.id);
      templateId = prev.template_id ?? null;
      payload.title = prev.title ?? "";
      payload.female_mode = prev.female_mode;
      payload.female_value = prev.female_value;
      payload.participants = memberRows(participants.filter((p) => p.player_id).map((p) => p.player_id!));
      payload.items = itemRows(
        items
          .filter((i) => i.kind === "shared")
          .map((i) => ({ label: i.label, amount: Number(i.amount), paidBy: i.paid_by_player_id })),
      );
    }
  }
  const { data, error } = await db().rpc("save_session", { p: payload, p_actor: admin.email, p_close: false });
  if (error) throw new Error(error.message);
  if (templateId) await db().from("sessions").update({ template_id: templateId }).eq("id", data);
  done();
  redirect(`/admin/buoi/${data}`);
}

function cleanTemplate(input: TemplateInput, playerIds: Set<string>): { errors: string[]; row: Record<string, unknown> } {
  const errors: string[] = [];
  const name = (input.name ?? "").trim();
  if (!name) errors.push("Nhập tên mẫu.");
  if (name.length > 80) errors.push("Tên mẫu quá dài.");
  if (input.weekday !== null && (!isInt(input.weekday) || input.weekday < 0 || input.weekday > 6)) errors.push("Thứ không hợp lệ.");
  if (!["discount", "fixed"].includes(input.femaleMode)) errors.push("Chế độ phí nữ không hợp lệ.");
  if (!isInt(input.femaleValue) || input.femaleValue < 0) errors.push("Mức nữ không hợp lệ.");
  const items: TemplateItem[] = [];
  for (const i of input.items ?? []) {
    const label = (i.label ?? "").trim();
    if (!label) continue;
    if (i.amount !== null && (!isInt(i.amount) || i.amount < 0)) errors.push(`Số tiền "${label}" không hợp lệ.`);
    items.push({ label: label.slice(0, 80), amount: i.amount || null, paidBy: i.paidBy && playerIds.has(i.paidBy) ? i.paidBy : null });
  }
  return {
    errors,
    row: {
      name,
      weekday: input.weekday,
      female_mode: input.femaleMode,
      female_value: input.femaleValue,
      player_ids: [...new Set((input.playerIds ?? []).filter((id) => playerIds.has(id)))],
      items: items.slice(0, 20),
      updated_at: new Date().toISOString(),
    },
  };
}

export async function saveTemplateAction(input: TemplateInput, sessionId: string | null): Promise<SaveResult> {
  const admin = await requireAdmin();
  const players = await getPlayers();
  const { errors, row } = cleanTemplate(input, new Set(players.map((p) => p.id)));
  if (errors.length) return { ok: false, errors };
  let id = input.id;
  if (id) {
    if (!UUID_RE.test(id)) return { ok: false, errors: ["Mẫu không hợp lệ."] };
    const { data, error } = await db().from("session_templates").update(row).eq("id", id).select("id");
    if (error) return { ok: false, errors: [error.message] };
    if (!data?.length) return { ok: false, errors: ["Mẫu không còn tồn tại."] };
  } else {
    const { data, error } = await db()
      .from("session_templates")
      .insert({ ...row, created_by: admin.email })
      .select("id")
      .single();
    if (error) return { ok: false, errors: [error.message] };
    id = data.id as string;
  }
  if (sessionId && UUID_RE.test(sessionId)) {
    await db().from("sessions").update({ template_id: id }).eq("id", sessionId).eq("status", "draft");
  }
  revalidatePath("/admin/buoi", "layout");
  return { ok: true, id: id! };
}

export async function updateTemplateMetaAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const wd = String(formData.get("weekday") ?? "");
  const weekday = wd === "" ? null : Number(wd);
  if (!UUID_RE.test(id) || !name || name.length > 80 || (weekday !== null && !(isInt(weekday) && weekday >= 0 && weekday <= 6))) {
    redirect("/admin/buoi/mau?loi=du-lieu");
  }
  const { error } = await db()
    .from("session_templates")
    .update({ name, weekday, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/buoi", "layout");
  redirect("/admin/buoi/mau");
}

export async function deleteTemplateAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/admin/buoi/mau");
  const { error } = await db().from("session_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/buoi", "layout");
  redirect("/admin/buoi/mau");
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
  mode: "payment" | "transfer" | "refund" | "adjust";
  direction?: "debt" | "credit";
  adjustLabel?: string;
  playerId: string;
  amount: number;
  date: string;
  counterpartyId: string | null;
  bankRef: string;
  publicNote: string;
  internalNote: string;
  newMoney: number | null;
  transferRows: { playerId: string; amount: number }[];
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
  } else if (input.mode === "transfer") {
    const payer = input.playerId;
    if (!byId.has(payer)) return { ok: false, error: "Chưa chọn người trả." };
    const valid = input.transferRows.filter((r) => r.playerId);
    if (valid.length === 0) return { ok: false, error: "Chưa chọn người được trả hộ." };
    if (valid.some((r) => !isInt(r.amount) || r.amount <= 0 || !byId.has(r.playerId))) {
      return { ok: false, error: "Số tiền từng dòng phải lớn hơn 0." };
    }
    if (valid.some((r) => r.playerId === payer)) return { ok: false, error: "Người được trả hộ phải khác người trả." };
    if (new Set(valid.map((r) => r.playerId)).size !== valid.length) return { ok: false, error: "Một người bị nhập hai dòng." };
    const newMoney = input.newMoney ?? 0;
    if (!isInt(newMoney) || newMoney < 0) return { ok: false, error: "Tiền chuyển khoản mới không hợp lệ." };
    if (newMoney > 0 && cp === payer) return { ok: false, error: "Người nhận tiền phải khác người trả." };
    const payerName = byId.get(payer)!.display_name;
    const recipients = valid.map((r) => byId.get(r.playerId)!.display_name).join(", ");
    if (newMoney > 0) {
      rows.push({
        ...base,
        client_request_id: `${input.requestId}:in`,
        player_id: payer,
        kind: "payment",
        label: null,
        amount: newMoney,
        counterparty_player_id: cp,
        group_ref: input.requestId,
        public_note: [`Trả hộ ${recipients}`, input.publicNote.trim()].filter(Boolean).join(" · "),
      });
    }
    valid.forEach((r, i) =>
      rows.push({
        ...base,
        bank_ref: "",
        client_request_id: `${input.requestId}:${i}`,
        player_id: r.playerId,
        kind: "transfer",
        label: null,
        amount: r.amount,
        counterparty_player_id: payer,
        group_ref: input.requestId,
        public_note: [newMoney > 0 ? `${payerName} chuyển khoản trả hộ` : `${payerName} trả hộ từ quỹ`, input.publicNote.trim()]
          .filter(Boolean)
          .join(" · "),
      }),
    );
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
        label: null,
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
  const rawBack = String(formData.get("back") ?? "");
  const back = /^\/admin(\/|$)/.test(rawBack) && !rawBack.startsWith("//") ? rawBack : "/admin/giao-dich";
  if (!reason) redirect(`${back}${back.includes("?") ? "&" : "?"}loi=ly-do`);
  if (!isInt(id) || id <= 0) redirect(back);
  const { data: target } = await db().from("transactions").select("id, group_ref").eq("id", id).maybeSingle();
  if (!target) redirect(back);
  let ids = [id];
  if (target.group_ref) {
    const { data: group } = await db()
      .from("transactions")
      .select("id")
      .eq("group_ref", target.group_ref)
      .is("voided_at", null)
      .order("id");
    ids = (group ?? []).map((g) => Number(g.id));
  }
  for (const tid of ids) {
    const { error } = await db().rpc("void_transaction", { p_id: tid, p_reason: reason, p_actor: admin.email });
    if (error) throw new Error(error.message);
  }
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
