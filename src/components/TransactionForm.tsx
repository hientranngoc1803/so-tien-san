"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { parseAmount, vnd } from "@/lib/money";
import type { Player } from "@/lib/types";
import { recordTransactionAction, type TxnInput } from "@/app/admin/actions";
import SearchSelect from "./SearchSelect";

type Mode = TxnInput["mode"];

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "payment", label: "Nộp tiền", hint: "Một người chuyển tiền cho chính mình (gồm cả phần khách mình dẫn, nộp dư cũng chọn mục này)." },
  { value: "transfer", label: "Trả hộ", hint: "Một người trả cho người chơi khác: bằng chuyển khoản mới hoặc trừ vào quỹ đang dư." },
  { value: "refund", label: "Hoàn tiền", hint: "Chủ sân trả lại tiền dư cho người chơi." },
  { value: "adjust", label: "Điều chỉnh / sửa sai", hint: "Chỉ dùng để nhập nợ/dư cũ hoặc sửa nhầm lẫn. Trả hộ người khác thì chọn “Trả hộ”." },
];

function newId(): string {
  return crypto.randomUUID();
}

const emptyRows = () => [{ playerId: "", amount: "" }];

export default function TransactionForm({
  players,
  courtOwnerId,
  balances,
  today,
  defaults,
}: {
  players: Player[];
  courtOwnerId: string | null;
  balances: Record<string, number>;
  today: string;
  defaults: { playerId: string; mode: Mode; amount: string };
}) {
  const [requestId, setRequestId] = useState(newId);
  const [mode, setMode] = useState<Mode>(defaults.mode);
  const [playerId, setPlayerId] = useState(defaults.playerId);
  const [amount, setAmount] = useState(defaults.amount);
  const [date, setDate] = useState(today);
  const [counterparty, setCounterparty] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [publicNote, setPublicNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [direction, setDirection] = useState<"debt" | "credit">("debt");
  const [adjustLabel, setAdjustLabel] = useState("");
  const [newMoney, setNewMoney] = useState("");
  const [rows, setRows] = useState<{ playerId: string; amount: string }[]>(emptyRows);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const active = players.filter((p) => p.is_active || p.id === playerId);
  const ownerName = players.find((p) => p.id === courtOwnerId)?.display_name ?? "Chủ sân";
  const nameOf = (id: string) => players.find((p) => p.id === id)?.display_name ?? "?";
  const balance = playerId ? balances[playerId] ?? 0 : null;
  const rowSum = rows.reduce((s, r) => s + (parseAmount(r.amount) ?? 0), 0);
  const newMoneyValue = newMoney.trim() ? parseAmount(newMoney) : 0;
  const payerAfter = balance !== null && newMoneyValue !== null ? balance + newMoneyValue - rowSum : null;
  const hasNewMoney = mode !== "transfer" || (newMoneyValue ?? 0) > 0;
  const modeInfo = MODES.find((m) => m.value === mode)!;

  const reset = () => {
    setRequestId(newId());
    setAmount("");
    setBankRef("");
    setPublicNote("");
    setInternalNote("");
    setNewMoney("");
    setRows(emptyRows());
    setSuccess("");
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await recordTransactionAction({
        requestId,
        mode,
        playerId,
        amount: parseAmount(amount) ?? NaN,
        date,
        counterpartyId: mode === "adjust" ? null : counterparty || null,
        direction,
        adjustLabel,
        bankRef,
        publicNote,
        internalNote,
        newMoney: newMoney.trim() ? parseAmount(newMoney) ?? NaN : null,
        transferRows: rows.map((r) => ({ playerId: r.playerId, amount: parseAmount(r.amount) ?? NaN })),
      });
      if (!res.ok) setError(res.error ?? "Có lỗi.");
      else setSuccess(res.duplicate ? "Đã ghi nhận (giao dịch này đã có, không tạo thêm bản trùng)." : "Đã ghi nhận.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const playerOptions = [...active]
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "vi"))
    .map((p) => ({ value: p.id, label: p.display_name, hint: p.short_code }));
  const playerSelect = (value: string, onChange: (v: string) => void, exclude?: string) => (
    <SearchSelect
      options={exclude ? playerOptions.filter((o) => o.value !== exclude) : playerOptions}
      value={value}
      onChange={onChange}
      placeholder="— Chọn người —"
    />
  );
  const balanceText = (n: number) => <strong className={n < 0 ? "debt" : n > 0 ? "credit" : ""}>{vnd(n)}</strong>;

  if (success) {
    return (
      <div className="card stack">
        <div className="alert ok">{success}</div>
        <div className="hstack">
          <button type="button" className="primary" onClick={reset}>
            Ghi giao dịch khác
          </button>
          <Link className="btn" href="/admin">
            Về tổng quan
          </Link>
          <Link className="btn" href="/admin/giao-dich">
            Xem lịch sử giao dịch
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="hstack">
        {MODES.map((m) => (
          <label key={m.value} className="inline">
            <input type="radio" checked={mode === m.value} onChange={() => setMode(m.value)} />
            {m.label}
          </label>
        ))}
      </div>
      <div className="muted small">{modeInfo.hint}</div>

      {mode !== "transfer" ? (
        <div className="row">
          <label>
            {mode === "refund" ? "Hoàn cho" : mode === "adjust" ? "Người" : "Người nộp"}
            {playerSelect(playerId, setPlayerId)}
          </label>
          {mode === "adjust" && (
            <label>
              Loại
              <select value={direction} onChange={(e) => setDirection(e.target.value as "debt" | "credit")}>
                <option value="debt">Ghi nợ (người này còn phải trả)</option>
                <option value="credit">Ghi dư (người này đang có tiền dư)</option>
              </select>
            </label>
          )}
          <label>
            Số tiền
            <input type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="VD: 100k" required />
          </label>
        </div>
      ) : (
        <>
          <div className="row">
            <label>
              Người trả
              {playerSelect(playerId, setPlayerId)}
            </label>
            <label>
              Tiền chuyển khoản mới (tuỳ chọn)
              <input
                type="text"
                inputMode="numeric"
                value={newMoney}
                onChange={(e) => setNewMoney(e.target.value)}
                placeholder="Để trống nếu trừ vào quỹ đang dư"
              />
            </label>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="row">
              <label>
                Trả hộ cho
                {playerSelect(r.playerId, (v) => setRows(rows.map((x, j) => (j === i ? { ...x, playerId: v } : x))), playerId)}
              </label>
              <label>
                Số tiền
                <input
                  type="text"
                  inputMode="numeric"
                  value={r.amount}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                  placeholder="VD: 90k"
                />
              </label>
              {rows.length > 1 && (
                <button type="button" className="link danger" style={{ flex: "0 0 auto" }} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  Xoá
                </button>
              )}
            </div>
          ))}
          <div>
            <button type="button" onClick={() => setRows([...rows, { playerId: "", amount: "" }])}>
              + Thêm người
            </button>
          </div>
        </>
      )}

      {balance !== null && mode !== "transfer" && (
        <div className="muted small">
          Số dư hiện tại: {balanceText(balance)}
          {mode === "refund" && balance > 0 ? ` · Hoàn tối đa ${vnd(balance)}` : ""}
        </div>
      )}
      {mode === "transfer" && balance !== null && (
        <div className="muted small">
          Quỹ của {nameOf(playerId)}: {balanceText(balance)}
          {(newMoneyValue ?? 0) > 0 && <> · nộp thêm {vnd(newMoneyValue!)}</>}
          {rowSum > 0 && <> · trả hộ −{vnd(rowSum)}</>}
          {payerAfter !== null && <> → sau giao dịch: {balanceText(payerAfter)}</>}
          {payerAfter !== null && payerAfter < 0 && rowSum > 0 && (
            <div className="debt">Quỹ không đủ: sau giao dịch {nameOf(playerId)} sẽ nợ {vnd(-payerAfter)}.</div>
          )}
        </div>
      )}

      <div className="row">
        <label>
          Ngày
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {mode === "adjust" && (
          <label>
            Tên khoản (tuỳ chọn)
            <input type="text" value={adjustLabel} onChange={(e) => setAdjustLabel(e.target.value)} placeholder="VD: Nợ cũ 22/11" />
          </label>
        )}
        {mode !== "adjust" && hasNewMoney && (
          <label>
            {mode === "refund" ? "Người chuyển trả" : "Người nhận tiền"}
            <SearchSelect
              options={playerOptions.filter((o) => o.value !== courtOwnerId)}
              value={counterparty}
              onChange={setCounterparty}
              emptyLabel={`${ownerName} (chủ sân)`}
            />
          </label>
        )}
        {mode !== "adjust" && hasNewMoney && (
          <label>
            Mã giao dịch ngân hàng (tuỳ chọn)
            <input type="text" value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
          </label>
        )}
      </div>
      <label>
        {mode === "adjust" ? "Lý do (người chơi thấy, bắt buộc)" : "Ghi chú cho người chơi"}
        <input type="text" value={publicNote} onChange={(e) => setPublicNote(e.target.value)} required={mode === "adjust"} />
      </label>
      <label>
        Ghi chú nội bộ
        <input type="text" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
      </label>
      {error && <div className="alert error">{error}</div>}
      <div>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Đang lưu…" : "Ghi nhận"}
        </button>
      </div>
    </form>
  );
}
