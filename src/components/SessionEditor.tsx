"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeSession, FemaleMode, Gender, ItemKind } from "@/lib/calc";
import { parseAmount, vnd } from "@/lib/money";
import { guestLabel, toCalcInput } from "@/lib/session-input";
import type { Player, SessionPayload } from "@/lib/types";
import { saveSessionAction } from "@/app/admin/actions";
import SearchSelect from "./SearchSelect";

interface ItemDraft {
  key: string;
  kind: ItemKind;
  label: string;
  amountText: string;
  paidBy: string;
  memberKeys: string[];
  targetPlayerId: string;
}

interface MemberDraft {
  pkey: string;
  playerId: string;
  gender: Gender;
}

interface GuestDraft {
  pkey: string;
  hostPlayerId: string;
  gender: Gender;
  guestLabel: string;
}

const DEFAULT_SHARED = ["Tiền sân", "Tiền cầu", "Tiền nước"];

function rid(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

function amountText(n: number): string {
  return n ? String(n) : "";
}

export default function SessionEditor({
  initial,
  players,
  courtOwnerId,
}: {
  initial: SessionPayload & { id: string };
  players: Player[];
  courtOwnerId: string | null;
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const names = useMemo(() => new Map(players.map((p) => [p.id, p.display_name])), [players]);
  const dupNames = useMemo(() => {
    const c = new Map<string, number>();
    players.forEach((p) => c.set(p.display_name, (c.get(p.display_name) ?? 0) + 1));
    return c;
  }, [players]);
  const nameOf = (id: string) => {
    const p = byId.get(id);
    if (!p) return "?";
    return (dupNames.get(p.display_name) ?? 0) > 1 ? `${p.display_name} · ${p.short_code}` : p.display_name;
  };

  const [date, setDate] = useState(initial.date);
  const [title, setTitle] = useState(initial.title ?? "");
  const [internalNote, setInternalNote] = useState(initial.internalNote ?? "");
  const [members, setMembers] = useState<MemberDraft[]>(
    initial.participants
      .filter((p) => p.playerId)
      .map((p) => ({ pkey: p.pkey, playerId: p.playerId!, gender: p.gender })),
  );
  const [guests, setGuests] = useState<GuestDraft[]>(
    initial.participants
      .filter((p) => !p.playerId)
      .map((p) => ({ pkey: p.pkey, hostPlayerId: p.hostPlayerId!, gender: p.gender, guestLabel: p.guestLabel ?? "" })),
  );
  const [items, setItems] = useState<ItemDraft[]>(() => {
    const list: ItemDraft[] = initial.items.map((i) => ({
      key: i.key,
      kind: i.kind,
      label: i.label,
      amountText: amountText(i.amount),
      paidBy: i.paidBy ?? "",
      memberKeys: i.memberKeys,
      targetPlayerId: i.targetPlayerId ?? "",
    }));
    const sharedLabels = new Set(list.filter((i) => i.kind === "shared").map((i) => i.label));
    const missing = DEFAULT_SHARED.filter((l) => !sharedLabels.has(l)).map((label) => ({
      key: rid("i"),
      kind: "shared" as const,
      label,
      amountText: "",
      paidBy: "",
      memberKeys: [],
      targetPlayerId: "",
    }));
    const shared = list.filter((i) => i.kind === "shared");
    return [...shared, ...missing, ...list.filter((i) => i.kind !== "shared")];
  });
  const [femaleMode, setFemaleMode] = useState<FemaleMode>(initial.femaleMode);
  const [femaleValueText, setFemaleValueText] = useState(amountText(initial.femaleValue));
  const [ovMale, setOvMale] = useState(initial.overrideMale === null ? "" : String(initial.overrideMale));
  const [ovFemale, setOvFemale] = useState(initial.overrideFemale === null ? "" : String(initial.overrideFemale));
  const [ovReason, setOvReason] = useState(initial.overrideReason ?? "");
  const [search, setSearch] = useState("");
  const [guestHost, setGuestHost] = useState("");
  const [guestCount, setGuestCount] = useState("1");
  const [guestGender, setGuestGender] = useState<Gender>("M");
  const [guestNote, setGuestNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  const memberIds = new Set(members.map((m) => m.playerId));
  const selectable = players.filter((p) => p.is_active || memberIds.has(p.id));
  const q = search.trim().toLowerCase();
  const filtered = selectable.filter(
    (p) => !q || p.display_name.toLowerCase().includes(q) || p.short_code.toLowerCase().includes(q),
  );

  const allParticipants = [
    ...members.map((m) => ({ pkey: m.pkey, label: nameOf(m.playerId), billedTo: m.playerId })),
    ...guests.map((g) => ({ pkey: g.pkey, label: guestLabel(nameOf(g.hostPlayerId), g.guestLabel), billedTo: g.hostPlayerId })),
  ];
  const billedPlayers = [...new Set(allParticipants.map((p) => p.billedTo))];

  const inputErrors: string[] = [];
  const parse = (text: string, label: string, allowNegative = false): number => {
    if (!text.trim()) return 0;
    const v = parseAmount(text);
    if (v === null || (!allowNegative && v < 0)) {
      inputErrors.push(`Số tiền "${label}" không hợp lệ.`);
      return 0;
    }
    return v;
  };
  const parseOptional = (text: string, label: string): number | null => {
    if (!text.trim()) return null;
    const v = parseAmount(text);
    if (v === null || v < 0) {
      inputErrors.push(`${label} không hợp lệ.`);
      return null;
    }
    return v;
  };

  const payload: SessionPayload = {
    id: initial.id,
    date,
    title,
    internalNote,
    femaleMode,
    femaleValue: parse(femaleValueText, "mức nữ"),
    overrideMale: parseOptional(ovMale, "Suất nam chỉnh tay"),
    overrideFemale: parseOptional(ovFemale, "Suất nữ chỉnh tay"),
    overrideReason: ovReason,
    participants: [
      ...members.map((m) => ({ pkey: m.pkey, playerId: m.playerId, hostPlayerId: null, guestLabel: "", gender: m.gender })),
      ...guests.map((g) => ({ pkey: g.pkey, playerId: null, hostPlayerId: g.hostPlayerId, guestLabel: g.guestLabel, gender: g.gender })),
    ],
    items: items.map((i) => ({
      key: i.key,
      kind: i.kind,
      label: i.label,
      amount: parse(i.amountText, i.label || "khoản", i.kind === "personal"),
      paidBy: i.paidBy || null,
      memberKeys: i.memberKeys.filter((k) => allParticipants.some((p) => p.pkey === k)),
      targetPlayerId: i.targetPlayerId || null,
    })),
  };
  const calc = computeSession(toCalcInput({ ...payload, items: payload.items.filter((i) => i.amount !== 0) }, courtOwnerId, names));
  const femaleCount = calc.femaleCount;

  const toggleMember = (p: Player) => {
    if (memberIds.has(p.id)) setMembers(members.filter((m) => m.playerId !== p.id));
    else setMembers([...members, { pkey: `p:${p.id}`, playerId: p.id, gender: p.gender }]);
  };
  const updateItem = (key: string, patch: Partial<ItemDraft>) =>
    setItems(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const removeItem = (key: string) => setItems(items.filter((i) => i.key !== key));
  const addItem = (kind: ItemKind) =>
    setItems([
      ...items,
      {
        key: rid("i"),
        kind,
        label: kind === "shared" ? "Khoản chung khác" : kind === "group" ? "" : "",
        amountText: "",
        paidBy: "",
        memberKeys: kind === "group" ? allParticipants.map((p) => p.pkey) : [],
        targetPlayerId: "",
      },
    ]);

  const addGuests = () => {
    const n = Math.max(1, Math.min(20, parseInt(guestCount, 10) || 1));
    if (!guestHost) return;
    const add: GuestDraft[] = Array.from({ length: n }, () => ({
      pkey: rid("g:"),
      hostPlayerId: guestHost,
      gender: guestGender,
      guestLabel: guestNote.trim(),
    }));
    setGuests([...guests, ...add]);
    setGuestCount("1");
    setGuestNote("");
  };

  const submit = async (close: boolean) => {
    setBusy(true);
    setServerErrors([]);
    setMessage("");
    try {
      const res = await saveSessionAction(payload, close);
      if (!res.ok) {
        setServerErrors(res.errors ?? ["Có lỗi."]);
      } else {
        setMessage(close ? "Đã chốt buổi." : "Đã lưu nháp.");
        router.refresh();
      }
    } catch (e) {
      setServerErrors([e instanceof Error ? e.message : "Có lỗi."]);
    } finally {
      setBusy(false);
      setConfirmClose(false);
    }
  };

  const playerOptions = players
    .filter((p) => p.is_active)
    .map((p) => ({ value: p.id, label: nameOf(p.id), hint: p.short_code }));
  const billedOptions = billedPlayers.map((id) => ({ value: id, label: nameOf(id), hint: byId.get(id)?.short_code }));
  const shared = items.filter((i) => i.kind === "shared");
  const groups = items.filter((i) => i.kind === "group");
  const personal = items.filter((i) => i.kind === "personal");
  const blocking = [...inputErrors, ...calc.errors];
  if (calc.manual && !ovReason.trim()) blocking.push("Nhập lý do chỉnh tay mức thu trước khi chốt.");

  return (
    <div className="stack">
      <div className="card">
        <h2>Thông tin buổi</h2>
        <div className="row">
          <label>
            Ngày
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Tên buổi / ca (tuỳ chọn)
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Sân A, ca 1" />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="hstack">
          <h2 style={{ margin: 0 }}>Người có mặt</h2>
          <span className="spacer" />
          <span className="muted">
            {calc.maleCount} nam · {calc.femaleCount} nữ
          </span>
        </div>
        <input
          type="search"
          placeholder="Tìm tên hoặc mã…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ margin: "10px 0" }}
        />
        <div className="checklist">
          {filtered.map((p) => (
            <label key={p.id}>
              <input type="checkbox" checked={memberIds.has(p.id)} onChange={() => toggleMember(p)} />
              <span>
                {nameOf(p.id)} <span className="muted small">{p.gender === "F" ? "nữ" : ""}</span>
              </span>
            </label>
          ))}
        </div>
        {members.length > 0 && (
          <>
            <h3>Đã chọn ({members.length})</h3>
            <div className="hstack">
              {members.map((m) => (
                <span key={m.pkey} className="badge">
                  {nameOf(m.playerId)}{" "}
                  <button
                    type="button"
                    className="link small"
                    title="Đổi nhóm tính phí riêng buổi này"
                    onClick={() =>
                      setMembers(members.map((x) => (x.pkey === m.pkey ? { ...x, gender: x.gender === "M" ? "F" : "M" } : x)))
                    }
                  >
                    {m.gender === "M" ? "Nam" : "Nữ"}
                  </button>
                </span>
              ))}
            </div>
          </>
        )}

        <h3>Khách</h3>
        <div className="row">
          <label>
            Khách của
            <SearchSelect options={playerOptions} value={guestHost} onChange={setGuestHost} placeholder="— Chọn người mời —" />
          </label>
          <label style={{ flex: "0 1 90px" }}>
            Số khách
            <input type="text" inputMode="numeric" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
          </label>
          <label style={{ flex: "0 1 110px" }}>
            Nhóm
            <select value={guestGender} onChange={(e) => setGuestGender(e.target.value as Gender)}>
              <option value="M">Nam</option>
              <option value="F">Nữ</option>
            </select>
          </label>
          <label>
            Ghi chú (tuỳ chọn)
            <input type="text" value={guestNote} onChange={(e) => setGuestNote(e.target.value)} placeholder="VD: bạn cùng công ty" />
          </label>
          <button type="button" onClick={addGuests} disabled={!guestHost} style={{ flex: "0 0 auto" }}>
            Thêm khách
          </button>
        </div>
        {guests.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {guests.map((g) => (
              <div key={g.pkey} className="hstack line-item">
                <span>{guestLabel(nameOf(g.hostPlayerId), g.guestLabel)}</span>
                <span className="muted small">{g.gender === "M" ? "Nam" : "Nữ"}</span>
                <span className="spacer" />
                <button type="button" className="link danger" onClick={() => setGuests(guests.filter((x) => x.pkey !== g.pkey))}>
                  Bỏ
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Chi phí chung</h2>
        <p className="muted small">Nhập số đầy đủ hoặc dạng 60k. Ai đã trả: mặc định chủ sân.</p>
        {shared.map((i) => (
          <div key={i.key} className="row" style={{ marginBottom: 8 }}>
            <label>
              Khoản
              <input type="text" value={i.label} onChange={(e) => updateItem(i.key, { label: e.target.value })} />
            </label>
            <label>
              Số tiền
              <input type="text" inputMode="numeric" value={i.amountText} onChange={(e) => updateItem(i.key, { amountText: e.target.value })} />
            </label>
            <label>
              Ai đã trả
              <SearchSelect options={playerOptions} value={i.paidBy} onChange={(v) => updateItem(i.key, { paidBy: v })} emptyLabel="Chủ sân" />
            </label>
            <button type="button" className="link danger" style={{ flex: "0 0 auto" }} onClick={() => removeItem(i.key)}>
              Xoá
            </button>
          </div>
        ))}
        <button type="button" onClick={() => addItem("shared")}>
          + Khoản chung khác
        </button>
        <div className="hstack" style={{ marginTop: 10 }}>
          <strong>Tổng chi phí chung</strong>
          <span className="spacer" />
          <strong className="num">{vnd(calc.sharedTotal)}</strong>
        </div>
      </div>

      {femaleCount > 0 && (
        <div className="card">
          <h2>Phí của nữ</h2>
          <div className="row">
            <label className="inline">
              <input type="radio" checked={femaleMode === "discount"} onChange={() => setFemaleMode("discount")} />
              Giảm so với suất nam
            </label>
            <label className="inline">
              <input type="radio" checked={femaleMode === "fixed"} onChange={() => setFemaleMode("fixed")} />
              Suất nữ cố định
            </label>
            <label>
              {femaleMode === "discount" ? "Mỗi nữ được giảm" : "Mỗi nữ đóng"}
              <input type="text" inputMode="numeric" value={femaleValueText} onChange={(e) => setFemaleValueText(e.target.value)} placeholder="VD: 8k" />
            </label>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Khoản chia nhóm</h2>
        <p className="muted small">VD: ăn uống sau buổi, chỉ chia cho những người tham gia.</p>
        {groups.map((i) => (
          <div key={i.key} className="card" style={{ background: "transparent" }}>
            <div className="row">
              <label>
                Khoản
                <input type="text" value={i.label} onChange={(e) => updateItem(i.key, { label: e.target.value })} placeholder="VD: Ăn gà" />
              </label>
              <label>
                Tổng tiền
                <input type="text" inputMode="numeric" value={i.amountText} onChange={(e) => updateItem(i.key, { amountText: e.target.value })} />
              </label>
              <label>
                Ai đã trả
                <SearchSelect options={playerOptions} value={i.paidBy} onChange={(v) => updateItem(i.key, { paidBy: v })} emptyLabel="Chủ sân" />
              </label>
              <button type="button" className="link danger" style={{ flex: "0 0 auto" }} onClick={() => removeItem(i.key)}>
                Xoá
              </button>
            </div>
            <div className="hstack" style={{ marginTop: 8 }}>
              <span className="muted small">Chia cho ({i.memberKeys.length} người)</span>
              <button type="button" className="link small" onClick={() => updateItem(i.key, { memberKeys: allParticipants.map((p) => p.pkey) })}>
                Chọn tất cả
              </button>
              <button type="button" className="link small" onClick={() => updateItem(i.key, { memberKeys: [] })}>
                Bỏ chọn
              </button>
            </div>
            <div className="checklist">
              {allParticipants.map((p) => (
                <label key={p.pkey}>
                  <input
                    type="checkbox"
                    checked={i.memberKeys.includes(p.pkey)}
                    onChange={(e) =>
                      updateItem(i.key, {
                        memberKeys: e.target.checked ? [...i.memberKeys, p.pkey] : i.memberKeys.filter((k) => k !== p.pkey),
                      })
                    }
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => addItem("group")}>
          + Khoản chia nhóm
        </button>
      </div>

      <div className="card">
        <h2>Khoản cá nhân</h2>
        <p className="muted small">Cộng thêm (VD: 8k nước riêng) hoặc trừ đi (VD: −15k không dùng nước). Không làm tròn.</p>
        {personal.map((i) => (
          <div key={i.key} className="row" style={{ marginBottom: 8 }}>
            <label>
              Người
              <SearchSelect
                options={billedOptions}
                value={i.targetPlayerId}
                onChange={(v) => updateItem(i.key, { targetPlayerId: v })}
                placeholder="— Chọn —"
              />
            </label>
            <label>
              Lý do
              <input type="text" value={i.label} onChange={(e) => updateItem(i.key, { label: e.target.value })} placeholder="VD: Nước riêng" />
            </label>
            <label>
              Số tiền (+/−)
              <input type="text" value={i.amountText} onChange={(e) => updateItem(i.key, { amountText: e.target.value })} placeholder="VD: 8k hoặc -15k" />
            </label>
            <button type="button" className="link danger" style={{ flex: "0 0 auto" }} onClick={() => removeItem(i.key)}>
              Xoá
            </button>
          </div>
        ))}
        <button type="button" onClick={() => addItem("personal")}>
          + Khoản cá nhân
        </button>
      </div>

      <div className="card">
        <h2>Xem trước</h2>
        {blocking.map((e, i) => (
          <div key={i} className="alert error">
            {e}
          </div>
        ))}
        {calc.warnings.map((w, i) => (
          <div key={i} className="alert warn">
            {w}
          </div>
        ))}
        <div className="grid-stats">
          <div className="stat">
            <div className="muted small">Chi phí thực tế</div>
            <div className="value">{vnd(calc.sharedTotal + calc.groups.reduce((s, g) => s + (payload.items.find((i) => i.key === g.key)?.amount ?? 0), 0))}</div>
          </div>
          <div className="stat">
            <div className="muted small">Tổng phải thu</div>
            <div className="value">{vnd(calc.totalDue)}</div>
          </div>
          <div className="stat">
            <div className="muted small">Chênh lệch chủ sân</div>
            <div className={`value ${calc.roundingDiff < 0 ? "debt" : ""}`}>{vnd(calc.roundingDiff)}</div>
          </div>
          {calc.maleShare !== null && (
            <div className="stat">
              <div className="muted small">Suất nam</div>
              <div className="value">{vnd(calc.maleShare)}</div>
            </div>
          )}
          {calc.femaleShare !== null && (
            <div className="stat">
              <div className="muted small">Suất nữ</div>
              <div className="value">{vnd(calc.femaleShare)}</div>
            </div>
          )}
        </div>
        {calc.explanation.length > 0 && (
          <div className="alert warn" style={{ marginTop: 12 }}>
            {calc.explanation.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Người trả</th>
                <th>Chi tiết</th>
                <th className="num">Phải trả</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(calc.chargesByPlayer).map(([pid, c]) => (
                <tr key={pid}>
                  <td>
                    {nameOf(pid)}
                    {pid === courtOwnerId ? <span className="muted small"> (chủ sân, tự thanh toán)</span> : null}
                  </td>
                  <td className="small muted">{c.parts.map((p) => `${p.label} ${vnd(p.amount)}`).join(" · ")}</td>
                  <td className="num">{vnd(c.total)}</td>
                </tr>
              ))}
              {Object.entries(calc.creditsByPlayer).map(([pid, c]) => (
                <tr key={`c-${pid}`}>
                  <td>{nameOf(pid)}</td>
                  <td className="small muted">{c.parts.map((p) => p.label).join(" · ")}</td>
                  <td className="num credit">+{vnd(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Chỉnh tay mức thu (tuỳ chọn)</h3>
        <div className="row">
          <label>
            Suất nam
            <input type="text" inputMode="numeric" value={ovMale} onChange={(e) => setOvMale(e.target.value)} placeholder="Để trống = theo công thức" />
          </label>
          <label>
            Suất nữ
            <input type="text" inputMode="numeric" value={ovFemale} onChange={(e) => setOvFemale(e.target.value)} placeholder="Để trống = theo công thức" />
          </label>
        </div>
        {(ovMale.trim() || ovFemale.trim()) && (
          <label style={{ marginTop: 8 }}>
            Lý do chỉnh tay (bắt buộc, người chơi thấy)
            <input type="text" value={ovReason} onChange={(e) => setOvReason(e.target.value)} placeholder="VD: chênh lệch lớn, cả nhóm thống nhất làm tròn lên" />
          </label>
        )}
      </div>

      <div className="card">
        <label>
          Ghi chú nội bộ (người chơi không thấy)
          <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
        </label>
      </div>

      <div className="card">
        {serverErrors.map((e, i) => (
          <div key={i} className="alert error">
            {e}
          </div>
        ))}
        {message && <div className="alert ok">{message}</div>}
        <div className="hstack">
          <button type="button" disabled={busy} onClick={() => submit(false)}>
            Lưu nháp
          </button>
          {!confirmClose ? (
            <button type="button" className="primary" disabled={busy || blocking.length > 0} onClick={() => setConfirmClose(true)}>
              Chốt buổi
            </button>
          ) : (
            <>
              <span>
                Chốt với tổng thu <strong>{vnd(calc.totalDue)}</strong>, chênh lệch chủ sân <strong>{vnd(calc.roundingDiff)}</strong>?
              </span>
              <button type="button" className="primary" disabled={busy} onClick={() => submit(true)}>
                Xác nhận chốt
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirmClose(false)}>
                Huỷ
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
