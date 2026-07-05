import { useEffect, useState, useCallback } from 'react';
import { api, type AccountWithMember, type Reward } from '../api/client';
import { RewardCard } from '../components/sanders-cash/RewardCard';

interface RedemptionWithDetails {
  id: string;
  rewardId: string;
  memberId: string;
  status: string;
  requestedAt: string;
  rewardName: string;
  rewardCost: number;
  memberName: string;
  memberColor: string;
}

export function RewardStore() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [accounts, setAccounts] = useState<AccountWithMember[]>([]);
  const [selectedKid, setSelectedKid] = useState<string | null>(null);
  const [pendingRedemptions, setPendingRedemptions] = useState<RedemptionWithDetails[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newReward, setNewReward] = useState({ name: '', description: '', cost: '', category: '' });

  const load = useCallback(() => {
    api.get<Reward[]>('/api/rewards?active=true').then(setRewards).catch(() => {});
    api.get<AccountWithMember[]>('/api/sanders-cash/accounts').then(setAccounts).catch(() => {});
    api.get<RedemptionWithDetails[]>('/api/rewards/redemptions?status=pending').then(setPendingRedemptions).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const selectedAccount = accounts.find((a) => a.memberId === selectedKid);

  const handleRedeem = async (rewardId: string) => {
    if (!selectedKid) return;
    await api.post('/api/rewards/redeem', { rewardId, memberId: selectedKid });
    load();
  };

  const handleResolve = async (redemptionId: string, status: string) => {
    await api.put(`/api/rewards/redemptions/${redemptionId}`, { status, resolvedBy: '' });
    load();
  };

  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/api/rewards', {
      name: newReward.name,
      description: newReward.description,
      cost: Math.round(parseFloat(newReward.cost) * 100),
      category: newReward.category,
    });
    setNewReward({ name: '', description: '', cost: '', category: '' });
    setShowCreate(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-bright">Reward Store</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-primary text-white px-4 py-2 rounded-xl font-medium min-h-[48px] active:scale-95 transition-transform"
        >
          {showCreate ? 'Cancel' : 'Add Reward'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreateReward} className="bg-surface rounded-2xl p-5 space-y-3">
          <input
            type="text"
            placeholder="Reward name"
            value={newReward.name}
            onChange={(e) => setNewReward({ ...newReward, name: e.target.value })}
            className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            required
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newReward.description}
            onChange={(e) => setNewReward({ ...newReward, description: e.target.value })}
            className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-3">
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Cost ($)"
              value={newReward.cost}
              onChange={(e) => setNewReward({ ...newReward, cost: e.target.value })}
              className="flex-1 bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              required
            />
            <select
              value={newReward.category}
              onChange={(e) => setNewReward({ ...newReward, category: e.target.value })}
              className="flex-1 bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none"
            >
              <option value="">Category</option>
              <option value="screen_time">Screen Time</option>
              <option value="toys">Toys</option>
              <option value="experiences">Experiences</option>
              <option value="treats">Treats</option>
              <option value="other">Other</option>
            </select>
          </div>
          <button
            type="submit"
            className="w-full bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px]"
          >
            Create Reward
          </button>
        </form>
      )}

      {pendingRedemptions.length > 0 && (
        <div className="bg-surface rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-accent-yellow mb-3">
            Pending Approvals ({pendingRedemptions.length})
          </h2>
          <div className="space-y-2">
            {pendingRedemptions.map((rd) => (
              <div key={rd.id} className="flex items-center gap-3 bg-surface-light rounded-xl p-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-bg"
                  style={{ backgroundColor: rd.memberColor }}
                >
                  {rd.memberName[0]}
                </div>
                <div className="flex-1">
                  <p className="text-text-bright text-sm font-medium">
                    {rd.memberName} wants <strong>{rd.rewardName}</strong>
                  </p>
                  <p className="text-text-dim text-xs">${(rd.rewardCost / 100).toFixed(2)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResolve(rd.id, 'approved')}
                    className="bg-accent-green text-bg px-3 py-2 rounded-lg font-medium min-h-[44px] text-sm"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleResolve(rd.id, 'denied')}
                    className="bg-accent-red text-bg px-3 py-2 rounded-lg font-medium min-h-[44px] text-sm"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-surface rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-text-bright mb-3">Select Kid</h2>
        <div className="flex gap-2 flex-wrap">
          {accounts.map((account) => (
            <button
              key={account.memberId}
              onClick={() => setSelectedKid(account.memberId)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] ${
                selectedKid === account.memberId
                  ? 'ring-2 ring-primary scale-105'
                  : 'bg-surface-light'
              }`}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-bg"
                style={{ backgroundColor: account.memberColor }}
              >
                {account.memberName[0]}
              </div>
              <span className="text-text-bright">{account.memberName}</span>
              <span className="text-accent-green text-sm font-bold">
                ${(account.balance / 100).toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rewards.map((reward) => (
          <RewardCard
            key={reward.id}
            reward={reward}
            balance={selectedAccount?.balance ?? 0}
            onRedeem={handleRedeem}
          />
        ))}
      </div>

      {rewards.length === 0 && (
        <div className="bg-surface rounded-2xl p-6 text-center">
          <p className="text-text-dim">No rewards yet — add some above!</p>
        </div>
      )}
    </div>
  );
}
