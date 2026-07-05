package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/sandershome/server/internal/db"
)

type WeatherService struct {
	db         *db.DB
	client     *http.Client
	defaultLat float64
	defaultLon float64
	tzLocation *time.Location
}

func NewWeatherService(database *db.DB, lat, lon float64, timezone string) *WeatherService {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	return &WeatherService{
		db:         database,
		client:     &http.Client{Timeout: 15 * time.Second},
		defaultLat: lat,
		defaultLon: lon,
		tzLocation: loc,
	}
}

func (s *WeatherService) userLocation() (float64, float64) {
	var raw string
	if err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'location_lat'`).Scan(&raw); err == nil {
		var v string
		if json.Unmarshal([]byte(raw), &v) == nil {
			if f, err := strconv.ParseFloat(v, 64); err == nil && f != 0 {
				lat := f
				if err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'location_lon'`).Scan(&raw); err == nil {
					if json.Unmarshal([]byte(raw), &v) == nil {
						if f, err := strconv.ParseFloat(v, 64); err == nil {
							return lat, f
						}
					}
				}
			}
		}
	}
	return s.defaultLat, s.defaultLon
}

type AirQuality struct {
	AQI   int     `json:"aqi"`
	Level string  `json:"level"`
	PM25  float64 `json:"pm25"`
	PM10  float64 `json:"pm10"`
	Dust  float64 `json:"dust"`
}

type WeatherData struct {
	Temperature   float64         `json:"temperature"`
	FeelsLike     float64         `json:"feelsLike"`
	Condition     string          `json:"condition"`
	High          float64         `json:"high"`
	Low           float64         `json:"low"`
	Humidity      int             `json:"humidity"`
	WindSpeed     float64         `json:"windSpeed"`
	WindDirection int             `json:"windDirection"`
	UVIndex       float64         `json:"uvIndex"`
	DewPoint      float64         `json:"dewPoint"`
	Visibility    float64         `json:"visibility"`
	Pressure      float64         `json:"pressure"`
	Sunrise       string          `json:"sunrise"`
	Sunset        string          `json:"sunset"`
	Dusk          string          `json:"dusk"`
	PrecipProb    int             `json:"precipProb"`
	Hourly        []HourlyWeather `json:"hourly"`
	Daily         []DailyForecast `json:"daily"`
	AirQuality    *AirQuality     `json:"airQuality,omitempty"`
	FetchedAt     string          `json:"fetchedAt"`
}

type HourlyWeather struct {
	Time          string  `json:"time"`
	Temperature   float64 `json:"temperature"`
	FeelsLike     float64 `json:"feelsLike"`
	Precipitation float64 `json:"precipitation"`
	PrecipProb    int     `json:"precipProb"`
	Humidity      int     `json:"humidity"`
	WindSpeed     float64 `json:"windSpeed"`
	WeatherCode   int     `json:"weatherCode"`
	Condition     string  `json:"condition"`
}

type DailyForecast struct {
	Date       string  `json:"date"`
	High       float64 `json:"high"`
	Low        float64 `json:"low"`
	Condition  string  `json:"condition"`
	PrecipProb int     `json:"precipProb"`
	PrecipSum  float64 `json:"precipSum"`
	UVIndex    float64 `json:"uvIndex"`
	Sunrise    string  `json:"sunrise"`
	Sunset     string  `json:"sunset"`
	Dusk       string  `json:"dusk"`
}

type openMeteoResponse struct {
	CurrentWeather struct {
		Temperature   float64 `json:"temperature"`
		WindSpeed     float64 `json:"windspeed"`
		WindDirection int     `json:"winddirection"`
		WeatherCode   int     `json:"weathercode"`
	} `json:"current_weather"`
	Hourly struct {
		Time          []string  `json:"time"`
		Temperature   []float64 `json:"temperature_2m"`
		ApparentTemp  []float64 `json:"apparent_temperature"`
		Precipitation []float64 `json:"precipitation"`
		PrecipProb    []int     `json:"precipitation_probability"`
		WeatherCode   []int     `json:"weathercode"`
		Humidity      []int     `json:"relativehumidity_2m"`
		WindSpeed     []float64 `json:"windspeed_10m"`
		DewPoint      []float64 `json:"dewpoint_2m"`
		Visibility    []float64 `json:"visibility"`
		Pressure      []float64 `json:"surface_pressure"`
	} `json:"hourly"`
	Daily struct {
		Time           []string  `json:"time"`
		TemperatureMax []float64 `json:"temperature_2m_max"`
		TemperatureMin []float64 `json:"temperature_2m_min"`
		UVIndexMax     []float64 `json:"uv_index_max"`
		PrecipProb     []int     `json:"precipitation_probability_max"`
		PrecipSum      []float64 `json:"precipitation_sum"`
		WeatherCode    []int     `json:"weathercode"`
		Sunrise        []string  `json:"sunrise"`
		Sunset         []string  `json:"sunset"`
	} `json:"daily"`
}

func (s *WeatherService) GetWeather(ctx context.Context) (*WeatherData, error) {
	cacheKey := "weather:" + time.Now().In(s.tzLocation).Format("2006-01-02-15")
	var cached string
	err := s.db.QueryRow(`SELECT content FROM ai_cache WHERE cache_key = ? AND expires_at > CURRENT_TIMESTAMP`, cacheKey).Scan(&cached)
	if err == nil && cached != "" {
		var data WeatherData
		if json.Unmarshal([]byte(cached), &data) == nil {
			return &data, nil
		}
	}

	lat, lon := s.userLocation()
	if lat == 0 && lon == 0 {
		return nil, fmt.Errorf("location not configured — set latitude and longitude in Settings")
	}

	forecastURL := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f"+
			"&current_weather=true"+
			"&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weathercode,relativehumidity_2m,windspeed_10m,dewpoint_2m,visibility,surface_pressure"+
			"&daily=temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max,precipitation_sum,weathercode,sunrise,sunset"+
			"&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=%s&forecast_days=7",
		lat, lon,
		url.QueryEscape(s.tzLocation.String()),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, forecastURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("weather fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("open-meteo returned %d: %s", resp.StatusCode, string(body))
	}

	var omResp openMeteoResponse
	if err := json.NewDecoder(resp.Body).Decode(&omResp); err != nil {
		return nil, fmt.Errorf("decode weather: %w", err)
	}

	data := &WeatherData{
		Temperature:   omResp.CurrentWeather.Temperature,
		Condition:     weatherCodeToCondition(omResp.CurrentWeather.WeatherCode),
		WindSpeed:     omResp.CurrentWeather.WindSpeed,
		WindDirection: omResp.CurrentWeather.WindDirection,
		FetchedAt:     time.Now().In(s.tzLocation).Format(time.RFC3339),
	}

	if len(omResp.Daily.TemperatureMax) > 0 {
		data.High = omResp.Daily.TemperatureMax[0]
	}
	if len(omResp.Daily.TemperatureMin) > 0 {
		data.Low = omResp.Daily.TemperatureMin[0]
	}
	if len(omResp.Daily.UVIndexMax) > 0 {
		data.UVIndex = omResp.Daily.UVIndexMax[0]
	}
	if len(omResp.Daily.PrecipProb) > 0 {
		data.PrecipProb = omResp.Daily.PrecipProb[0]
	}
	if len(omResp.Daily.Sunrise) > 0 {
		data.Sunrise = omResp.Daily.Sunrise[0]
	}
	if len(omResp.Daily.Sunset) > 0 {
		data.Sunset = omResp.Daily.Sunset[0]
		data.Dusk = estimateDusk(omResp.Daily.Sunset[0], s.tzLocation)
	}

	// Find current hour index for feels-like, humidity, dew point, etc.
	now := time.Now().In(s.tzLocation)
	currentHourStr := now.Format("2006-01-02T15") + ":00"
	for i, t := range omResp.Hourly.Time {
		if t == currentHourStr {
			if i < len(omResp.Hourly.ApparentTemp) {
				data.FeelsLike = omResp.Hourly.ApparentTemp[i]
			}
			if i < len(omResp.Hourly.Humidity) {
				data.Humidity = omResp.Hourly.Humidity[i]
			}
			if i < len(omResp.Hourly.DewPoint) {
				data.DewPoint = omResp.Hourly.DewPoint[i]
			}
			if i < len(omResp.Hourly.Visibility) {
				data.Visibility = omResp.Hourly.Visibility[i] / 5280 // meters to miles
			}
			if i < len(omResp.Hourly.Pressure) {
				data.Pressure = omResp.Hourly.Pressure[i]
			}
			break
		}
	}

	// Hourly forecast (next 24h)
	for i, t := range omResp.Hourly.Time {
		hourTime, err := time.ParseInLocation("2006-01-02T15:04", t, s.tzLocation)
		if err != nil {
			continue
		}
		if hourTime.Before(now.Add(-1*time.Hour)) || i >= len(omResp.Hourly.Temperature) {
			continue
		}
		if hourTime.After(now.Add(25 * time.Hour)) {
			break
		}
		hw := HourlyWeather{
			Time:        t,
			Temperature: omResp.Hourly.Temperature[i],
		}
		if i < len(omResp.Hourly.ApparentTemp) {
			hw.FeelsLike = omResp.Hourly.ApparentTemp[i]
		}
		if i < len(omResp.Hourly.Precipitation) {
			hw.Precipitation = omResp.Hourly.Precipitation[i]
		}
		if i < len(omResp.Hourly.PrecipProb) {
			hw.PrecipProb = omResp.Hourly.PrecipProb[i]
		}
		if i < len(omResp.Hourly.Humidity) {
			hw.Humidity = omResp.Hourly.Humidity[i]
		}
		if i < len(omResp.Hourly.WindSpeed) {
			hw.WindSpeed = omResp.Hourly.WindSpeed[i]
		}
		if i < len(omResp.Hourly.WeatherCode) {
			hw.WeatherCode = omResp.Hourly.WeatherCode[i]
			hw.Condition = weatherCodeToCondition(hw.WeatherCode)
		}
		data.Hourly = append(data.Hourly, hw)
	}

	// 7-day forecast
	for i, d := range omResp.Daily.Time {
		df := DailyForecast{Date: d}
		if i < len(omResp.Daily.TemperatureMax) {
			df.High = omResp.Daily.TemperatureMax[i]
		}
		if i < len(omResp.Daily.TemperatureMin) {
			df.Low = omResp.Daily.TemperatureMin[i]
		}
		if i < len(omResp.Daily.WeatherCode) {
			df.Condition = weatherCodeToCondition(omResp.Daily.WeatherCode[i])
		}
		if i < len(omResp.Daily.PrecipProb) {
			df.PrecipProb = omResp.Daily.PrecipProb[i]
		}
		if i < len(omResp.Daily.PrecipSum) {
			df.PrecipSum = omResp.Daily.PrecipSum[i]
		}
		if i < len(omResp.Daily.UVIndexMax) {
			df.UVIndex = omResp.Daily.UVIndexMax[i]
		}
		if i < len(omResp.Daily.Sunrise) {
			df.Sunrise = omResp.Daily.Sunrise[i]
		}
		if i < len(omResp.Daily.Sunset) {
			df.Sunset = omResp.Daily.Sunset[i]
			df.Dusk = estimateDusk(omResp.Daily.Sunset[i], s.tzLocation)
		}
		data.Daily = append(data.Daily, df)
	}

	if aq, err := s.fetchAirQuality(ctx, lat, lon); err == nil {
		data.AirQuality = aq
	}

	if cacheData, err := json.Marshal(data); err == nil {
		s.db.Exec(`INSERT OR REPLACE INTO ai_cache (id, cache_key, content, expires_at) VALUES (?, ?, ?, ?)`,
			cacheKey, cacheKey, string(cacheData), time.Now().In(s.tzLocation).Add(30*time.Minute).Format(time.RFC3339))
	}

	return data, nil
}

func estimateDusk(sunset string, loc *time.Location) string {
	t, err := time.ParseInLocation("2006-01-02T15:04", sunset, loc)
	if err != nil {
		return ""
	}
	return t.Add(30 * time.Minute).Format("2006-01-02T15:04")
}

type airQualityResponse struct {
	Current struct {
		AQI  *int     `json:"us_aqi"`
		PM25 *float64 `json:"pm2_5"`
		PM10 *float64 `json:"pm10"`
		Dust *float64 `json:"dust"`
	} `json:"current"`
}

func (s *WeatherService) fetchAirQuality(ctx context.Context, lat, lon float64) (*AirQuality, error) {
	url := fmt.Sprintf(
		"https://air-quality-api.open-meteo.com/v1/air-quality?latitude=%.4f&longitude=%.4f&current=us_aqi,pm2_5,pm10,dust",
		lat, lon,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("air quality API returned %d", resp.StatusCode)
	}

	var aqResp airQualityResponse
	if err := json.NewDecoder(resp.Body).Decode(&aqResp); err != nil {
		return nil, err
	}

	aqi := 0
	if aqResp.Current.AQI != nil {
		aqi = *aqResp.Current.AQI
	}
	aq := &AirQuality{
		AQI:   aqi,
		Level: aqiLevel(aqi),
	}
	if aqResp.Current.PM25 != nil {
		aq.PM25 = *aqResp.Current.PM25
	}
	if aqResp.Current.PM10 != nil {
		aq.PM10 = *aqResp.Current.PM10
	}
	if aqResp.Current.Dust != nil {
		aq.Dust = *aqResp.Current.Dust
	}
	return aq, nil
}

func aqiLevel(aqi int) string {
	switch {
	case aqi <= 50:
		return "Good"
	case aqi <= 100:
		return "Moderate"
	case aqi <= 150:
		return "Unhealthy for Sensitive"
	case aqi <= 200:
		return "Unhealthy"
	case aqi <= 300:
		return "Very Unhealthy"
	default:
		return "Hazardous"
	}
}

func weatherCodeToCondition(code int) string {
	switch {
	case code == 0:
		return "Clear"
	case code <= 3:
		return "Partly Cloudy"
	case code <= 48:
		return "Foggy"
	case code <= 55:
		return "Drizzle"
	case code <= 57:
		return "Freezing Drizzle"
	case code <= 65:
		return "Rain"
	case code <= 67:
		return "Freezing Rain"
	case code <= 75:
		return "Snow"
	case code == 77:
		return "Snow Grains"
	case code <= 82:
		return "Showers"
	case code <= 86:
		return "Snow Showers"
	case code == 95:
		return "Thunderstorm"
	case code <= 99:
		return "Thunderstorm with Hail"
	default:
		return "Unknown"
	}
}
