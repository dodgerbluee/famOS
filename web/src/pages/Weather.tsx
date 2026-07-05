import { WeatherCard } from '../components/weather/WeatherCard';

export function Weather() {
  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-3xl font-bold text-text-bright">Weather</h1>
      </header>
      <div className="bg-surface rounded-2xl p-5">
        <WeatherCard />
      </div>
    </div>
  );
}
