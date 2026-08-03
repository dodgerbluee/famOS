import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AccountWithMember, type FamilyMember } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { AwardModal } from '../components/sanders-cash/AwardModal';
import { AdjustModal } from '../components/sanders-cash/AdjustModal';

function getAge(birthday: string): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function SandersCash() {
  const [accounts, setAccounts] = useState<AccountWithMember[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [showAward, setShowAward] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const navigate = useNavigate();

  const loadAccounts = useCallback(() => {
    api.get<AccountWithMember[]>('/api/sanders-cash/accounts').then(setAccounts).catch(() => {});
  }, []);

  useEffect(() => {
    loadAccounts();
    api.get<FamilyMember[]>('/api/family').then(setMembers).catch(() => {});
  }, [loadAccounts]);

  useWebSocket((msg) => {
    if (msg.type === 'sanders_cash_accounts') {
      setAccounts(msg.payload as AccountWithMember[]);
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold text-text-bright">Sanders Cash</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAward(true)}
            className="bg-primary text-white text-sm font-medium px-3 py-2 min-h-[44px] rounded-xl active:scale-95 transition-transform"
          >
            + Award
          </button>
          <button
            onClick={() => setShowAdjust(true)}
            className="bg-surface-light text-text-bright text-sm font-medium px-3 py-2 min-h-[44px] rounded-xl active:scale-95 transition-transform"
          >
            Adjust
          </button>
          <button
            onClick={() => navigate('/sanders-cash/store')}
            className="text-primary-light text-sm font-medium px-3 py-2 min-h-[44px]"
          >
            Store →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {accounts.map((account) => {
          const member = members.find((m) => m.id === account.memberId);
          const age = member ? getAge(member.birthday) : null;

          return (
            <button
              key={account.memberId}
              onClick={() => navigate(`/sanders-cash/${account.memberId}`)}
              className="bg-surface rounded-2xl p-5 flex flex-col items-center gap-3 hover:bg-surface-light active:scale-[0.98] transition-all"
            >
              {member?.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt={account.memberName}
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-bg"
                  style={{ backgroundColor: account.memberColor }}
                >
                  {account.memberName[0]}
                </div>
              )}
              <div className="text-center">
                <p className="text-text-bright font-semibold text-lg">{account.memberName}</p>
                {age !== null && <p className="text-text-dim text-sm">Age {age}</p>}
              </div>
              <p className="text-accent-green font-bold text-2xl">
                ${(account.balance / 100).toFixed(2)}
              </p>
            </button>
          );
        })}
      </div>

      {accounts.length === 0 && (
        <p className="text-text-dim text-center py-8">No accounts yet — add kids in Settings</p>
      )}

      {showAward && (
        <AwardModal accounts={accounts} onAwarded={loadAccounts} onClose={() => setShowAward(false)} />
      )}
      {showAdjust && (
        <AdjustModal accounts={accounts} onAdjusted={loadAccounts} onClose={() => setShowAdjust(false)} />
      )}
    </div>
  );
}
