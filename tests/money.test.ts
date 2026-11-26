import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, findDateInTitle, formatDateWd, formatShortDateWd } from "../src/lib/money";

test("dinh dang ngay co thu", () => {
  assert.equal(formatDateWd("2026-11-25"), "Thứ 4, 25/11/2026");
  assert.equal(formatShortDateWd("2026-11-25"), "T4 25/11");
  assert.equal(formatDateWd("2026-11-29"), "Chủ nhật, 29/11/2026");
  assert.equal(addDays("2026-12-01", -1), "2026-11-30");
});

test("nhan dien ngay trong ten buoi", () => {
  assert.deepEqual(findDateInTitle("T4 - 25/11", "2026-11-26"), { iso: "2026-11-25", stripped: "" });
  assert.deepEqual(findDateInTitle("Sân A - T4 25/11", "2026-11-26"), { iso: "2026-11-25", stripped: "Sân A" });
  assert.deepEqual(findDateInTitle("Thứ 4 (25-11) sân B", "2026-11-26"), { iso: "2026-11-25", stripped: "sân B" });
  assert.deepEqual(findDateInTitle("31/12", "2027-01-02"), { iso: "2026-12-31", stripped: "" });
  assert.deepEqual(findDateInTitle("ca 2 ngày 5/1/2027", "2027-01-05"), { iso: "2027-01-05", stripped: "ca 2 ngày" });
  assert.equal(findDateInTitle("Sân A, ca 1", "2026-11-26"), null);
  assert.equal(findDateInTitle("32/13", "2026-11-26"), null);
});
