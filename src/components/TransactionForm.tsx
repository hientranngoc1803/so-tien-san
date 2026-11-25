"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { parseAmount, vnd } from "@/lib/money";
import type { Player } from "@/lib/types";
import { recordTransactionAction, type TxnInput } from "@/app/admin/actions";
import SearchSelect from "./SearchSelect";

type Mode = TxnInput["mode"];

const MODES: { value: Mode; label: string }[] = [
  { value: "payment", label: "Nộp tiền" },
  { value: "prepay", label: "Nộp quỹ trước" },
  { value: "refund", label: "Hoàn tiền" },
  { value: "split", label: "Chuyển hộ nhiều người" },
  { value: "adjust", label: "Đầu kỳ / điều chỉnh" },
];

function newId(): string {
  return crypto.randomUUID();
}

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
  const [splitPayer, setSplitPayer] = useState("");
  const [splitTotal, setSplitTotal] = useState("");
  const [rows, setRows] = useState<{ playerId: string; amount: string }[]>([
    { playerId: "", amount: "" },
    { playerId: "", amount: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const active = players.filter((p) => p.is_active || p.id === playerId);
  const ownerName = players.find((p) => p.id === courtOwnerId)?.display_name ?? "Chủ sân";
  const balance = playerId ? balances[playerId] ?? 0 : null;
  const rowSum = rows.reduce((s, r) => s + (parseAmount(r.amount) ?? 0), 0);

  const reset = () => {
    setRequestId(newId());
    setAmount("");
    setBankRef("");
    setPublicNote("");
    setInternalNote("");
    setSplitPayer("");
    setSplitTotal("");
    setRows([
      { playerId: "", amount: "" },
      { playerId: "", amount: "" },
    ]);
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
        splitPayer,
        splitTotal: parseAmount(splitTotal) ?? NaN,
        splitRows: rows.map((r) => ({ playerId: r.playerId, amount: parseAmount(r.amount) ?? NaN })),
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
  const playerSelect = (value: string, onChange: (v: string) => void) => (
    <SearchSelect options={playerOptions} value={value} onChange={onChange} placeholder="— Chọn người —" />
  );

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

      {mode !== "split" ? (
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
              Người chuyển
              <input type="text" value={splitPayer} onChange={(e) => setSplitPayer(e.target.value)} placeholder="VD: Hải chuyển giúp" />
            </label>
            <label>
              Tổng số tiền nhận
              <input type="text" inputMode="numeric" value={splitTotal} onChange={(e) => setSplitTotal(e.target.value)} required />
            </label>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="row">
              <label>
                Trả cho
                {playerSelect(r.playerId, (v) => setRows(rows.map((x, j) => (j === i ? { ...x, playerId: v } : x))))}
              </label>
              <label>
                Số tiền
                <input
                  type="text"
                  inputMode="numeric"
                  value={r.amount}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                />
              </label>
              <button type="button" className="link danger" style={{ flex: "0 0 auto" }} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                Xoá
              </button>
            </div>
          ))}
          <div className="hstack">
            <button type="button" onClick={() => setRows([...rows, { playerId: "", amount: "" }])}>
              + Thêm dòng
            </button>
            <span className="spacer" />
            <span className={rowSum === (parseAmount(splitTotal) ?? 0) ? "credit" : "debt"}>
              Tổng các dòng: {vnd(rowSum)}
            </span>
          </div>
        </>
      )}

      {balance !== null && mode !== "split" && (
        <div className="muted small">
          Số dư hiện tại: <strong className={balance < 0 ? "debt" : balance > 0 ? "credit" : ""}>{vnd(balance)}</strong>
          {mode === "refund" && balance > 0 ? ` · Hoàn tối đa ${vnd(balance)}` : ""}
        </div>
      )}

      <div className="row">
        <label>
          Ngày
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {mode === "adjust" ? (
          <label>
            Tên khoản (tuỳ chọn)
            <input type="text" value={adjustLabel} onChange={(e) => setAdjustLabel(e.target.value)} placeholder="VD: Nợ cũ 22/11" />
          </label>
        ) : (
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
        {mode !== "adjust" && (
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
