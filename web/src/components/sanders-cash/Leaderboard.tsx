import type { AccountWithMember } from '../../api/client';

interface BalanceListProps {
  accounts: AccountWithMember[];
  compact?: boolean;
  onSelect?: (memberId: string) => void;
}

export function Leaderboard({ accounts, compact, onSelect }: BalanceListProps) {
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {accounts.map((account) => (
        <div
          key={account.memberId}
          className={`flex items-center gap-3 bg-surface-light rounded-xl cursor-pointer active:scale-[0.98] transition-transform ${
            compact ? 'p-2' : 'p-4'
          }`}
          onClick={() => onSelect?.(account.memberId)}
        >
          <div
            className={`rounded-full flex items-center justify-center font-bold text-bg ${
              compact ? 'w-10 h-10 text-lg' : 'w-14 h-14 text-2xl'
            }`}
            style={{ backgroundColor: account.memberColor }}
          >
            {account.memberName[0]}
          </div>

          <div className="flex-1">
            <p className={`text-text-bright font-semibold ${compact ? 'text-sm' : 'text-lg'}`}>
              {account.memberName}
            </p>
          </div>

          <div className={`font-bold text-accent-green ${compact ? 'text-lg' : 'text-2xl'}`}>
            ${(account.balance / 100).toFixed(2)}
          </div>
        </div>
      ))}

      {accounts.length === 0 && (
        <p className="text-text-dim text-center py-4">No accounts yet — add kids in Settings</p>
      )}
    </div>
  );
}
