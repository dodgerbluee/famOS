import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FamilyTab } from '../components/settings/FamilyTab';
import { SourceManager } from '../components/calendar/SourceManager';
import { IntegrationSettings } from '../components/settings/IntegrationSettings';
import { AIProviderSettings } from '../components/settings/AIProviderSettings';
import { InvitesTab } from '../components/settings/InvitesTab';

type Tab = 'family' | 'calendars' | 'integrations' | 'ai' | 'invites';

export function Settings() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const tabs: { id: Tab; label: string; permission: string }[] = [
    { id: 'family', label: 'Family', permission: 'settings.view' },
    { id: 'invites', label: 'Invites', permission: 'invites.manage' },
    { id: 'calendars', label: 'Calendars', permission: 'settings.view' },
    { id: 'integrations', label: 'Integrations', permission: 'settings.edit' },
    { id: 'ai', label: 'AI', permission: 'settings.edit' },
  ];

  const visible = tabs.filter((t) => hasPermission(t.permission));
  const [activeTab, setActiveTab] = useState<Tab>(visible[0]?.id ?? 'family');

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold text-text-bright">Settings</h1>
        {hasPermission('settings.view') && (
          <button
            onClick={() => navigate('/batch')}
            className="text-primary-light text-sm font-medium min-h-[44px] px-2 flex items-center"
          >
            Batch Jobs →
          </button>
        )}
      </header>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {visible.map((tab) => (
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

      {activeTab === 'family' && <FamilyTab />}
      {activeTab === 'invites' && <InvitesTab />}
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
