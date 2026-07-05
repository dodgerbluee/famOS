import type { TransactionWithNames } from '../../api/client';
import { formatDate, useTimezone } from '../../lib/timezone';

interface TransactionHistoryProps {
  transactions: TransactionWithNames[];
}

export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  const timezone = useTimezone();
  return (
    <div className="space-y-2">
      {transactions.map((txn) => (
        <div
          key={txn.id}
          className="flex items-center gap-3 bg-surface-light rounded-xl p-3"
        >
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
              txn.amount > 0
                ? 'bg-accent-green/20 text-accent-green'
                : 'bg-accent-red/20 text-accent-red'
            }`}
          >
            {txn.amount > 0 ? '+' : '-'}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-text-bright text-sm font-medium truncate">
              {txn.reason}
            </p>
            <p className="text-text-dim text-xs">
              {formatTransactionDate(txn.createdAt, timezone)}
              {txn.awardedByName && ` · by ${txn.awardedByName}`}
            </p>
          </div>

          <span
            className={`font-bold text-sm ${
              txn.amount > 0 ? 'text-accent-green' : 'text-accent-red'
            }`}
          >
            {txn.amount > 0 ? '+' : ''}${(txn.amount / 100).toFixed(2)}
          </span>
        </div>
      ))}

      {transactions.length === 0 && (
        <p className="text-text-dim text-center py-4 text-sm">No transactions yet</p>
      )}
    </div>
  );
}

function formatTransactionDate(dateStr: string, timezone: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(date, timezone, { month: 'short', day: 'numeric' });
}
