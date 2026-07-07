import { useEffect, useState } from 'react';
import { api, CONDITION_ICONS, type WeatherData } from '../api/client';
import { formatDate, formatTime, useTimezone } from '../lib/timezone';

interface WeatherInsight { summary: string; alerts: string; suggestion: string }
interface WeatherWithInsight { weather: WeatherData; insight: WeatherInsight }

export function Weather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [insight, setInsight] = useState<WeatherInsight | null>(null);
  const timezone = useTimezone();

  useEffect(() => {
    api.get<WeatherData>('/api/weather').then(setWeather).catch(() => {});
    api.get<WeatherWithInsight>('/api/ai/weather-insight')
      .then((d) => { setWeather(d.weather); setInsight(d.insight); })
      .catch(() => {});
  }, []);

  if (!weather) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const icon = CONDITION_ICONS[weather.condition] || '🌤️';
  const dusk = weather.dusk || estimateDusk(weather.sunset);
  const aq = weather.airQuality;

  return (
    <div className="h-full -m-4 p-4 flex flex-col gap-4 overflow-hidden">

      {/* ── Top: Current + Details side-by-side ── */}
      <div className="grid grid-cols-[1fr_auto] gap-4 shrink-0">

        {/* Current conditions */}
        <div className="flex items-center gap-5">
          <span className="text-6xl leading-none">{icon}</span>
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-bold text-text-bright tracking-tight">{Math.round(weather.temperature)}°</span>
              <span className="text-text-dim text-lg">{weather.condition}</span>
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-sm">
              <span className="text-accent-red">H {Math.round(weather.high)}°</span>
              <span className="text-accent-blue">L {Math.round(weather.low)}°</span>
              {weather.feelsLike && Math.round(weather.feelsLike) !== Math.round(weather.temperature) && (
                <span className="text-text-dim">Feels {Math.round(weather.feelsLike)}°</span>
              )}
            </div>
          </div>
        </div>

        {/* Sun times */}
        <div className="flex items-center gap-6 px-5 py-3 rounded-2xl bg-surface-light border border-surface-lighter">
          <SunBlock label="Sunrise" time={formatTime(weather.sunrise, timezone)} icon={<SunriseIcon />} />
          <SunBlock label="Sunset" time={formatTime(weather.sunset, timezone)} icon={<SunsetIcon />} />
          {dusk && <SunBlock label="Dusk" time={formatTime(dusk, timezone)} icon={<DuskIcon />} />}
        </div>
      </div>

      {/* ── Hourly strip ── */}
      {weather.hourly && weather.hourly.length > 0 && (
        <div className="shrink-0 rounded-2xl bg-surface-light border border-surface-lighter px-4 py-3">
          <div className="flex justify-between">
            {weather.hourly.slice(0, 12).map((h) => {
              const hour = formatDate(h.time, timezone, { hour: 'numeric' });
              const hIcon = CONDITION_ICONS[h.condition] || '🌤️';
              return (
                <div key={h.time} className="flex flex-col items-center gap-1 min-w-0">
                  <span className="text-text-dim text-[11px]">{hour}</span>
                  <span className="text-lg leading-none">{hIcon}</span>
                  <span className="text-text-bright text-sm font-semibold">{Math.round(h.temperature)}°</span>
                  {h.precipProb > 0 ? (
                    <span className="text-accent-blue text-[10px] font-medium">{h.precipProb}%</span>
                  ) : (
                    <span className="text-[10px] opacity-0">0</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Bottom: 7-day + Conditions grid ── */}
      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">

        {/* 7-Day forecast */}
        <div className="rounded-2xl bg-surface-light border border-surface-lighter px-5 py-4 flex flex-col">
          <p className="text-text-dim text-[11px] font-semibold uppercase tracking-widest mb-3">7-Day Forecast</p>
          <div className="flex-1 flex flex-col justify-between">
            {(weather.daily || []).map((d) => {
              const dayIcon = CONDITION_ICONS[d.condition] || '🌤️';
              const dayLabel = formatDate(d.date + 'T12:00', timezone, { weekday: 'short' });
              return (
                <div key={d.date} className="flex items-center gap-3">
                  <span className="text-text-dim text-sm w-10 font-medium">{dayLabel}</span>
                  <span className="text-lg">{dayIcon}</span>
                  <span className="text-accent-blue text-sm w-8 text-right font-medium">{Math.round(d.low)}°</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface-lighter overflow-hidden mx-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent-blue via-accent-yellow to-accent-red"
                      style={{ width: `${Math.min(100, Math.max(15, ((d.high - d.low) / 40) * 100))}%` }}
                    />
                  </div>
                  <span className="text-accent-red text-sm w-8 font-medium">{Math.round(d.high)}°</span>
                  {d.precipProb > 0 && (
                    <span className="text-accent-blue text-xs w-8 text-right">{d.precipProb}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Conditions grid */}
        <div className="grid grid-cols-3 grid-rows-3 gap-3 min-h-0">
          <ConditionTile label="Humidity" value={`${weather.humidity}%`} sub={weather.humidity > 70 ? 'Muggy' : weather.humidity < 30 ? 'Dry' : 'Comfortable'} />
          <ConditionTile label="Wind" value={`${Math.round(weather.windSpeed)}`} unit="mph" sub={weather.windSpeed > 20 ? 'Gusty' : weather.windSpeed > 10 ? 'Moderate' : 'Light'} />
          <ConditionTile
            label="UV Index"
            value={`${Math.round(weather.uvIndex)}`}
            sub={weather.uvIndex >= 8 ? 'Very High' : weather.uvIndex >= 6 ? 'High' : weather.uvIndex >= 3 ? 'Moderate' : 'Low'}
            accent={weather.uvIndex >= 8 ? 'text-accent-red' : weather.uvIndex >= 6 ? 'text-accent-peach' : weather.uvIndex >= 3 ? 'text-accent-yellow' : undefined}
          />
          <ConditionTile label="Precipitation" value={`${weather.precipProb}%`} sub={weather.precipProb >= 60 ? 'Likely' : weather.precipProb >= 30 ? 'Possible' : 'Unlikely'} accent={weather.precipProb >= 60 ? 'text-accent-blue' : undefined} />
          <ConditionTile label="Dew Point" value={`${Math.round(weather.dewPoint)}°`} sub="Moisture level" />
          <ConditionTile label="Pressure" value={`${Math.round(weather.pressure)}`} unit="hPa" sub="Barometric" />
          {aq ? (
            <>
              <ConditionTile label="Air Quality" value={`${aq.aqi}`} sub={aq.level} accent={aqiColor(aq.aqi)} />
              <ConditionTile label="PM2.5" value={aq.pm25.toFixed(1)} sub="Fine particles" accent={aq.pm25 > 35 ? 'text-accent-red' : aq.pm25 > 12 ? 'text-accent-yellow' : undefined} />
              {aq.dust > 0 ? (
                <ConditionTile label="Dust" value={aq.dust.toFixed(1)} sub="µg/m³" accent={aq.dust > 100 ? 'text-accent-red' : aq.dust > 50 ? 'text-accent-yellow' : undefined} />
              ) : (
                <ConditionTile label="PM10" value={aq.pm10.toFixed(1)} sub="Coarse particles" accent={aq.pm10 > 150 ? 'text-accent-red' : aq.pm10 > 54 ? 'text-accent-yellow' : undefined} />
              )}
            </>
          ) : (
            <>
              {weather.visibility > 0 && <ConditionTile label="Visibility" value={`${weather.visibility.toFixed(1)}`} unit="mi" sub="Distance" />}
              <InsightTile insight={insight} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConditionTile({ label, value, unit, sub, accent }: { label: string; value: string; unit?: string; sub: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-surface-light border border-surface-lighter px-4 py-3 flex flex-col justify-between">
      <p className="text-text-dim text-[11px] font-semibold uppercase tracking-widest">{label}</p>
      <div>
        <p className={`text-2xl font-bold leading-none ${accent || 'text-text-bright'}`}>
          {value}
          {unit && <span className="text-sm font-medium text-text-dim ml-1">{unit}</span>}
        </p>
        <p className="text-text-dim text-xs mt-1">{sub}</p>
      </div>
    </div>
  );
}

function InsightTile({ insight }: { insight: WeatherInsight | null }) {
  if (!insight?.summary) {
    return <div className="rounded-2xl bg-surface-light border border-surface-lighter" />;
  }
  return (
    <div className="rounded-2xl bg-surface-light border border-surface-lighter px-4 py-3 flex flex-col justify-between col-span-2">
      <p className="text-text-dim text-[11px] font-semibold uppercase tracking-widest">Insight</p>
      <p className="text-text-bright text-sm leading-relaxed line-clamp-3">{insight.summary}</p>
    </div>
  );
}

function SunBlock({ label, time, icon }: { label: string; time: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {icon}
      <span className="text-text-bright text-sm font-semibold">{time}</span>
      <span className="text-text-dim text-[10px] uppercase tracking-wider">{label}</span>
    </div>
  );
}

function SunriseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M4.93 10.93l1.41 1.41M2 18h2M20 18h2M17.66 12.34l1.41-1.41" />
      <path d="M18 18a6 6 0 0 0-12 0" />
      <path d="M12 2l3 3M12 2l-3 3" strokeWidth="1.5" />
    </svg>
  );
}

function SunsetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 10v-4M4.93 10.93l1.41 1.41M2 18h2M20 18h2M17.66 12.34l1.41-1.41" />
      <path d="M18 18a6 6 0 0 0-12 0" />
      <path d="M12 10l3-3M12 10l-3-3" strokeWidth="1.5" />
    </svg>
  );
}

function DuskIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
      <path d="M2 18h20" strokeWidth="1.5" />
    </svg>
  );
}

function estimateDusk(sunset: string) {
  if (!sunset) return '';
  const d = new Date(sunset);
  if (Number.isNaN(d.getTime())) return '';
  d.setMinutes(d.getMinutes() + 30);
  return d.toISOString();
}

function aqiColor(aqi: number): string {
  if (aqi <= 50) return 'text-accent-green';
  if (aqi <= 100) return 'text-accent-yellow';
  if (aqi <= 150) return 'text-accent-peach';
  return 'text-accent-red';
}
