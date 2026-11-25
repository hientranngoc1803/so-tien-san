import { test } from "node:test";
import assert from "node:assert/strict";
import { isSimilarName, toAscii } from "../src/lib/names";

test("ten giong: khong dau, khoang trang, ho ten", () => {
  assert.equal(isSimilarName("Hai", "Hải"), true);
  assert.equal(isSimilarName("B. Lợi", "B Lợi"), true);
  assert.equal(isSimilarName("Hải", "Hải Nguyễn"), true);
  assert.equal(isSimilarName("Phuong", "Phương"), true);
  assert.equal(isSimilarName("Hoàng Huy", "Hoang Huyy"), true);
});

test("ten ngan khac nhau khong bao trung", () => {
  assert.equal(isSimilarName("Hai", "Thái"), false);
  assert.equal(isSimilarName("Hai", "Tài"), false);
  assert.equal(isSimilarName("Văn", "Tấn"), false);
  assert.equal(isSimilarName("Hải", "Hoàng"), false);
});

test("noi dung chuyen khoan khong dau", () => {
  assert.equal(toAscii("Đức gầy (b. Phương)"), "Duc gay b Phuong");
});
