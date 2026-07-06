import { useEffect, useState } from 'react';
import { api, type Camera } from '../../api/client';

type Settings = Record<string, string>;

export function IntegrationSettings() {
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

  useEffect(() => {
    api.get<Settings>('/api/settings').then((s) => {
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
      setImmichUrl(s.immich_url || '');
      setImmichApiKey(s.immich_api_key || '');
      setScreensaverAlbumId(s.screensaver_album_id || '');
      setScreensaverTimeout(s.screensaver_timeout || '300');
    }).catch(() => {});

    api.get<Camera[]>('/api/cameras').then(setAvailableCameras).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setTestResult(null);
    try {
      await api.put('/api/settings', {
        frigate_url: frigateUrl,
        frigate_username: frigateUser,
        frigate_password: frigatePass,
        mqtt_host: mqttHost,
        mqtt_port: mqttPort,
        mqtt_username: mqttUser,
        mqtt_password: mqttPass,
        mqtt_discovery_prefix: mqttDiscoveryPrefix,
        mqtt_base_topic: mqttBaseTopic,
        mqtt_client_id: mqttClientId,
        motion_alert_labels: motionAlertLabels,
        motion_alert_cameras: motionAlertCameras.join(', '),
        camera_fit_modes: JSON.stringify(cameraFitModes),
        location_lat: locationLat,
        location_lon: locationLon,
        gatus_url: gatusUrl,
        seerr_url: seerrUrl,
        seerr_api_key: seerrApiKey,
        vikunja_url: vikunjaUrl,
        vikunja_api_key: vikunjaApiKey,
        immich_url: immichUrl,
        immich_api_key: immichApiKey,
        screensaver_album_id: screensaverAlbumId,
        screensaver_timeout: screensaverTimeout,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // handled by UI
    } finally {
      setSaving(false);
    }
  };

  const mqttPayload = {
		mqtt_host: mqttHost,
		mqtt_port: mqttPort,
		mqtt_username: mqttUser,
		mqtt_password: mqttPass,
		mqtt_discovery_prefix: mqttDiscoveryPrefix,
		mqtt_base_topic: mqttBaseTopic,
		mqtt_client_id: mqttClientId,
	};

  const saveMqtt = async () => {
    setMqttSaving(true);
    setMqttSaved(false);
    setMqttTestResult(null);
    try {
      await api.put('/api/settings', mqttPayload);
      setMqttSaved(true);
      setTimeout(() => setMqttSaved(false), 3000);
    } catch {
      // handled by UI
    } finally {
      setMqttSaving(false);
    }
  };

  const testMqtt = async () => {
    setMqttTesting(true);
    setMqttTestResult(null);
    try {
      const res = await api.post<{ ok: boolean; msg: string }>('/api/settings/mqtt/test', {
        host: mqttHost,
        port: mqttPort,
        username: mqttUser,
        password: mqttPass,
        clientId: mqttClientId,
      });
      setMqttTestResult(res);
    } catch (e) {
      setMqttTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Connection failed' });
    } finally {
      setMqttTesting(false);
    }
  };

  const toggleMotionAlertCamera = (cameraName: string) => {
    setMotionAlertCameras((current) => (
      current.includes(cameraName)
        ? current.filter((name) => name !== cameraName)
        : [...current, cameraName]
    ));
  };

  const setCameraFitMode = (cameraName: string, mode: 'cover' | 'contain') => {
    setCameraFitModes((current) => ({ ...current, [cameraName]: mode }));
  };

  const testFrigate = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await save();
      const res = await api.get<{ available: boolean }>('/api/cameras/status');
      setTestResult(res.available
        ? { ok: true, msg: 'Connected to Frigate' }
        : { ok: false, msg: 'Frigate not reachable — check URL and credentials' }
      );
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-surface rounded-2xl p-5 space-y-6">
      <h2 className="text-lg font-semibold text-text-bright">Integrations</h2>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-primary-light uppercase tracking-wide">Frigate Cameras</h3>

        <div>
          <label className="block text-sm text-text-dim mb-1">Frigate URL</label>
          <input
            type="url"
            value={frigateUrl}
            onChange={(e) => setFrigateUrl(e.target.value)}
            placeholder="http://frigate.local:5000"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-1">Username</label>
          <input
            type="text"
            value={frigateUser}
            onChange={(e) => setFrigateUser(e.target.value)}
            placeholder="Leave blank if no auth"
            autoComplete="username"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-1">Password</label>
          <input
            type="password"
            value={frigatePass}
            onChange={(e) => setFrigatePass(e.target.value)}
            placeholder="Leave blank if no auth"
            autoComplete="current-password"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={testFrigate}
            disabled={testing || !frigateUrl}
            className="bg-surface-lighter text-text-bright px-4 py-2 rounded-xl font-medium min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          {testResult && (
            <span className={`flex items-center text-sm ${testResult.ok ? 'text-accent-green' : 'text-accent-red'}`}>
              {testResult.msg}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-primary-light uppercase tracking-wide">MQTT (Motion Alerts)</h3>

        <div>
          <label className="block text-sm text-text-dim mb-1">Host</label>
          <input
            type="text"
            value={mqttHost}
            onChange={(e) => setMqttHost(e.target.value)}
            placeholder="mqtt.local"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-dim mb-1">Port</label>
            <input
              type="number"
              value={mqttPort}
              onChange={(e) => setMqttPort(e.target.value)}
              placeholder="1883"
              className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-dim mb-1">Client ID</label>
            <input
              type="text"
              value={mqttClientId}
              onChange={(e) => setMqttClientId(e.target.value)}
              placeholder="sandershome"
              className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-dim mb-1">Username</label>
            <input
              type="text"
              value={mqttUser}
              onChange={(e) => setMqttUser(e.target.value)}
              placeholder="Leave blank if no auth"
              autoComplete="username"
              className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-dim mb-1">Password</label>
            <input
              type="password"
              value={mqttPass}
              onChange={(e) => setMqttPass(e.target.value)}
              placeholder="Leave blank if no auth"
              autoComplete="current-password"
              className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-dim mb-1">Discovery Prefix</label>
            <input
              type="text"
              value={mqttDiscoveryPrefix}
              onChange={(e) => setMqttDiscoveryPrefix(e.target.value)}
              placeholder="homeassistant"
              className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-dim mb-1">Base Topic</label>
            <input
              type="text"
              value={mqttBaseTopic}
              onChange={(e) => setMqttBaseTopic(e.target.value)}
              placeholder="frigate"
              className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <p className="text-text-dim text-xs mt-1">Motion alerts subscribe to `&lt;base topic&gt;/events`. Restart server after changing.</p>

        <div className="flex gap-2">
          <button
            onClick={saveMqtt}
            disabled={mqttSaving}
            className="bg-accent-green text-bg px-4 py-2 rounded-xl font-medium min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
          >
            {mqttSaving ? 'Saving...' : mqttSaved ? 'Saved!' : 'Save MQTT'}
          </button>
          <button
            onClick={testMqtt}
            disabled={mqttTesting || !mqttHost}
            className="bg-surface-lighter text-text-bright px-4 py-2 rounded-xl font-medium min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
          >
            {mqttTesting ? 'Testing...' : 'Test Connection'}
          </button>
          {mqttTestResult && (
            <span className={`flex items-center text-sm ${mqttTestResult.ok ? 'text-accent-green' : 'text-accent-red'}`}>
              {mqttTestResult.msg}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-primary-light uppercase tracking-wide">Motion Alert Display</h3>

        <div>
          <label className="block text-sm text-text-dim mb-1">Alert Labels</label>
          <input
            type="text"
            value={motionAlertLabels}
            onChange={(e) => setMotionAlertLabels(e.target.value)}
            placeholder="person, package"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-text-dim text-xs mt-1">Comma-separated Frigate labels that should trigger the in-app preview. Leave blank to allow all labels.</p>
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-2">Preview Cameras</label>
          {availableCameras.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableCameras.map((camera) => {
                const selected = motionAlertCameras.includes(camera.name);
                return (
                  <button
                    key={camera.name}
                    type="button"
                    onClick={() => toggleMotionAlertCamera(camera.name)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium min-h-[44px] transition-colors ${
                      selected ? 'bg-primary text-white' : 'bg-surface-lighter text-text-dim'
                    }`}
                  >
                    {camera.name.replace(/_/g, ' ')}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-text-dim text-sm">No cameras loaded yet. Save/test Frigate first if needed.</p>
          )}
          <p className="text-text-dim text-xs mt-1">Only alerts from selected cameras will show the bottom-right preview. If none are selected, all cameras are allowed.</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-primary-light uppercase tracking-wide">Camera Framing</h3>

        {availableCameras.length > 0 ? (
          <div className="space-y-3">
            {availableCameras.map((camera) => {
              const mode = cameraFitModes[camera.name] || 'cover';
              return (
                <div key={camera.name} className="flex items-center justify-between gap-3 bg-surface-light rounded-xl p-3">
                  <div>
                    <p className="text-text-bright font-medium capitalize">{camera.name.replace(/_/g, ' ')}</p>
                    <p className="text-text-dim text-xs">Use Full Frame for wide-angle cameras that should not be cropped.</p>
                  </div>
                  <div className="flex bg-surface-lighter rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCameraFitMode(camera.name, 'cover')}
                      className={`px-3 py-2 text-sm min-h-[44px] ${mode === 'cover' ? 'bg-primary text-white' : 'text-text-dim'}`}
                    >
                      Fill
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraFitMode(camera.name, 'contain')}
                      className={`px-3 py-2 text-sm min-h-[44px] ${mode === 'contain' ? 'bg-primary text-white' : 'text-text-dim'}`}
                    >
                      Full Frame
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-text-dim text-sm">No cameras loaded yet.</p>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-primary-light uppercase tracking-wide">Gatus Dashboard</h3>
        <div>
          <label className="block text-sm text-text-dim mb-1">Gatus URL</label>
          <input
            type="url"
            value={gatusUrl}
            onChange={(e) => setGatusUrl(e.target.value)}
            placeholder="https://dash.example.com"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-primary-light uppercase tracking-wide">Overseerr / Jellyseerr</h3>
        <div>
          <label className="block text-sm text-text-dim mb-1">Seerr URL</label>
          <input
            type="url"
            value={seerrUrl}
            onChange={(e) => setSeerrUrl(e.target.value)}
            placeholder="https://seerr.example.com"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm text-text-dim mb-1">API Key</label>
          <input
            type="password"
            value={seerrApiKey}
            onChange={(e) => setSeerrApiKey(e.target.value)}
            placeholder="From Overseerr Settings > General"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-primary-light uppercase tracking-wide">Vikunja Tasks</h3>
        <div>
          <label className="block text-sm text-text-dim mb-1">Vikunja URL</label>
          <input
            type="url"
            value={vikunjaUrl}
            onChange={(e) => setVikunjaUrl(e.target.value)}
            placeholder="https://vikunja.example.com"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm text-text-dim mb-1">API Token</label>
          <input
            type="password"
            value={vikunjaApiKey}
            onChange={(e) => setVikunjaApiKey(e.target.value)}
            placeholder="From Vikunja Settings > API Tokens"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-primary-light uppercase tracking-wide">Immich Screensaver</h3>
        <div>
          <label className="block text-sm text-text-dim mb-1">Immich URL</label>
          <input
            type="url"
            value={immichUrl}
            onChange={(e) => setImmichUrl(e.target.value)}
            placeholder="https://immich.example.com"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm text-text-dim mb-1">API Key</label>
          <input
            type="password"
            value={immichApiKey}
            onChange={(e) => setImmichApiKey(e.target.value)}
            placeholder="From Immich > Account Settings > API Keys"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm text-text-dim mb-1">Album ID</label>
          <input
            type="text"
            value={screensaverAlbumId}
            onChange={(e) => setScreensaverAlbumId(e.target.value)}
            placeholder="UUID from Immich album URL"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm text-text-dim mb-1">Screensaver Timeout (seconds)</label>
          <input
            type="number"
            min={0}
            value={screensaverTimeout}
            onChange={(e) => setScreensaverTimeout(e.target.value)}
            placeholder="300"
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
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
          className="w-full bg-primary/20 text-primary-light font-medium py-3 rounded-xl min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
        >
          {immichTesting ? 'Testing...' : 'Test Connection'}
        </button>
        {immichTestResult && (
          <p className={`text-sm ${immichTestResult.ok ? 'text-accent-green' : 'text-accent-red'}`}>
            {immichTestResult.message}
          </p>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-primary-light uppercase tracking-wide">Weather Location</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-dim mb-1">Latitude</label>
            <input
              type="text"
              value={locationLat}
              onChange={(e) => setLocationLat(e.target.value)}
              placeholder="e.g. 33.749"
              className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-dim mb-1">Longitude</label>
            <input
              type="text"
              value={locationLon}
              onChange={(e) => setLocationLon(e.target.value)}
              placeholder="e.g. -84.388"
              className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
      >
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

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
