import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { toCsv } from "./csv.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const file = process.argv[2];
if (!file || file.startsWith("--")) {
  console.error(
    'Cách dùng: npm run import:extract -- "<file.xlsx>" --cutoff 2026-11-24 [--recent-days 60] [--first-month 3] [--out import]',
  );
  process.exit(1);
}
const outDir = arg("out", "import");
const cutoff = arg("cutoff", "");
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
  console.error("Cần --cutoff YYYY-MM-DD (ngày chốt số dư).");
  process.exit(1);
}
const year = Number(cutoff.slice(0, 4));
const firstMonth = Number(arg("first-month", "3"));
const recentDays = Number(arg("recent-days", "60"));
const recentFrom = new Date(Date.parse(cutoff) - recentDays * 86400000).toISOString().slice(0, 10);
const SKIP_SHEETS = new Set(["cong no", "qr"]);
const FEMALE_NOTE = /(^|[\s\-(+])nữ(?!\p{L})/iu;

function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function val(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return v.result ?? null;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    return null;
  }
  return v;
}

function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return null;
}

function fmt(n) {
  return Math.round(n).toLocaleString("vi-VN");
}

function validDate(d, m) {
  if (m < 1 || m > 12 || d < 1) return null;
  if (d > new Date(Date.UTC(year, m, 0)).getUTCDate()) return null;
  if (m < firstMonth) return null;
  const iso = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return iso > cutoff ? null : iso;
}

function tabDate(tab) {
  const t = tab.trim();
  if (!/^\d{2,4}$/.test(t)) return null;
  const c = [];
  if (t.length === 4) c.push(validDate(+t.slice(0, 2), +t.slice(2)));
  if (t.length === 3) {
    c.push(validDate(+t.slice(0, 1), +t.slice(1)));
    c.push(validDate(+t.slice(0, 2), +t.slice(2)));
  }
  if (t.length === 2) c.push(validDate(+t[0], +t[1]));
  const uniq = [...new Set(c.filter(Boolean))];
  return uniq.length === 1 ? uniq[0] : null;
}

const GUEST_PREFIX = /^(b\.?|bạn|ban)\s+(.+)$/i;
const OWNER_OF = /\((?:của|cua)\s+([^)]+)\)/i;
const REVIEW_WORDS = new Set(["vang", "nu", "chu", "fbi", "doi ngoai"]);

function titleCase(s) {
  return s.trim().toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

function suggest(raw, isFemale) {
  const name = raw.trim();
  const ownerMatch = name.match(OWNER_OF);
  if (ownerMatch) return { action: "guest", host_name: titleCase(ownerMatch[1]), review: "1" };
  if (/^kh(á|a)ch/i.test(name) || /\d+\s*(ae|ace|em)\b/i.test(norm(name))) return { action: "skip", review: "1" };
  const g = name.match(GUEST_PREFIX);
  if (g) return { action: "guest", host_name: g[2].trim(), review: "" };
  const n = norm(name);
  const review = /^(e|em)[\s.]/.test(n) || /\d/.test(n) || REVIEW_WORDS.has(n) ? "1" : "";
  return { action: "member", player_name: name, gender: isFemale ? "F" : "M", review };
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);

const names = new Map();
const touch = (raw, date, female, opening) => {
  const key = raw.trim();
  if (!names.has(key)) names.set(key, { count: 0, lastSeen: "", female: false, opening: false });
  const e = names.get(key);
  e.count++;
  if (date && date > e.lastSeen) e.lastSeen = date;
  if (female) e.female = true;
  if (opening) e.opening = true;
};

wb.eachSheet((ws) => {
  if (SKIP_SHEETS.has(norm(ws.name))) return;
  let noteCol = null;
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    if (noteCol === null && norm(val(cell)) === "note") noteCol = col;
  });
  const date = tabDate(ws.name);
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r < 3) return;
    const rawName = val(row.getCell(1));
    if (typeof rawName !== "string" || !rawName.trim() || /^[\d.\s-]+$/.test(rawName)) return;
    const note = noteCol ? String(val(row.getCell(noteCol)) ?? "") : "";
    touch(rawName, date, FEMALE_NOTE.test(note), false);
  });
});

function sourceDate(buoi) {
  if (buoi instanceof Date) return buoi.toISOString().slice(0, 10);
  const m = String(buoi ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  return m ? `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

const openingRows = [];
const congNo = wb.worksheets.find((w) => norm(w.name) === "cong no");
if (congNo) {
  congNo.eachRow({ includeEmpty: false }, (row, r) => {
    if (r < 10) return;
    const buoi = val(row.getCell(4));
    const name = val(row.getCell(5));
    const open = num(val(row.getCell(8)));
    const note = val(row.getCell(9));
    if (typeof name !== "string" || !name.trim() || !open || open <= 0) return;
    openingRows.push({
      ref: `congno-${r}`,
      raw_name: name.trim(),
      date: sourceDate(buoi),
      label: `Nợ cũ ${String(buoi ?? "").trim() || "?"}`,
      amount: -Math.round(open),
      note: note === null ? "" : String(note).trim(),
    });
    touch(name.trim(), null, false, true);
  });
}

const qr = wb.worksheets.find((w) => norm(w.name) === "qr");
if (qr) {
  qr.eachRow({ includeEmpty: false }, (row, r) => {
    const name = val(row.getCell(1));
    const label = val(row.getCell(2));
    const v = num(val(row.getCell(3)));
    if (typeof name !== "string" || norm(label) !== "du" || v === null) return;
    const amount = Math.round(Math.abs(v) < 100000 ? v * 1000 : v);
    if (!amount) return;
    openingRows.push({
      ref: `qr-${r}`,
      raw_name: name.trim(),
      date: "",
      label: amount > 0 ? "Dư quỹ chuyển từ sheet" : "Nợ quỹ chuyển từ sheet",
      amount,
      note: `Tab QR: ${v}`,
    });
    touch(name.trim(), null, false, true);
  });
}

const kept = [...names.entries()].filter(([, e]) => e.opening || (e.lastSeen && e.lastSeen >= recentFrom));
const nameRows = kept
  .sort((a, b) => Number(b[1].opening) - Number(a[1].opening) || b[1].count - a[1].count || a[0].localeCompare(b[0], "vi"))
  .map(([raw, e]) => {
    const s = suggest(raw, e.female);
    return {
      raw_name: raw,
      count: e.count,
      last_seen: e.lastSeen,
      has_balance: e.opening ? "1" : "",
      action: s.action,
      player_name: s.player_name ?? "",
      gender: s.gender ?? "",
      host_name: s.host_name ?? "",
      review: s.review,
    };
  });

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "names.csv"),
  toCsv(nameRows, ["raw_name", "count", "last_seen", "has_balance", "action", "player_name", "gender", "host_name", "review"]),
);
fs.writeFileSync(path.join(outDir, "opening.csv"), toCsv(openingRows, ["ref", "raw_name", "date", "label", "amount", "note"]));

const debt = -openingRows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
const credit = openingRows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
console.log(`Tên đưa vào names.csv: ${nameRows.length} (có số dư hoặc chơi từ ${recentFrom}); bỏ qua ${names.size - nameRows.length} tên cũ hơn.`);
console.log(`Cần xem kỹ: ${nameRows.filter((r) => r.review === "1").length} tên.`);
console.log(`Số dư đầu kỳ: ${openingRows.length} dòng, nợ ${fmt(debt)} đ, dư ${fmt(credit)} đ.`);
console.log(`Đã ghi: ${path.join(outDir, "names.csv")}, ${path.join(outDir, "opening.csv")}`);
