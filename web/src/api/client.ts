const BASE_URL = import.meta.env.VITE_API_URL || '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    if (res.status === 401 && !path.includes('/api/auth/') && !path.includes('/api/setup/')) {
      window.location.href = '/login';
      throw new Error('Session expired');
    }
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};

export interface FamilyMember {
  id: string;
  name: string;
  role: 'admin' | 'parent' | 'kid' | 'kiosk';
  avatarUrl: string;
  color: string;
  sortOrder: number;
  createdAt: string;
}

export interface SandersCashAccount {
  id: string;
  memberId: string;
  balance: number;
}

export interface AccountWithMember {
  id: string;
  memberId: string;
  balance: number;
  memberName: string;
  memberColor: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  type: 'earn' | 'spend' | 'adjust';
  reason: string;
  awardedBy: string;
  createdAt: string;
}

export interface TransactionWithNames {
  id: string;
  accountId: string;
  amount: number;
  type: string;
  reason: string;
  awardedBy: string;
  createdAt: string;
  awardedByName: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  cost: number;
  imageUrl: string;
  category: string;
  active: boolean;
}

export interface Redemption {
  id: string;
  rewardId: string;
  memberId: string;
  status: 'pending' | 'approved' | 'denied';
  requestedAt: string;
  resolvedAt: string;
  resolvedBy: string;
}

export interface CalendarSource {
  id: string;
  name: string;
  type: 'caldav' | 'ics_url' | 'google_calendar';
  url: string;
  calendarName: string;
  username: string;
  color: string;
  syncIntervalMin: number;
  lastSyncedAt: string;
  active: boolean;
}

export interface RemoteCalendar {
  name: string;
  path: string;
  color: string;
}

export interface CalendarEvent {
  id: string;
  sourceId: string;
  externalId: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  recurrenceRule: string;
  aiEnrichment: string;
  sourceColor: string;
  sourceName: string;
  sourceCalendarName: string;
  sourceCalendarColor: string;
}

export interface AirQuality {
  aqi: number;
  level: string;
  pm25: number;
  pm10: number;
  dust: number;
}

export interface WeatherData {
  temperature: number;
  feelsLike: number;
  condition: string;
  high: number;
  low: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  uvIndex: number;
  dewPoint: number;
  visibility: number;
  pressure: number;
  sunrise: string;
  sunset: string;
  dusk: string;
  precipProb: number;
  hourly: HourlyWeather[];
  daily: DailyForecast[];
  airQuality?: AirQuality;
}

export interface HourlyWeather {
  time: string;
  temperature: number;
  feelsLike: number;
  precipitation: number;
  precipProb: number;
  humidity: number;
  windSpeed: number;
  condition: string;
}

export const CONDITION_ICONS: Record<string, string> = {
  'Clear': '☀️',
  'Partly Cloudy': '⛅',
  'Foggy': '🌫️',
  'Drizzle': '🌦️',
  'Rain': '🌧️',
  'Freezing Rain': '🌨️',
  'Freezing Drizzle': '🌨️',
  'Snow': '❄️',
  'Snow Grains': '❄️',
  'Snow Showers': '🌨️',
  'Showers': '🌧️',
  'Thunderstorm': '⛈️',
  'Thunderstorm with Hail': '⛈️',
};

export interface DailyForecast {
  date: string;
  high: number;
  low: number;
  condition: string;
  precipProb: number;
  precipSum: number;
  uvIndex: number;
  sunrise: string;
  sunset: string;
  dusk: string;
}

export interface DailyBriefing {
  date: string;
  summary: string;
  highlights: string[];
  weatherSummary: string;
  calendarSummary: string;
  sandersCashSummary: string;
}

export interface Camera {
  name: string;
  snapshotUrl: string;
  streamUrl: string;
}

export interface CameraEvent {
  id: string;
  camera: string;
  label: string;
  top_score: number;
  start_time: number;
  end_time: number;
  has_snapshot: boolean;
  has_clip: boolean;
  thumbnailUrl: string;
}

export interface MotionAlert {
  eventId: string;
  camera: string;
  label: string;
  score: number;
  timestamp: string;
  type: string;
}

export interface Chore {
  id: string;
  title: string;
  icon: string;
  assignedTo: string | null;
  assignedName: string;
  recurrence: string;
  rewardAmount: number;
  active: boolean;
  createdAt: string;
  completions: ChoreCompletion[];
}

export interface ChoreCompletion {
  id: string;
  completedBy: string;
  completedName: string;
  completedAt: string;
}
