"use client";

import { useActionState } from "react";
import { addPlayerAction, type PlayerFormState } from "@/app/admin/actions";

export default function AddPlayerForm() {
  const [state, action, pending] = useActionState<PlayerFormState, FormData>(addPlayerAction, {});
  return (
    <form action={action} className="stack" key={JSON.stringify(state)}>
      <div className="row">
        <label>
          Tên hiển thị
          <input type="text" name="name" required placeholder="VD: Hải Nguyễn" defaultValue={state.name ?? ""} />
        </label>
        <label style={{ flex: "0 1 140px" }}>
          Nhóm tính phí
          <select name="gender" defaultValue={state.gender ?? "M"}>
            <option value="M">Nam</option>
            <option value="F">Nữ</option>
          </select>
        </label>
        <button type="submit" className="primary" disabled={pending} style={{ flex: "0 0 auto" }}>
          Thêm
        </button>
      </div>
      {state.needConfirm && (
        <>
          <div className="alert warn">{state.warning}</div>
          <label className="inline">
            <input type="checkbox" name="confirm" value="1" /> Đây đúng là người mới
          </label>
        </>
      )}
      {state.error && <div className="alert error">{state.error}</div>}
      {state.ok && <div className="alert ok">{state.ok}</div>}
    </form>
  );
}
