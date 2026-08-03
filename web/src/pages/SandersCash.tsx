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

      <div className="bg-surface border border-surface-lighter rounded-2xl p-4 md:p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((account) => {
            const member = members.find((m) => m.id === account.memberId);
            const age = member ? getAge(member.birthday) : null;

            return (
              <button
                key={account.memberId}
                onClick={() => navigate(`/sanders-cash/${account.memberId}`)}
                className="group bg-surface border-2 border-surface-lighter rounded-xl p-4 flex items-center gap-4 text-left transition-all duration-200 hover:border-primary hover:-translate-y-1 hover:shadow-lg active:scale-[0.98]"
              >
                {member?.avatarUrl ? (
                  <img src={member.avatarUrl} alt={account.memberName} className="w-20 h-20 rounded-full object-cover shadow-sm shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-bg shadow-sm shrink-0" style={{ backgroundColor: account.memberColor }}>
                    {account.memberName[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0 relative">
                  <p className="text-text-bright font-bold text-lg">{account.memberName}</p>
                  {age !== null && <p className="text-text-dim text-sm">Age {age}</p>}
                  <p className="text-accent-green font-bold text-xl mt-1">
                    ${(account.balance / 100).toFixed(2)}
                  </p>
                  <span className="text-primary absolute bottom-0 right-1 text-lg transition-transform duration-200 group-hover:translate-x-1">→</span>
                </div>
              </button>
            );
          })}
        </div>
        {accounts.length === 0 && (
          <p className="text-text-dim text-center py-4">No accounts yet — add kids in Settings</p>
        )}
      </div>

      {showAward && (
        <AwardModal accounts={accounts} onAwarded={loadAccounts} onClose={() => setShowAward(false)} />
      )}
      {showAdjust && (
        <AdjustModal accounts={accounts} onAdjusted={loadAccounts} onClose={() => setShowAdjust(false)} />
      )}
    </div>
  );
}
