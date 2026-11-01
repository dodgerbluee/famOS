import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FamilyTab } from '../components/settings/FamilyTab';
import { SourceManager } from '../components/calendar/SourceManager';
import { IntegrationsTab } from '../components/settings/IntegrationsTab';
import { InvitesTab } from '../components/settings/InvitesTab';
import { KiosksTab } from '../components/settings/KiosksTab';
import { SsoTab } from '../components/settings/SsoTab';

type Tab = 'family' | 'kiosks' | 'calendars' | 'integrations' | 'invites' | 'sso';

export function Settings() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const tabs: { id: Tab; label: string; permission: string }[] = [
    { id: 'family', label: 'Family', permission: 'settings.view' },
    { id: 'kiosks', label: 'Kiosks', permission: 'family.manage' },
    { id: 'sso', label: 'SSO', permission: 'settings.edit' },
    { id: 'invites', label: 'Invites', permission: 'invites.manage' },
    { id: 'calendars', label: 'Calendars', permission: 'settings.view' },
    { id: 'integrations', label: 'Integrations', permission: 'settings.edit' },
  ];

  const visible = tabs.filter((t) => hasPermission(t.permission));
  const [activeTab, setActiveTab] = useState<Tab>(visible[0]?.id ?? 'family');

  return (
    <div className="space-y-4 p-[var(--page-gutter)]">
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

      <div className="grid gap-4 min-[1100px]:grid-cols-[220px_minmax(0,1fr)]">
        <div className="scrollbar-hide -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 min-[1100px]:sticky min-[1100px]:top-4 min-[1100px]:mx-0 min-[1100px]:h-fit min-[1100px]:flex-col min-[1100px]:overflow-visible min-[1100px]:p-0">
          {visible.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[44px] whitespace-nowrap rounded-control px-4 py-2 text-left text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-brand/15 text-brand-soft ring-1 ring-brand/25'
                  : 'bg-panel text-ink-muted hover:bg-panel-hover hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-w-0">
          {activeTab === 'family' && <FamilyTab />}
          {activeTab === 'kiosks' && <KiosksTab />}
          {activeTab === 'sso' && <SsoTab />}
          {activeTab === 'invites' && <InvitesTab />}
          {activeTab === 'calendars' && <SourceManager />}
          {activeTab === 'integrations' && <IntegrationsTab />}
        </div>
      </div>
    </div>
  );
}
