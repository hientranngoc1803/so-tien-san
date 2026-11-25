import { loadLedger } from "@/lib/data";
import TransactionForm from "@/components/TransactionForm";
import { todayVN } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function NewTxnPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string; mode?: string; amount?: string }>;
}) {
  const sp = await searchParams;
  const ledger = await loadLedger();
  const balances: Record<string, number> = {};
  for (const [id, b] of ledger.books) balances[id] = b.balance;
  const mode = ["payment", "prepay", "refund", "split", "adjust"].includes(sp.mode ?? "") ? (sp.mode as "payment") : "payment";
  return (
    <>
      <h1>Ghi nhận tiền</h1>
      <TransactionForm
        players={ledger.players}
        courtOwnerId={ledger.courtOwner?.id ?? null}
        balances={balances}
        today={todayVN()}
        defaults={{ playerId: sp.player ?? "", mode, amount: sp.amount ?? "" }}
      />
    </>
  );
}
