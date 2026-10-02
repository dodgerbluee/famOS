import type { DashboardPayload } from '../api/client';
import { setQueryData, setQueryError } from './query';

export function seedDashboard(data: DashboardPayload) {
  setQueryData('/api/settings', data.settings);
  setQueryData('/api/sanders-cash/accounts', data.accounts);
  setQueryData('/api/chore-templates', data.choreTemplates);
  setQueryData('/api/family', data.family);
  if (data.weather) setQueryData('/api/weather', data.weather);
  if (data.briefing) setQueryData('/api/ai/briefing', data.briefing);
  setQueryData('/api/ai/status', data.ai);
  if (data.gatus) setQueryData('/api/gatus/status', data.gatus);
  else if (data.errors.gatus) setQueryError('/api/gatus/status', new Error(data.errors.gatus));
  if (data.seerr) setQueryData('/api/seerr/requests', data.seerr);
  else if (data.errors.seerr) setQueryError('/api/seerr/requests', new Error(data.errors.seerr));
  if (data.vikunja) setQueryData('/api/vikunja/tasks', data.vikunja);
  else if (data.errors.vikunja) setQueryError('/api/vikunja/tasks', new Error(data.errors.vikunja));
}
