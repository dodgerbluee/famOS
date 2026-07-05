import { useEffect, useState } from 'react';
import { api, CONDITION_ICONS, type WeatherData, type AirQuality } from '../../api/client';
import { formatDate, formatTime, useTimezone } from '../../lib/timezone';

interface WeatherInsight {
  summary: string;
  alerts: string;
  suggestion: string;
}

interface WeatherWithInsight {
  weather: WeatherData;
  insight: WeatherInsight;
}

interface WeatherCardProps {
  compact?: boolean;
}

export function WeatherCard({ compact }: WeatherCardProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [insight, setInsight] = useState<WeatherInsight | null>(null);
  const timezone = useTimezone();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<WeatherData>('/api/weather')
      .then(setWeather)
      .catch((e) => setError(e.message));

    api.get<WeatherWithInsight>('/api/ai/weather-insight')
      .then((data) => {
        setWeather(data.weather);
        setInsight(data.insight);
      })
      .catch(() => {});
  }, []);

  if (error) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-text-bright mb-2">Weather</h2>
        <p className="text-text-dim text-sm">{error}</p>
      </div>
    );
  }

  if (!weather) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-text-bright mb-2">Weather</h2>
        <p className="text-text-dim text-sm">Loading...</p>
      </div>
    );
  }

  const icon = CONDITION_ICONS[weather.condition] || '🌤️';
  const dusk = weather.dusk || estimateDusk(weather.sunset);

  if (compact) {
    const aq = weather.airQuality;
    return (
      <div className="space-y-2.5">
        <h2 className="text-lg font-semibold text-text-bright">Weather</h2>

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-3xl">{icon}</span>
            <div>
              <div className="flex items-end gap-2">
                <p className="text-text-bright text-2xl font-bold leading-none">
                  {Math.round(weather.temperature)}°F
                </p>
                <p className="text-accent-red text-xs leading-none mb-0.5">↑ {Math.round(weather.high)}°</p>
                <p className="text-accent-blue text-xs leading-none mb-0.5">↓ {Math.round(weather.low)}°</p>
              </div>
              <p className="text-text-dim text-xs mt-1 truncate">
                {weather.condition}
                {weather.feelsLike && Math.round(weather.feelsLike) !== Math.round(weather.temperature)
                  ? ` · Feels ${Math.round(weather.feelsLike)}°`
                  : ''}
              </p>
            </div>
          </div>
          <SunTimes weather={weather} timezone={timezone} compact dusk={dusk} />
        </div>

        <StatGrid weather={weather} aq={aq} />

        {/* AI insight */}
        {insight?.summary && (
          <p className="text-accent-blue text-xs italic">{insight.summary}</p>
        )}

        {weather.hourly && weather.hourly.length > 0 && (
          <div>
            <p className="text-text-dim text-[10px] font-medium mb-1.5 uppercase tracking-wide">Hourly</p>
            <div className="grid grid-cols-12 gap-0">
              {weather.hourly.slice(0, 12).map((h) => {
                const hour = formatDate(h.time, timezone, { hour: 'numeric' });
                const hIcon = CONDITION_ICONS[h.condition] || '🌤️';
                return (
                  <div key={h.time} className="flex flex-col items-center">
                    <span className="text-text-dim text-[10px]">{hour}</span>
                    <span className="text-sm">{hIcon}</span>
                    <span className="text-text-bright text-xs font-medium">{Math.round(h.temperature)}°</span>
                    {h.precipProb > 0 && (
                      <span className="text-accent-blue text-[9px]">{h.precipProb}%</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {weather.daily && weather.daily.length > 1 && (
          <div className="space-y-0.5">
            {weather.daily.slice(1, 6).map((d) => {
              const dayIcon = CONDITION_ICONS[d.condition] || '🌤️';
              const dayLabel = formatDate(d.date + 'T12:00', timezone, { weekday: 'short' });
              return (
                <div key={d.date} className="flex items-center gap-2 py-0.5">
                  <span className="text-text-dim text-xs w-8">{dayLabel}</span>
                  <span className="text-sm">{dayIcon}</span>
                  <span className="text-accent-blue text-xs w-6 text-right">{Math.round(d.low)}°</span>
                  <div className="flex-1 mx-1 h-1 rounded-full bg-surface-lighter overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent-blue to-accent-red"
                      style={{ width: `${Math.min(100, Math.max(10, ((d.high - d.low) / 40) * 100))}%` }}
                    />
                  </div>
                  <span className="text-accent-red text-xs w-6">{Math.round(d.high)}°</span>
                  {d.precipProb > 0 && (
                    <span className="text-accent-blue text-[10px] w-7 text-right">{d.precipProb}%</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-text-bright">Weather</h2>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 items-center">
        <span className="text-5xl leading-none">{icon}</span>
        <div className="min-w-0 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <div className="flex items-end gap-3 flex-wrap">
                <p className="text-text-bright text-4xl font-bold leading-none">{Math.round(weather.temperature)}°F</p>
                <p className="text-accent-red text-sm leading-none mb-1">↑ {Math.round(weather.high)}°</p>
                <p className="text-accent-blue text-sm leading-none mb-1">↓ {Math.round(weather.low)}°</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-text-dim">
                <span>{weather.condition}</span>
                {weather.feelsLike && Math.round(weather.feelsLike) !== Math.round(weather.temperature) && (
                  <span>Feels {Math.round(weather.feelsLike)}°</span>
                )}
              </div>
            </div>
          </div>
          <SunTimes weather={weather} timezone={timezone} dusk={dusk} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">
        <DetailItem label="Dew Point" value={`${Math.round(weather.dewPoint)}°F`} subtle />
        <DetailItem label="Pressure" value={`${Math.round(weather.pressure)} hPa`} subtle />
        {weather.visibility > 0 && <DetailItem label="Visibility" value={`${weather.visibility.toFixed(1)} mi`} />}
      </div>

      {/* Stats + Air Quality */}
      <StatGrid weather={weather} aq={weather.airQuality} />

      {/* AI insight */}
      {insight && (
        <div className="bg-surface-light rounded-xl p-3 space-y-1">
          {insight.summary && (
            <p className="text-text-bright text-sm">{insight.summary}</p>
          )}
          {insight.alerts && (
            <p className="text-accent-yellow text-sm">{insight.alerts}</p>
          )}
          {insight.suggestion && (
            <p className="text-accent-blue text-sm italic">{insight.suggestion}</p>
          )}
        </div>
      )}

      {/* Hourly forecast */}
      {weather.hourly && weather.hourly.length > 0 && (
        <div>
          <p className="text-text-dim text-xs font-medium mb-2 uppercase tracking-wide">Hourly</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {weather.hourly.slice(0, 12).map((h) => {
              const hour = formatDate(h.time, timezone, { hour: 'numeric' });
              const hIcon = CONDITION_ICONS[h.condition] || '🌤️';
              return (
                <div key={h.time} className="flex flex-col items-center min-w-[48px]">
                  <span className="text-text-dim text-xs">{hour}</span>
                  <span className="text-lg">{hIcon}</span>
                  <span className="text-text-bright text-sm font-medium">
                    {Math.round(h.temperature)}°
                  </span>
                  {h.precipProb > 0 && (
                    <span className="text-accent-blue text-[10px]">{h.precipProb}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 7-day forecast */}
      {weather.daily && weather.daily.length > 1 && (
        <div>
          <p className="text-text-dim text-xs font-medium mb-2 uppercase tracking-wide">7-Day Forecast</p>
          <div className="space-y-1">
            {weather.daily.map((d) => {
              const dayIcon = CONDITION_ICONS[d.condition] || '🌤️';
              const dayLabel = formatDate(d.date + 'T12:00', timezone, { weekday: 'short' });
              return (
                <div key={d.date} className="flex items-center gap-2 py-1">
                  <span className="text-text-dim text-sm w-10">{dayLabel}</span>
                  <span className="text-base">{dayIcon}</span>
                  <span className="text-accent-blue text-sm w-8 text-right">{Math.round(d.low)}°</span>
                  <div className="flex-1 mx-2 h-1.5 rounded-full bg-surface-lighter overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent-blue to-accent-red"
                      style={{ width: `${Math.min(100, Math.max(10, ((d.high - d.low) / 40) * 100))}%` }}
                    />
                  </div>
                  <span className="text-accent-red text-sm w-8">{Math.round(d.high)}°</span>
                  {d.precipProb > 0 && (
                    <span className="text-accent-blue text-xs w-8 text-right">{d.precipProb}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value, subtle }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className={`rounded-lg p-2 text-center ${subtle ? 'bg-surface-light/60 border border-surface-lighter' : 'bg-surface-light'}`}>
      <p className="text-text-dim text-[10px] uppercase tracking-wide">{label}</p>
      <p className="text-text-bright text-sm font-medium">{value}</p>
    </div>
  );
}

interface StatTile {
  label: string;
  value: string;
  color?: string;
  description: string;
  kind?: 'environment';
}

function StatGrid({ weather, aq }: { weather: WeatherData; aq?: AirQuality | null }) {
  const [selected, setSelected] = useState<string | null>(null);

  const tiles: StatTile[] = [
    {
      label: 'Humidity',
      value: `${weather.humidity}%`,
      kind: 'environment',
      description: `Relative humidity at ${weather.humidity}%. ${weather.humidity > 70 ? 'High — may feel muggy.' : weather.humidity < 30 ? 'Low — dry air, consider moisturizing.' : 'Comfortable range.'}`,
    },
    {
      label: 'Wind',
      value: `${Math.round(weather.windSpeed)} mph`,
      description: `Sustained wind speed. ${weather.windSpeed > 20 ? 'Gusty conditions.' : weather.windSpeed > 10 ? 'Moderate breeze.' : 'Light winds.'}`,
    },
    {
      label: 'UV Index',
      value: `${Math.round(weather.uvIndex)}`,
      color: weather.uvIndex >= 8 ? 'text-accent-red' : weather.uvIndex >= 6 ? 'text-accent-peach' : weather.uvIndex >= 3 ? 'text-accent-yellow' : undefined,
      description: `UV radiation intensity. ${weather.uvIndex >= 8 ? 'Very high — avoid prolonged sun, wear sunscreen.' : weather.uvIndex >= 6 ? 'High — sunscreen recommended.' : weather.uvIndex >= 3 ? 'Moderate — some protection advised.' : 'Low — minimal risk.'}`,
    },
    {
      label: 'Precip',
      value: `${weather.precipProb}%`,
      color: weather.precipProb >= 60 ? 'text-accent-blue' : undefined,
      description: `Probability of precipitation today. ${weather.precipProb >= 60 ? 'Likely — bring an umbrella.' : weather.precipProb >= 30 ? 'Possible — keep one handy.' : 'Unlikely.'}`,
    },
  ];

  if (aq) {
    tiles.push(
      {
      label: 'AQI',
      value: `${aq.aqi}`,
      color: aqiColor(aq.aqi),
      kind: 'environment',
      description: `US Air Quality Index — ${aq.level}. ${aq.aqi <= 50 ? 'Safe for all activities.' : aq.aqi <= 100 ? 'Acceptable, but sensitive individuals may notice effects.' : 'Consider limiting outdoor exertion.'}`,
    },
      {
      label: 'PM2.5',
      value: `${aq.pm25.toFixed(1)}`,
      color: aq.pm25 > 35 ? 'text-accent-red' : aq.pm25 > 12 ? 'text-accent-yellow' : undefined,
      kind: 'environment',
      description: `Fine particulate matter (< 2.5 µm). Penetrates deep into lungs. ${aq.pm25 <= 12 ? 'Good — safe for sensitive groups.' : aq.pm25 <= 35 ? 'Moderate — may affect those with respiratory conditions.' : 'Unhealthy — limit outdoor exposure.'}`,
    },
      {
      label: 'PM10',
      value: `${aq.pm10.toFixed(1)}`,
      color: aq.pm10 > 150 ? 'text-accent-red' : aq.pm10 > 54 ? 'text-accent-yellow' : undefined,
      kind: 'environment',
      description: `Coarse particles (< 10 µm) like dust, pollen, and mold spores. ${aq.pm10 <= 54 ? 'Good — low irritant levels.' : aq.pm10 <= 150 ? 'Moderate — may aggravate allergies or asthma.' : 'High — stay indoors if sensitive.'}`,
    },
    );
    if (aq.dust > 0) {
      tiles.push({
        label: 'Dust',
        value: `${aq.dust.toFixed(1)}`,
        color: aq.dust > 100 ? 'text-accent-red' : aq.dust > 50 ? 'text-accent-yellow' : undefined,
        kind: 'environment',
        description: `Airborne dust concentration (µg/m³). ${aq.dust <= 50 ? 'Low — minimal allergy concern.' : aq.dust <= 100 ? 'Moderate — may trigger dust allergies.' : 'High — keep windows closed, use air filtration.'}`,
      });
    }
  }

  const toggle = (label: string) => setSelected((prev) => (prev === label ? null : label));
  const selectedTile = tiles.find((t) => t.label === selected);

  return (
    <div className="space-y-2">
      <div className={`grid gap-1.5 ${tiles.length <= 5 ? 'grid-cols-5' : tiles.length <= 6 ? 'grid-cols-6' : tiles.length <= 8 ? 'grid-cols-8' : 'grid-cols-5 md:grid-cols-8'}`}>
        {tiles.map((t) => (
          <button
            key={t.label}
            onClick={(e) => { e.stopPropagation(); toggle(t.label); }}
            className={`rounded-lg py-1.5 px-1 text-center transition-colors ${
              selected === t.label
                ? 'bg-primary-light/15 ring-1 ring-primary-light/30'
                : t.kind === 'environment'
                  ? 'bg-surface-light border border-accent-blue/20 hover:border-accent-blue/40 hover:bg-surface-lighter'
                  : 'bg-surface-light hover:bg-surface-lighter'
            }`}
          >
            <p className={`text-sm font-medium ${t.color || 'text-text-bright'}`}>{t.value}</p>
            <p className="text-text-dim text-[10px]">{t.label}</p>
          </button>
        ))}
      </div>
      {selectedTile && (
        <div className="bg-surface-light rounded-lg px-3 py-2 text-xs text-text-dim leading-relaxed">
          {selectedTile.description}
        </div>
      )}
    </div>
  );
}

function SunTimes({ weather, timezone, compact, dusk }: { weather: WeatherData; timezone: string; compact?: boolean; dusk?: string }) {
  return (
    <div className={`shrink-0 rounded-xl bg-surface-light/60 border border-surface-lighter/50 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5 ml-auto'}`}>
      <div className={`flex items-center ${compact ? 'gap-3' : 'gap-4'}`}>
        <SunTimeItem
          value={formatTime(weather.sunrise, timezone)}
          icon={<SunriseIcon />}
          compact={compact}
        />
        <SunTimeItem
          value={formatTime(weather.sunset, timezone)}
          icon={<SunsetIcon />}
          compact={compact}
        />
        {dusk && (
          <SunTimeItem
            value={formatTime(dusk, timezone)}
            icon={<DuskIcon />}
            compact={compact}
          />
        )}
      </div>
    </div>
  );
}

function SunTimeItem({ value, icon, compact }: { value: string; icon: React.ReactNode; compact?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="shrink-0">{icon}</span>
      <p className={`text-text-bright font-medium ${compact ? 'text-xs' : 'text-sm'}`}>{value}</p>
    </div>
  );
}

function SunriseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M4.93 10.93l1.41 1.41M2 18h2M20 18h2M17.66 12.34l1.41-1.41" />
      <path d="M18 18a6 6 0 0 0-12 0" />
      <path d="M12 2l3 3M12 2l-3 3" stroke="#f59e0b" strokeWidth="1.5" />
    </svg>
  );
}

function SunsetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 10v-4M4.93 10.93l1.41 1.41M2 18h2M20 18h2M17.66 12.34l1.41-1.41" />
      <path d="M18 18a6 6 0 0 0-12 0" />
      <path d="M12 10l3-3M12 10l-3-3" stroke="#fb923c" strokeWidth="1.5" />
    </svg>
  );
}

function DuskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" fill="none" />
      <path d="M2 18h20" strokeWidth="1.5" />
    </svg>
  );
}

function estimateDusk(sunset: string) {
  if (!sunset) return '';
  const date = new Date(sunset);
  if (Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() + 30);
  return date.toISOString();
}

function aqiColor(aqi: number): string {
  if (aqi <= 50) return 'text-accent-green';
  if (aqi <= 100) return 'text-accent-yellow';
  if (aqi <= 150) return 'text-accent-peach';
  return 'text-accent-red';
}
