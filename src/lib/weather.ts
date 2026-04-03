/**
 * Weather modifier for FSI scoring.
 * Data source: Open-Meteo (free, no API key, Philadelphia coords).
 */

export interface WeatherData {
  condition: string;
  label:     string;
  icon:      string;
  temp:      number;   // °C
  modifier:  number;   // 0.0 – 1.0 multiplied into FSI total
}

// WMO weather code → FSI modifier
// Heavy rain / snow / storm makes streets unsafe to open → reduce score
function interpretWeather(code: number, temp: number): WeatherData {
  if (code === 0 || code === 1)
    return { condition: 'clear',     label: 'Clear',        icon: '☀️',  temp, modifier: 1.00 };
  if (code <= 3)
    return { condition: 'cloudy',    label: 'Cloudy',       icon: '☁️',  temp, modifier: 1.00 };
  if (code <= 48)
    return { condition: 'fog',       label: 'Foggy',        icon: '🌫️', temp, modifier: 0.85 };
  if (code <= 57)
    return { condition: 'drizzle',   label: 'Drizzle',      icon: '🌦️', temp, modifier: 0.85 };
  if (code <= 67)
    return { condition: 'rain',      label: 'Rain',         icon: '🌧️', temp, modifier: 0.60 };
  if (code <= 77)
    return { condition: 'snow',      label: 'Snow',         icon: '❄️',  temp, modifier: 0.20 };
  if (code <= 82)
    return { condition: 'showers',   label: 'Rain Showers', icon: '🌧️', temp, modifier: 0.60 };
  if (code <= 86)
    return { condition: 'snowshower',label: 'Snow Showers', icon: '❄️',  temp, modifier: 0.20 };
  return   { condition: 'storm',     label: 'Thunderstorm', icon: '⛈️', temp, modifier: 0.30 };
}

export async function fetchWeather(): Promise<WeatherData> {
  // Philadelphia: 39.9526°N, 75.1652°W
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=39.9526&longitude=-75.1652' +
    '&current=weather_code,temperature_2m' +
    '&temperature_unit=celsius&timezone=America%2FNew_York';

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    const code = json.current.weather_code as number;
    const temp = Math.round(json.current.temperature_2m as number);
    return interpretWeather(code, temp);
  } catch (err) {
    console.warn('fetchWeather error:', err);
    // Neutral fallback — don't penalise when API is unreachable
    return { condition: 'unknown', label: 'N/A', icon: '—', temp: 0, modifier: 1.0 };
  }
}
