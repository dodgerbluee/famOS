import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FamilyTab } from '../components/settings/FamilyTab';
import { SourceManager } from '../components/calendar/SourceManager';
import { IntegrationSettings } from '../components/settings/IntegrationSettings';
import { AIProviderSettings } from '../components/settings/AIProviderSettings';

type Tab = 'family' | 'calendars' | 'integrations' | 'ai';

const TABS: { id: Tab; label: string }[] = [
  { id: 'family', label: 'Family' },
  { id: 'calendars', label: 'Calendars' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'ai', label: 'AI' },
];

export function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('family');
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold text-text-bright">Settings</h1>
        <button
          onClick={() => navigate('/batch')}
          className="text-primary-light text-sm font-medium min-h-[44px] px-2 flex items-center"
        >
          Batch Jobs →
        </button>
      </header>

      {/* Tab bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium min-h-[44px] whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-primary text-white'
                : 'bg-surface text-text-dim active:bg-surface-light'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'family' && <FamilyTab />}
      {activeTab === 'calendars' && <SourceManager />}
      {activeTab === 'integrations' && <IntegrationSettings />}
      {activeTab === 'ai' && (
        <div className="bg-surface rounded-2xl p-5">
          <AIProviderSettings />
        </div>
      )}
    </div>
  );
}
