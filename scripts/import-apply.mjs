import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { readCsv } from "./csv.mjs";

config({ path: ".env.local" });
config();

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const dir = arg("dir", "import");
const cutoff = arg("cutoff", "");
const ownerName = arg("owner", "");
const dryRun = process.argv.includes("--dry-run");

if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
  console.error('Cách dùng: npm run import:apply -- --cutoff 2026-11-24 --owner "Tạ Anh" [--dir import] [--dry-run]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local");
  process.exit(1);
}
const db = createClient(url, key, {
  auth: { persistSession: false },
  realtime: typeof globalThis.WebSocket === "undefined" ? { transport: WebSocket } : undefined,
});

const names = readCsv(path.join(dir, "names.csv"));
const opening = readCsv(path.join(dir, "opening.csv"));

const problems = [];
const map = new Map();
const memberGender = new Map();
for (const r of names) {
  const action = (r.action || "").toLowerCase();
  if (action === "member") {
    if (!r.player_name) problems.push(`"${r.raw_name}": action=member nhưng thiếu player_name`);
    if (r.gender !== "M" && r.gender !== "F") problems.push(`"${r.raw_name}": gender phải là M hoặc F`);
    const prev = memberGender.get(r.player_name);
    if (prev && prev !== r.gender) problems.push(`"${r.player_name}": gender không thống nhất giữa các dòng`);
    memberGender.set(r.player_name, r.gender);
    map.set(r.raw_name, { kind: "member", name: r.player_name });
  } else if (action === "guest") {
    if (!r.host_name) problems.push(`"${r.raw_name}": action=guest nhưng thiếu host_name`);
    map.set(r.raw_name, { kind: "guest", name: r.host_name });
  } else if (action === "skip") {
    map.set(r.raw_name, { kind: "skip" });
  } else {
    problems.push(`"${r.raw_name}": action phải là member, guest hoặc skip`);
  }
}

const { data: existing, error: e0 } = await db.from("players").select("id, display_name, gender, is_court_owner");
if (e0) throw new Error(e0.message);
const existingByName = new Map(existing.map((p) => [p.display_name, p]));

for (const [, m] of map) {
  if (m.kind === "guest" && !memberGender.has(m.name) && !existingByName.has(m.name)) {
    problems.push(`Người mời "${m.name}" không có trong danh sách member`);
  }
}
if (ownerName && !memberGender.has(ownerName) && !existingByName.has(ownerName)) {
  problems.push(`Chủ sân "${ownerName}" không có trong danh sách member`);
}
for (const o of opening) {
  const amt = Number(o.amount || 0);
  if (!Number.isInteger(amt)) problems.push(`opening.csv: dòng ${o.ref} số tiền không hợp lệ`);
  if (o.date && !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) problems.push(`opening.csv: dòng ${o.ref} ngày sai định dạng`);
  if (!o.ref) problems.push(`opening.csv: có dòng thiếu ref`);
  if (amt !== 0 && !map.has(o.raw_name)) problems.push(`opening.csv: "${o.raw_name}" chưa có trong names.csv`);
  if (map.get(o.raw_name)?.kind === "skip" && amt !== 0) problems.push(`opening.csv: "${o.raw_name}" có số dư nhưng bị skip`);
}
if (new Set(opening.map((o) => o.ref)).size !== opening.length) problems.push("opening.csv: ref bị trùng");

if (problems.length) {
  console.error("Cần sửa trước khi nhập:");
  problems.forEach((p) => console.error(" - " + p));
  process.exit(1);
}

const toCreate = [...memberGender.entries()].filter(([n]) => !existingByName.has(n));
const openingByPlayer = new Map();
for (const o of opening) {
  const amount = Math.round(Number(o.amount || 0));
  if (!amount) continue;
  const m = map.get(o.raw_name);
  openingByPlayer.set(m.name, (openingByPlayer.get(m.name) ?? 0) + amount);
}
console.log(`Tạo mới ${toCreate.length} hồ sơ, dùng lại ${memberGender.size - toCreate.length} hồ sơ có sẵn.`);
const openTotal = [...openingByPlayer.values()];
console.log(
  `Số dư đầu kỳ ngày ${cutoff}: ${openingByPlayer.size} người, nợ ${openTotal.filter((v) => v < 0).reduce((s, v) => s - v, 0).toLocaleString("vi-VN")} đ, dư ${openTotal.filter((v) => v > 0).reduce((s, v) => s + v, 0).toLocaleString("vi-VN")} đ.`,
);
for (const [n, v] of [...openingByPlayer.entries()].sort((a, b) => a[1] - b[1])) {
  console.log(`   ${n}: ${v.toLocaleString("vi-VN")} đ`);
}
if (dryRun) {
  console.log("--dry-run: không ghi gì.");
  process.exit(0);
}

const idByName = new Map(existing.map((p) => [p.display_name, p.id]));
for (const [name, gender] of toCreate) {
  const { data, error } = await db.from("players").insert({ display_name: name, gender }).select("id").single();
  if (error) throw new Error(`Tạo ${name}: ${error.message}`);
  idByName.set(name, data.id);
}

if (ownerName) {
  const { error } = await db.rpc("set_court_owner", { p_player: idByName.get(ownerName), p_actor: "import" });
  if (error) throw new Error(error.message);
}

const { error: eDel } = await db.from("transactions").delete().eq("kind", "opening").eq("created_by", "import");
if (eDel) throw new Error(eDel.message);
const rows = opening
  .filter((o) => Math.round(Number(o.amount || 0)) !== 0)
  .map((o) => {
    const target = map.get(o.raw_name);
    const guest = target.kind === "guest" ? ` (${o.raw_name})` : "";
    return {
      client_request_id: `opening:${o.ref}`,
      player_id: idByName.get(target.name),
      kind: "opening",
      label: (o.label || "Số dư đầu kỳ") + guest,
      amount: Math.round(Number(o.amount)),
      txn_date: o.date && o.date <= cutoff ? o.date : cutoff,
      public_note: "Chuyển từ Google Sheets",
      internal_note: o.note || null,
      created_by: "import",
    };
  });
if (rows.length) {
  const { error } = await db.from("transactions").insert(rows);
  if (error) throw new Error(error.message);
}
await db.from("audit_log").insert({
  entity: "import",
  entity_id: cutoff,
  action: "apply",
  after: { players_created: toCreate.length, opening_rows: rows.length },
  actor: "import",
});
console.log("Đã nhập xong.");
