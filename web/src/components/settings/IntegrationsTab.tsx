import { useEffect, useState } from 'react';
import { api, type Camera } from '../../api/client';
import { AIProviderSettings } from './AIProviderSettings';
import { useCurrencyName, invalidateCurrencyNameCache } from '../../hooks/useCurrencyName';

type Settings = Record<string, string>;
import type { RewardPreset } from '../sanders-cash/AwardModal';

type Section = 'family' | 'sanders-cash' | 'frigate' | 'mqtt' | 'gatus' | 'overseerr' | 'vikunja' | 'immich' | 'weather' | 'ai';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'family', label: 'Family' },
  { id: 'sanders-cash', label: 'Cash' },
  { id: 'frigate', label: 'Frigate' },
  { id: 'mqtt', label: 'MQTT' },
  { id: 'gatus', label: 'Gatus' },
  { id: 'overseerr', label: 'Overseerr' },
  { id: 'vikunja', label: 'Vikunja' },
  { id: 'immich', label: 'Immich' },
  { id: 'weather', label: 'Weather' },
  { id: 'ai', label: 'AI Providers' },
];

function parseCameraFitModes(raw: string): Record<string, 'cover' | 'contain'> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value === 'cover' || value === 'contain') as Array<[string, 'cover' | 'contain']>
    );
  } catch {
    return {};
  }
}

export function IntegrationsTab() {
  const currencyName = useCurrencyName();
  const [active, setActive] = useState<Section>('family');
  const [familyName, setFamilyName] = useState('');
  const [currencyNameOverride, setCurrencyNameOverride] = useState('');
  const [familySaving, setFamilySaving] = useState(false);
  const [familySaved, setFamilySaved] = useState(false);
  const [frigateUrl, setFrigateUrl] = useState('');
  const [frigateUser, setFrigateUser] = useState('');
  const [frigatePass, setFrigatePass] = useState('');
  const [mqttHost, setMqttHost] = useState('');
  const [mqttPort, setMqttPort] = useState('1883');
  const [mqttUser, setMqttUser] = useState('');
  const [mqttPass, setMqttPass] = useState('');
  const [mqttDiscoveryPrefix, setMqttDiscoveryPrefix] = useState('homeassistant');
  const [mqttBaseTopic, setMqttBaseTopic] = useState('frigate');
  const [mqttClientId, setMqttClientId] = useState('sandershome');
  const [locationLat, setLocationLat] = useState('');
  const [locationLon, setLocationLon] = useState('');
  const [gatusUrl, setGatusUrl] = useState('');
  const [seerrUrl, setSeerrUrl] = useState('');
  const [seerrApiKey, setSeerrApiKey] = useState('');
  const [vikunjaUrl, setVikunjaUrl] = useState('');
  const [vikunjaApiKey, setVikunjaApiKey] = useState('');
  const [vikunjaProjects, setVikunjaProjects] = useState<{ id: number; title: string }[]>([]);
  const [vikunjaExcludedProjects, setVikunjaExcludedProjects] = useState<number[]>([]);
  const [immichUrl, setImmichUrl] = useState('');
  const [immichApiKey, setImmichApiKey] = useState('');
  const [screensaverAlbumId, setScreensaverAlbumId] = useState('');
  const [screensaverTimeout, setScreensaverTimeout] = useState('300');
  const [immichTesting, setImmichTesting] = useState(false);
  const [immichTestResult, setImmichTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [mqttSaving, setMqttSaving] = useState(false);
  const [mqttSaved, setMqttSaved] = useState(false);
  const [mqttTesting, setMqttTesting] = useState(false);
  const [mqttTestResult, setMqttTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [motionAlertLabels, setMotionAlertLabels] = useState('person, package');
  const [motionAlertCameras, setMotionAlertCameras] = useState<string[]>([]);
  const [availableCameras, setAvailableCameras] = useState<Camera[]>([]);
  const [cameraFitModes, setCameraFitModes] = useState<Record<string, 'cover' | 'contain'>>({});
  const [cashPresets, setCashPresets] = useState<RewardPreset[]>([
    { reason: 'Great job!', amount: 500 },
    { reason: 'Chores done', amount: 500 },
    { reason: 'Being kind', amount: 1000 },
    { reason: 'Good grades', amount: 2000 },
    { reason: 'Helping out', amount: 500 },
  ]);
  const [cashSaving, setCashSaving] = useState(false);
  const [cashSaved, setCashSaved] = useState(false);

  useEffect(() => {
    api.get<Settings>('/api/settings').then((s) => {
      setFamilyName(s.family_name || '');
      setCurrencyNameOverride(s.currency_name || '');
      setFrigateUrl(s.frigate_url || '');
      setFrigateUser(s.frigate_username || '');
      setFrigatePass(s.frigate_password || '');
      setMqttHost(s.mqtt_host || '');
      setMqttPort(s.mqtt_port || '1883');
      setMqttUser(s.mqtt_username || '');
      setMqttPass(s.mqtt_password || '');
      setMqttDiscoveryPrefix(s.mqtt_discovery_prefix || 'homeassistant');
      setMqttBaseTopic(s.mqtt_base_topic || 'frigate');
      setMqttClientId(s.mqtt_client_id || 'sandershome');
      setMotionAlertLabels(s.motion_alert_labels || 'person, package');
      setMotionAlertCameras((s.motion_alert_cameras || '').split(',').map((v) => v.trim()).filter(Boolean));
      setCameraFitModes(parseCameraFitModes(s.camera_fit_modes || ''));
      setLocationLat(s.location_lat || '');
      setLocationLon(s.location_lon || '');
      setGatusUrl(s.gatus_url || '');
      setSeerrUrl(s.seerr_url || '');
      setSeerrApiKey(s.seerr_api_key || '');
      setVikunjaUrl(s.vikunja_url || '');
      setVikunjaApiKey(s.vikunja_api_key || '');
      try {
        const ids = JSON.parse(s.vikunja_excluded_projects || '[]');
        if (Array.isArray(ids)) setVikunjaExcludedProjects(ids);
      } catch { /* use default */ }
      setImmichUrl(s.immich_url || '');
      setImmichApiKey(s.immich_api_key || '');
      setScreensaverAlbumId(s.screensaver_album_id || '');
      setScreensaverTimeout(s.screensaver_timeout || '300');
      if (s.sanders_cash_presets) {
        try {
          const parsed = JSON.parse(s.sanders_cash_presets) as RewardPreset[];
          if (parsed.length > 0) setCashPresets(parsed);
        } catch { /* use defaults */ }
      }
    }).catch(() => {});

    api.get<Camera[]>('/api/cameras').then(setAvailableCameras).catch(() => {});
    api.get<{ id: number; title: string }[]>('/api/vikunja/projects').then(setVikunjaProjects).catch(() => {});
  }, []);

  const saveAll = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/api/settings', {
        frigate_url: frigateUrl, frigate_username: frigateUser, frigate_password: frigatePass,
        mqtt_host: mqttHost, mqtt_port: mqttPort, mqtt_username: mqttUser, mqtt_password: mqttPass,
        mqtt_discovery_prefix: mqttDiscoveryPrefix, mqtt_base_topic: mqttBaseTopic, mqtt_client_id: mqttClientId,
        motion_alert_labels: motionAlertLabels, motion_alert_cameras: motionAlertCameras.join(', '),
        camera_fit_modes: JSON.stringify(cameraFitModes),
        location_lat: locationLat, location_lon: locationLon,
        gatus_url: gatusUrl, seerr_url: seerrUrl, seerr_api_key: seerrApiKey,
        vikunja_url: vikunjaUrl, vikunja_api_key: vikunjaApiKey,
        vikunja_excluded_projects: JSON.stringify(vikunjaExcludedProjects),
        immich_url: immichUrl, immich_api_key: immichApiKey,
        screensaver_album_id: screensaverAlbumId, screensaver_timeout: screensaverTimeout,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const testFrigate = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await saveAll();
      const res = await api.get<{ available: boolean }>('/api/cameras/status');
      setTestResult(res.available
        ? { ok: true, msg: 'Connected to Frigate' }
        : { ok: false, msg: 'Frigate not reachable' }
      );
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const saveMqtt = async () => {
    setMqttSaving(true);
    setMqttSaved(false);
    try {
      await api.put('/api/settings', {
        mqtt_host: mqttHost, mqtt_port: mqttPort, mqtt_username: mqttUser, mqtt_password: mqttPass,
        mqtt_discovery_prefix: mqttDiscoveryPrefix, mqtt_base_topic: mqttBaseTopic, mqtt_client_id: mqttClientId,
      });
      setMqttSaved(true);
      setTimeout(() => setMqttSaved(false), 3000);
    } finally {
      setMqttSaving(false);
    }
  };

  const testMqtt = async () => {
    setMqttTesting(true);
    setMqttTestResult(null);
    try {
      const res = await api.post<{ ok: boolean; msg: string }>('/api/settings/mqtt/test', {
        host: mqttHost, port: mqttPort, username: mqttUser, password: mqttPass, clientId: mqttClientId,
      });
      setMqttTestResult(res);
    } catch (e) {
      setMqttTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Connection failed' });
    } finally {
      setMqttTesting(false);
    }
  };

  const inputClass = 'w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary';
  const saveBtn = (onClick: () => void, loading: boolean, done: boolean, label = 'Save') => (
    <button
      onClick={onClick}
      disabled={loading}
      className="bg-accent-green text-bg px-5 py-2.5 rounded-xl font-medium min-h-[44px] active:scale-95 transition-transform disabled:opacity-50"
    >
      {loading ? 'Saving...' : done ? 'Saved!' : label}
    </button>
  );

  const saveCashPresets = async () => {
    setCashSaving(true);
    setCashSaved(false);
    try {
      await api.put('/api/settings', {
        sanders_cash_presets: JSON.stringify(cashPresets.filter((p) => p.reason.trim())),
      });
      setCashSaved(true);
      setTimeout(() => setCashSaved(false), 3000);
    } finally {
      setCashSaving(false);
    }
  };

  const saveFamily = async () => {
    setFamilySaving(true);
    setFamilySaved(false);
    try {
      await api.put('/api/settings', {
        family_name: familyName,
        currency_name: currencyNameOverride,
      });
      invalidateCurrencyNameCache();
      setFamilySaved(true);
      setTimeout(() => setFamilySaved(false), 3000);
    } finally {
      setFamilySaving(false);
    }
  };

  const renderContent = () => {
    switch (active) {
      case 'family':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-bright">Family Settings</h3>
            <div>
              <label className="block text-sm text-text-dim mb-1">Family Name</label>
              <input type="text" value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="e.g. Sanders" className={inputClass} />
              <p className="text-text-dim text-xs mt-1">Used to derive the currency name (e.g. "Sanders Cash").</p>
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">Currency Name (optional)</label>
              <input type="text" value={currencyNameOverride} onChange={(e) => setCurrencyNameOverride(e.target.value)} placeholder={familyName ? `${familyName} Cash` : 'Family Cash'} className={inputClass} />
              <p className="text-text-dim text-xs mt-1">Leave blank to auto-derive from family name. Currently: {currencyName}</p>
            </div>
            {saveBtn(saveFamily, familySaving, familySaved, 'Save Family')}
          </div>
        );

      case 'sanders-cash':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-bright">Award Presets</h3>
            <p className="text-text-dim text-sm">Configure quick-select reasons and their default amounts for the Award modal.</p>
            <div className="space-y-2">
              {cashPresets.map((preset, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={preset.reason}
                    onChange={(e) => {
                      const updated = [...cashPresets];
                      updated[i] = { ...updated[i], reason: e.target.value };
                      setCashPresets(updated);
                    }}
                    placeholder="Reason"
                    className={`flex-1 ${inputClass}`}
                  />
                  <div className="relative w-24 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={(preset.amount / 100).toFixed(2)}
                      onChange={(e) => {
                        const updated = [...cashPresets];
                        updated[i] = { ...updated[i], amount: Math.round((parseFloat(e.target.value) || 0) * 100) };
                        setCashPresets(updated);
                      }}
                      className={`pl-7 ${inputClass}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setCashPresets(cashPresets.filter((_, j) => j !== i))}
                    className="text-accent-red text-lg min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCashPresets([...cashPresets, { reason: '', amount: 500 }])}
              className="text-primary-light text-sm font-medium min-h-[44px]"
            >
              + Add Preset
            </button>
            {saveBtn(saveCashPresets, cashSaving, cashSaved, 'Save Presets')}
          </div>
        );

      case 'frigate':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-bright">Frigate Cameras</h3>
            <div>
              <label className="block text-sm text-text-dim mb-1">Frigate URL</label>
              <input type="url" value={frigateUrl} onChange={(e) => setFrigateUrl(e.target.value)} placeholder="http://frigate.local:5000" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">Username</label>
              <input type="text" value={frigateUser} onChange={(e) => setFrigateUser(e.target.value)} placeholder="Leave blank if no auth" autoComplete="username" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">Password</label>
              <input type="password" value={frigatePass} onChange={(e) => setFrigatePass(e.target.value)} placeholder="Leave blank if no auth" autoComplete="current-password" className={inputClass} />
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <button onClick={testFrigate} disabled={testing || !frigateUrl} className="bg-surface-lighter text-text-bright px-4 py-2 rounded-xl font-medium min-h-[44px] active:scale-95 transition-transform disabled:opacity-50">
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              {testResult && <span className={`text-sm ${testResult.ok ? 'text-accent-green' : 'text-accent-red'}`}>{testResult.msg}</span>}
            </div>
            {availableCameras.length > 0 && (
              <>
                <h4 className="text-sm font-medium text-text-dim uppercase tracking-wide pt-2">Camera Framing</h4>
                <div className="space-y-2">
                  {availableCameras.map((camera) => {
                    const mode = cameraFitModes[camera.name] || 'cover';
                    return (
                      <div key={camera.name} className="flex items-center justify-between gap-3 bg-surface-lighter rounded-xl p-3">
                        <p className="text-text-bright font-medium capitalize">{camera.name.replace(/_/g, ' ')}</p>
                        <div className="flex bg-surface rounded-xl overflow-hidden">
                          <button type="button" onClick={() => setCameraFitModes((c) => ({ ...c, [camera.name]: 'cover' }))} className={`px-3 py-1.5 text-sm ${mode === 'cover' ? 'bg-primary text-white' : 'text-text-dim'}`}>Fill</button>
                          <button type="button" onClick={() => setCameraFitModes((c) => ({ ...c, [camera.name]: 'contain' }))} className={`px-3 py-1.5 text-sm ${mode === 'contain' ? 'bg-primary text-white' : 'text-text-dim'}`}>Full Frame</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <h4 className="text-sm font-medium text-text-dim uppercase tracking-wide pt-4">Motion Alerts</h4>
            <div>
              <label className="block text-sm text-text-dim mb-1">Alert Labels</label>
              <input type="text" value={motionAlertLabels} onChange={(e) => setMotionAlertLabels(e.target.value)} placeholder="person, package" className={inputClass} />
              <p className="text-text-dim text-xs mt-1">Comma-separated Frigate labels that trigger the in-app preview.</p>
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-2">Preview Cameras</label>
              {availableCameras.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {availableCameras.map((camera) => {
                    const selected = motionAlertCameras.includes(camera.name);
                    return (
                      <button key={camera.name} type="button" onClick={() => setMotionAlertCameras((c) => selected ? c.filter((n) => n !== camera.name) : [...c, camera.name])}
                        className={`px-4 py-2 rounded-xl text-sm font-medium min-h-[44px] transition-colors ${selected ? 'bg-primary text-white' : 'bg-surface-lighter text-text-dim'}`}>
                        {camera.name.replace(/_/g, ' ')}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-text-dim text-sm">No cameras loaded yet.</p>
              )}
              <p className="text-text-dim text-xs mt-1">Only alerts from selected cameras will show the preview. If none selected, all are allowed.</p>
            </div>
            {saveBtn(saveAll, saving, saved, 'Save Settings')}
          </div>
        );

      case 'mqtt':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-bright">MQTT</h3>
            <div>
              <label className="block text-sm text-text-dim mb-1">Host</label>
              <input type="text" value={mqttHost} onChange={(e) => setMqttHost(e.target.value)} placeholder="mqtt.local" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-dim mb-1">Port</label>
                <input type="number" value={mqttPort} onChange={(e) => setMqttPort(e.target.value)} placeholder="1883" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1">Client ID</label>
                <input type="text" value={mqttClientId} onChange={(e) => setMqttClientId(e.target.value)} placeholder="sandershome" className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-dim mb-1">Username</label>
                <input type="text" value={mqttUser} onChange={(e) => setMqttUser(e.target.value)} placeholder="Leave blank if no auth" autoComplete="username" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1">Password</label>
                <input type="password" value={mqttPass} onChange={(e) => setMqttPass(e.target.value)} placeholder="Leave blank if no auth" autoComplete="current-password" className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-dim mb-1">Discovery Prefix</label>
                <input type="text" value={mqttDiscoveryPrefix} onChange={(e) => setMqttDiscoveryPrefix(e.target.value)} placeholder="homeassistant" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1">Base Topic</label>
                <input type="text" value={mqttBaseTopic} onChange={(e) => setMqttBaseTopic(e.target.value)} placeholder="frigate" className={inputClass} />
              </div>
            </div>
            <p className="text-text-dim text-xs">Motion alerts subscribe to `&lt;base topic&gt;/events`. Restart server after changing.</p>
            <div className="flex gap-2 items-center flex-wrap">
              {saveBtn(saveMqtt, mqttSaving, mqttSaved, 'Save MQTT')}
              <button onClick={testMqtt} disabled={mqttTesting || !mqttHost} className="bg-surface-lighter text-text-bright px-4 py-2 rounded-xl font-medium min-h-[44px] active:scale-95 transition-transform disabled:opacity-50">
                {mqttTesting ? 'Testing...' : 'Test Connection'}
              </button>
              {mqttTestResult && <span className={`text-sm ${mqttTestResult.ok ? 'text-accent-green' : 'text-accent-red'}`}>{mqttTestResult.msg}</span>}
            </div>
          </div>
        );

      case 'gatus':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-bright">Gatus Dashboard</h3>
            <div>
              <label className="block text-sm text-text-dim mb-1">Gatus URL</label>
              <input type="url" value={gatusUrl} onChange={(e) => setGatusUrl(e.target.value)} placeholder="https://dash.example.com" className={inputClass} />
            </div>
            {saveBtn(saveAll, saving, saved, 'Save Settings')}
          </div>
        );

      case 'overseerr':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-bright">Overseerr / Jellyseerr</h3>
            <div>
              <label className="block text-sm text-text-dim mb-1">Seerr URL</label>
              <input type="url" value={seerrUrl} onChange={(e) => setSeerrUrl(e.target.value)} placeholder="https://seerr.example.com" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">API Key</label>
              <input type="password" value={seerrApiKey} onChange={(e) => setSeerrApiKey(e.target.value)} placeholder="From Overseerr Settings > General" className={inputClass} />
            </div>
            {saveBtn(saveAll, saving, saved, 'Save Settings')}
          </div>
        );

      case 'vikunja':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-bright">Vikunja Tasks</h3>
            <div>
              <label className="block text-sm text-text-dim mb-1">Vikunja URL</label>
              <input type="url" value={vikunjaUrl} onChange={(e) => setVikunjaUrl(e.target.value)} placeholder="https://vikunja.example.com" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">API Token</label>
              <input type="password" value={vikunjaApiKey} onChange={(e) => setVikunjaApiKey(e.target.value)} placeholder="From Vikunja Settings > API Tokens" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-2">Projects</label>
              {vikunjaProjects.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {vikunjaProjects.map((project) => {
                    const excluded = vikunjaExcludedProjects.includes(project.id);
                    return (
                      <button key={project.id} type="button" onClick={() => setVikunjaExcludedProjects((prev) => excluded ? prev.filter((id) => id !== project.id) : [...prev, project.id])}
                        className={`px-4 py-2 rounded-xl text-sm font-medium min-h-[44px] transition-colors ${excluded ? 'bg-surface-lighter text-text-dim' : 'bg-primary text-white'}`}>
                        {project.title}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-text-dim text-sm">Save Vikunja settings first, then projects will appear here.</p>
              )}
              <p className="text-text-dim text-xs mt-1">Toggle projects on/off. Disabled projects won't appear in the Tasks widget.</p>
            </div>
            {saveBtn(saveAll, saving, saved, 'Save Settings')}
          </div>
        );

      case 'immich':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-bright">Immich Screensaver</h3>
            <div>
              <label className="block text-sm text-text-dim mb-1">Immich URL</label>
              <input type="url" value={immichUrl} onChange={(e) => setImmichUrl(e.target.value)} placeholder="https://immich.example.com" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">API Key</label>
              <input type="password" value={immichApiKey} onChange={(e) => setImmichApiKey(e.target.value)} placeholder="From Immich > Account Settings > API Keys" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">Album ID</label>
              <input type="text" value={screensaverAlbumId} onChange={(e) => setScreensaverAlbumId(e.target.value)} placeholder="UUID from Immich album URL" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">Screensaver Timeout (seconds)</label>
              <input type="number" min={0} value={screensaverTimeout} onChange={(e) => setScreensaverTimeout(e.target.value)} placeholder="300" className={inputClass} />
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              {saveBtn(saveAll, saving, saved, 'Save Settings')}
              <button
                onClick={async () => {
                  setImmichTesting(true);
                  setImmichTestResult(null);
                  try {
                    const result = await api.post<{ ok: boolean; message: string }>('/api/immich/test', {});
                    setImmichTestResult(result);
                  } catch {
                    setImmichTestResult({ ok: false, message: 'Request failed' });
                  } finally {
                    setImmichTesting(false);
                  }
                }}
                disabled={immichTesting}
                className="bg-surface-lighter text-text-bright px-4 py-2 rounded-xl font-medium min-h-[44px] active:scale-95 transition-transform disabled:opacity-50"
              >
                {immichTesting ? 'Testing...' : 'Test Connection'}
              </button>
              {immichTestResult && <span className={`text-sm ${immichTestResult.ok ? 'text-accent-green' : 'text-accent-red'}`}>{immichTestResult.message}</span>}
            </div>
          </div>
        );

      case 'weather':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-bright">Weather Location</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-dim mb-1">Latitude</label>
                <input type="text" value={locationLat} onChange={(e) => setLocationLat(e.target.value)} placeholder="e.g. 33.749" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1">Longitude</label>
                <input type="text" value={locationLon} onChange={(e) => setLocationLon(e.target.value)} placeholder="e.g. -84.388" className={inputClass} />
              </div>
            </div>
            {saveBtn(saveAll, saving, saved, 'Save Settings')}
          </div>
        );

      case 'ai':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-bright">AI Providers</h3>
            <AIProviderSettings />
          </div>
        );
    }
  };

  return (
    <div className="bg-surface rounded-2xl overflow-hidden">
      <div className="flex flex-col md:grid md:grid-cols-[12rem_1fr]">
        <nav className="flex md:flex-col gap-1 p-2 md:p-3 md:border-r border-b md:border-b-0 border-surface-lighter overflow-x-auto md:overflow-x-visible">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium text-left whitespace-nowrap transition-colors ${
                active === s.id
                  ? 'bg-primary/15 text-primary-light'
                  : 'text-text-dim hover:text-text-bright hover:bg-surface-light'
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="p-4 md:p-5 min-h-[300px]">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
