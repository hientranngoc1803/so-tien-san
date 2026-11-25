import { LineStatus, statusLabel } from "@/lib/ledger";

export default function StatusBadge({ status }: { status: LineStatus }) {
  return <span className={`badge ${status}`}>{statusLabel(status)}</span>;
}
