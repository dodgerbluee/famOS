import { motion } from 'framer-motion';
import type { Reward } from '../../api/client';

interface RewardCardProps {
  reward: Reward;
  balance: number;
  onRedeem: (rewardId: string) => void;
}

export function RewardCard({ reward, balance, onRedeem }: RewardCardProps) {
  const canAfford = balance >= reward.cost;

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="bg-surface-light rounded-2xl p-4 flex flex-col"
    >
      <div className="flex-1">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-text-bright font-semibold">{reward.name}</h3>
          {reward.category && (
            <span className="text-xs bg-surface-lighter text-text-dim px-2 py-1 rounded-full">
              {reward.category}
            </span>
          )}
        </div>
        {reward.description && (
          <p className="text-text-dim text-sm mb-3">{reward.description}</p>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-accent-yellow font-bold text-lg">
          ${(reward.cost / 100).toFixed(2)}
        </span>

        {canAfford ? (
          <button
            onClick={() => onRedeem(reward.id)}
            className="bg-primary text-white px-4 py-2 rounded-xl font-medium min-h-[44px] active:scale-95 transition-transform"
          >
            Redeem
          </button>
        ) : (
          <span className="text-text-dim text-sm">
            Need ${((reward.cost - balance) / 100).toFixed(2)} more
          </span>
        )}
      </div>
    </motion.div>
  );
}
