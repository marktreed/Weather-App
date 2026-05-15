const weatherCodeMap = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Moderate showers',
  82: 'Violent showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
};

const defaultLocations = [
  {
    id: 1,
    name: 'Terrebonne, Oregon',
    latitude: 44.4066,
    longitude: -121.0823,
    cardId: 'location-1-card',
    sunLabelId: 'location-1-sun-label',
    moonLabelId: 'location-1-moon-label',
    moonIconId: 'location-1-moon-icon',
  },
  {
    id: 2,
    name: 'West Menlo Park, California',
    latitude: 37.4626,
    longitude: -122.1826,
    cardId: 'location-2-card',
    sunLabelId: 'location-2-sun-label',
    moonLabelId: 'location-2-moon-label',
    moonIconId: 'location-2-moon-icon',
  },
];

const STORAGE_KEY = 'weather-dashboard-settings';
let locations = [];
let currentTheme = 'dark';
let currentUnit = 'metric';
let weatherData = {};

function convertTemperature(celsius) {
  if (currentUnit === 'english') {
    return Math.round(celsius * 9 / 5 + 32);
  }
  return Math.round(celsius);
}

function convertWindSpeed(kmh) {
  if (currentUnit === 'english') {
    return Math.round(kmh * 0.621371);
  }
  return Math.round(kmh);
}

function formatCompassDirection(degrees) {
  const compass = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return compass[index];
}

function formatWindForecast(speed, direction) {
  if (!Number.isFinite(speed) || !Number.isFinite(direction)) return '--';
  const unit = currentUnit === 'english' ? 'mph' : 'km/h';
  return `${convertWindSpeed(speed)} ${unit} ${formatCompassDirection(direction)}`;
}

function formatDirection(degrees) {
  const direction = formatCompassDirection(degrees);
  return `${direction} (${Math.round(degrees)}\u00b0)`;
}

function getWindDirectionArrow(degrees) {
  const arrows = ['\u2191', '\u2197', '\u2192', '\u2198', '\u2193', '\u2199', '\u2190', '\u2196'];
  const index = Math.round(degrees / 45) % 8;
  return arrows[index];
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatCurrentTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatHour(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDay(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const astroRad = Math.PI / 180;
const astroDayMs = 1000 * 60 * 60 * 24;
const astroJ1970 = 2440588;
const astroJ2000 = 2451545;
const astroObliquity = astroRad * 23.4397;

function toJulian(date) {
  return date.valueOf() / astroDayMs - 0.5 + astroJ1970;
}

function toDays(date) {
  return toJulian(date) - astroJ2000;
}

function rightAscension(l, b) {
  return Math.atan2(
    Math.sin(l) * Math.cos(astroObliquity) - Math.tan(b) * Math.sin(astroObliquity),
    Math.cos(l)
  );
}

function declination(l, b) {
  return Math.asin(
    Math.sin(b) * Math.cos(astroObliquity) + Math.cos(b) * Math.sin(astroObliquity) * Math.sin(l)
  );
}

function siderealTime(days, lw) {
  return astroRad * (280.16 + 360.9856235 * days) - lw;
}

function altitude(H, phi, dec) {
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
}

function astroRefraction(height) {
  const adjustedHeight = height < 0 ? 0 : height;
  return 0.0002967 / Math.tan(adjustedHeight + 0.00312536 / (adjustedHeight + 0.08901179));
}

function moonCoords(days) {
  const L = astroRad * (218.316 + 13.176396 * days);
  const M = astroRad * (134.963 + 13.064993 * days);
  const F = astroRad * (93.272 + 13.22935 * days);
  const l = L + astroRad * 6.289 * Math.sin(M);
  const b = astroRad * 5.128 * Math.sin(F);

  return {
    ra: rightAscension(l, b),
    dec: declination(l, b),
  };
}

function getMoonAltitude(date, latitude, longitude) {
  const lw = astroRad * -longitude;
  const phi = astroRad * latitude;
  const days = toDays(date);
  const coords = moonCoords(days);
  const H = siderealTime(days, lw) - coords.ra;
  return altitude(H, phi, coords.dec) + astroRefraction(altitude(H, phi, coords.dec));
}

function hoursLater(date, hours) {
  return new Date(date.valueOf() + hours * 60 * 60 * 1000);
}

function getMoonTimes(date, latitude, longitude) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const horizon = 0.133 * astroRad;
  let h0 = getMoonAltitude(start, latitude, longitude) - horizon;
  let rise = null;
  let set = null;
  let ye = 0;

  for (let hour = 1; hour <= 24; hour += 2) {
    const h1 = getMoonAltitude(hoursLater(start, hour), latitude, longitude) - horizon;
    const h2 = getMoonAltitude(hoursLater(start, hour + 1), latitude, longitude) - horizon;
    const a = (h0 + h2) / 2 - h1;
    const b = (h2 - h0) / 2;
    const xe = -b / (2 * a);
    ye = (a * xe + b) * xe + h1;
    const discriminant = b * b - 4 * a * h1;
    let roots = 0;
    let x1 = 0;
    let x2 = 0;

    if (discriminant >= 0) {
      const dx = Math.sqrt(discriminant) / (Math.abs(a) * 2);
      x1 = xe - dx;
      x2 = xe + dx;
      if (Math.abs(x1) <= 1) roots += 1;
      if (Math.abs(x2) <= 1) roots += 1;
      if (x1 < -1) x1 = x2;
    }

    if (roots === 1) {
      if (h0 < 0) rise = hour + x1;
      else set = hour + x1;
    } else if (roots === 2) {
      rise = hour + (ye < 0 ? x2 : x1);
      set = hour + (ye < 0 ? x1 : x2);
    }

    if (rise !== null && set !== null) break;
    h0 = h2;
  }

  if (rise !== null || set !== null) {
    return {
      rise: rise === null ? null : hoursLater(start, rise),
      set: set === null ? null : hoursLater(start, set),
    };
  }

  return ye > 0 ? { alwaysUp: true } : { alwaysDown: true };
}

function formatMoonTimes(times) {
  if (times.rise && times.set) return `${formatTime(times.rise)} / ${formatTime(times.set)}`;
  if (times.rise) return `${formatTime(times.rise)} / No set`;
  if (times.set) return `No rise / ${formatTime(times.set)}`;
  if (times.alwaysUp) return 'Above horizon all day';
  if (times.alwaysDown) return 'Below horizon all day';
  return 'Unavailable';
}

function getWeatherEmoji(code) {
  const map = {
    0: '\u2600\uFE0F',
    1: '\uD83C\uDF24\uFE0F',
    2: '\u26C5',
    3: '\u2601\uFE0F',
    45: '\uD83C\uDF2B\uFE0F',
    48: '\uD83C\uDF2B\uFE0F',
    51: '\uD83C\uDF27\uFE0F',
    53: '\uD83C\uDF27\uFE0F',
    55: '\uD83C\uDF27\uFE0F',
    56: '\uD83C\uDF27\uFE0F',
    57: '\uD83C\uDF27\uFE0F',
    61: '\uD83C\uDF27\uFE0F',
    63: '\uD83C\uDF27\uFE0F',
    65: '\u26C8\uFE0F',
    66: '\uD83C\uDF27\uFE0F',
    67: '\uD83C\uDF27\uFE0F',
    71: '\uD83C\uDF28\uFE0F',
    73: '\uD83C\uDF28\uFE0F',
    75: '\u2744\uFE0F',
    77: '\uD83C\uDF28\uFE0F',
    80: '\uD83C\uDF26\uFE0F',
    81: '\uD83C\uDF26\uFE0F',
    82: '\u26C8\uFE0F',
    85: '\uD83C\uDF28\uFE0F',
    86: '\u2744\uFE0F',
    95: '\u26C8\uFE0F',
    96: '\u26C8\uFE0F',
    99: '\u26C8\uFE0F',
  };
  return map[code] || '\uD83C\uDF08';
}

function getMoonPhaseLabel(value) {
  if (value === null || value === undefined) return 'Unknown';
  if (value < 0.03 || value > 0.97) return 'New Moon';
  if (value < 0.22) return 'Waxing Crescent';
  if (value < 0.28) return 'First Quarter';
  if (value < 0.47) return 'Waxing Gibbous';
  if (value < 0.53) return 'Full Moon';
  if (value < 0.72) return 'Waning Gibbous';
  if (value < 0.78) return 'Last Quarter';
  return 'Waning Crescent';
}

function getMoonIcon(value) {
  if (value === null || value === undefined) return 'phase-new';
  if (value < 0.03 || value > 0.97) return 'phase-new';
  if (value < 0.22) return 'phase-waxing-crescent';
  if (value < 0.28) return 'phase-first-quarter';
  if (value < 0.47) return 'phase-waxing-gibbous';
  if (value < 0.53) return 'phase-full';
  if (value < 0.72) return 'phase-waning-gibbous';
  if (value < 0.78) return 'phase-last-quarter';
  return 'phase-waning-crescent';
}

function getMoonPhaseValue(date) {
  const year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1;
  let day = date.getUTCDate() + date.getUTCHours() / 24 + date.getUTCMinutes() / 1440 + date.getUTCSeconds() / 86400;
  let y = year;
  let m = month;
  if (m < 3) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
  const daysSinceNew = jd - 2451549.5;
  const phase = (daysSinceNew / 29.530588853) % 1;
  return phase < 0 ? phase + 1 : phase;
}

function calculateSunPhase(now, sunrise, sunset) {
  if (!sunrise || !sunset) return { label: 'Unknown', ratio: 0 };
  if (now < sunrise) return { label: 'Before sunrise', ratio: 0 };
  if (now > sunset) return { label: 'After sunset', ratio: 1 };
  const total = sunset - sunrise;
  const elapsed = now - sunrise;
  const ratio = Math.min(Math.max(elapsed / total, 0), 1);
  const percent = Math.round(ratio * 100);
  return { label: `${percent}% daylight`, ratio, percent };
}

function getCirclePosition(angle, radius = 40, center = 50) {
  const rad = (angle - 90) * (Math.PI / 180); // -90 to start at top
  const x = center + radius * Math.cos(rad);
  const y = center + radius * Math.sin(rad);
  return { x, y };
}

function createArcPath(startAngle, endAngle, radius = 40, center = 50) {
  const start = getCirclePosition(startAngle, radius, center);
  const end = getCirclePosition(endAngle, radius, center);
  const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function updateSunDial(card, now, sunrise, sunset) {
  const svg = card.querySelector('.sun-circle');
  if (!svg) return;

  const daylightArc = svg.querySelector('.daylight-arc');
  const sunMarker = svg.querySelector('.sun-marker');

  if (!sunrise || !sunset) {
    daylightArc.setAttribute('d', '');
    sunMarker.setAttribute('cx', 50);
    sunMarker.setAttribute('cy', 10);
    return;
  }

  // Calculate hours
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const sunriseHour = (sunrise - midnight) / (1000 * 60 * 60);
  const sunsetHour = (sunset - midnight) / (1000 * 60 * 60);
  const currentHour = (now - midnight) / (1000 * 60 * 60);

  // Angles: 15 degrees per hour, starting at top (midnight)
  const sunriseAngle = sunriseHour * 15;
  const sunsetAngle = sunsetHour * 15;
  const currentAngle = currentHour * 15;

  // Draw daylight arc
  const path = createArcPath(sunriseAngle, sunsetAngle);
  daylightArc.setAttribute('d', path);

  // Position sun marker
  const sunPos = getCirclePosition(currentAngle);
  sunMarker.setAttribute('cx', sunPos.x);
  sunMarker.setAttribute('cy', sunPos.y);
}

function buildWeatherCard(location) {
  return `
    <article id="${location.cardId}" class="weather-card loading">
      <div class="card-header">
        <div>
          <p class="location-name">${location.name}</p>
          <p class="location-meta">${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}</p>
          <p class="condition-text">Loading current conditions&hellip;</p>
        </div>
        <div class="weather-icon">${getWeatherEmoji(3)}</div>
      </div>

      <div class="current-row">
        <div>
          <p class="temperature">--&deg;</p>
          <p class="temperature-sub">Waiting for data&hellip;</p>
        </div>
        <div class="stat-grid">
          <div class="stat-pill">
            <span>Wind</span>
            <strong class="wind-detail">&mdash;</strong>
          </div>
          <div class="stat-pill">
            <span>Humidity</span>
            <strong class="humidity-detail">&mdash;</strong>
          </div>
          <div class="stat-pill">
            <span>Rain</span>
            <strong class="rain-detail">&mdash;</strong>
          </div>
        </div>
      </div>

      <div class="today-summary">
        <div class="summary-pill">
          <span>High / Low</span>
          <strong class="summary-temp">&mdash;</strong>
        </div>
        <div class="summary-pill">
          <span>Max wind</span>
          <strong class="summary-wind">&mdash;</strong>
        </div>
        <div class="summary-pill">
          <span>Today rain</span>
          <strong class="summary-rain">&mdash;</strong>
        </div>
      </div>

      <div class="weather-content">
        <div class="detail-row">
          <span>Sun rise/set</span>
          <strong class="sun-detail">&mdash;</strong>
        </div>
        <div class="detail-row">
          <span>Moon rise/set</span>
          <strong class="moon-times-detail">&mdash;</strong>
        </div>
        <div class="detail-row moon-detail-row">
          <span>Moon phase</span>
          <div class="moon-phase-inline">
            <span class="moon-phase-icon" id="${location.moonIconId}"></span>
            <strong class="moon-detail" id="${location.moonLabelId}">&mdash;</strong>
          </div>
        </div>
      </div>

      <div class="sun-moon-row">
        <section class="phase-panel sun-panel">
          <h3>Sun Progress</h3>
          <div class="sun-dial">
            <svg class="sun-circle" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="black" stroke-width="8"/>
              <path class="daylight-arc" d="" fill="none" stroke="#ffe27d" stroke-width="8" stroke-linecap="round"/>
              <circle class="sun-marker" cx="50" cy="10" r="5" fill="#ffbb76" stroke="black" stroke-width="1"/>
            </svg>
            <span class="dial-time dial-time-midnight">12 AM</span>
            <span class="dial-time dial-time-6am">6 AM</span>
            <span class="dial-time dial-time-noon">12 PM</span>
            <span class="dial-time dial-time-6pm">6 PM</span>
          </div>
          <div class="phase-label"><span id="${location.sunLabelId}">&mdash;</span></div>
        </section>
      </div>

      <section class="hourly-forecast">
        <p class="hourly-forecast-title">Hourly forecast</p>
        <div class="forecast-labels hourly-labels">
          <span>Time</span>
          <span>Sky</span>
          <span>Temp</span>
          <span>Rain</span>
          <span>Wind</span>
        </div>
        <div class="hourly-items"></div>
      </section>

      <section class="daily-forecast">
        <p class="daily-forecast-title">5-day outlook</p>
        <div class="forecast-labels daily-labels">
          <span>Day</span>
          <span>Forecast</span>
          <span>Temp</span>
          <span>Wind</span>
        </div>
        <div class="daily-items"></div>
      </section>

      <section class="map-panel">
        <div class="map-details">
          <a class="map-link" href="https://www.rainviewer.com/map.html?loc=${location.latitude},${location.longitude},10" target="_blank" rel="noopener noreferrer">Open radar</a>
        </div>
      </section>
    </article>
  `;
}

function buildHourlyItems(data, currentIndex) {
  const start = currentIndex >= 0 ? currentIndex : 0;
  const slice = data.hourly.time.slice(start, start + 6);
  return slice
    .map((time, index) => {
      const actualIndex = start + index;
      const hour = new Date(time);
      const code = data.hourly.weathercode[actualIndex];
      const temp = convertTemperature(data.hourly.temperature_2m[actualIndex]);
      const rain = data.hourly.precipitation_probability[actualIndex];
      const wind = formatWindForecast(
        data.hourly.windspeed_10m?.[actualIndex],
        data.hourly.winddirection_10m?.[actualIndex]
      );
      return `
        <div class="hourly-card">
          <strong>${formatHour(hour)}</strong>
          <span>${getWeatherEmoji(code)}</span>
          <span>${temp}&deg;</span>
          <span>${rain}% rain</span>
          <span>${wind}</span>
        </div>
      `;
    })
    .join('');
}

function buildDailyItems(data) {
  return data.daily.time
    .slice(0, 5)
    .map((day, index) => {
      const date = new Date(day);
      const code = data.daily.weathercode[index];
      const low = convertTemperature(data.daily.temperature_2m_min[index]);
      const high = convertTemperature(data.daily.temperature_2m_max[index]);
      const wind = formatWindForecast(
        data.daily.windspeed_10m_max?.[index],
        data.daily.winddirection_10m_dominant?.[index]
      );
      return `
        <div class="daily-card">
          <strong>${formatDay(date)}</strong>
          <span>${getWeatherEmoji(code)} ${weatherCodeMap[code] || 'Forecast'}</span>
          <span>${low}&deg; / ${high}&deg;</span>
          <span>${wind}</span>
        </div>
      `;
    })
    .join('');
}

function loadStoredSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: currentTheme, unit: currentUnit }));
}

function setTheme(theme) {
  currentTheme = theme;
  document.body.classList.toggle('theme-light', theme === 'light');
  document.getElementById('theme-toggle').textContent = theme === 'light' ? 'Dark theme' : 'Light theme';
  saveSettings();
}

function updateUnitToggleLabel() {
  const button = document.getElementById('unit-toggle');
  if (!button) return;
  button.textContent = currentUnit === 'metric' ? 'Units: Metric' : 'Units: English';
}

function renderCards() {
  const root = document.getElementById('weather-root');
  root.innerHTML = locations.map(buildWeatherCard).join('');
}

function showError(location, message) {
  const card = document.getElementById(location.cardId);
  if (!card) return;
  card.classList.remove('loading');
  const conditionText = card.querySelector('.condition-text');
  const temperatureEl = card.querySelector('.temperature');
  const temperatureSub = card.querySelector('.temperature-sub');
  conditionText && (conditionText.textContent = message);
  temperatureEl && (temperatureEl.textContent = '--\u00b0');
  temperatureSub && (temperatureSub.textContent = '');
}

function findCurrentHourlyIndex(data, currentTimestamp) {
  const exactIndex = data.hourly.time.findIndex((time) => new Date(time).getTime() === currentTimestamp);
  if (exactIndex >= 0) return exactIndex;
  return data.hourly.time.findIndex((time) => new Date(time).getTime() >= currentTimestamp);
}

function getRemainingTodayRainChance(data, now) {
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const chances = data.hourly.time
    .map((time, index) => ({ time: new Date(time), chance: data.hourly.precipitation_probability[index] }))
    .filter(({ time, chance }) => time >= now && time <= endOfDay && Number.isFinite(chance))
    .map(({ chance }) => chance);

  return chances.length ? Math.max(...chances) : null;
}

async function fetchWeather(location) {
  const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true&hourly=temperature_2m,apparent_temperature,relativehumidity_2m,precipitation_probability,weathercode,windspeed_10m,winddirection_10m&daily=sunrise,sunset,weathercode,temperature_2m_max,temperature_2m_min,windspeed_10m_max,winddirection_10m_dominant&timezone=auto`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    if (!data.current_weather || !data.daily) throw new Error('Weather data missing');
    updateCard(location, data);
    weatherData[location.id] = data;
  } catch (error) {
    showError(location, 'Unable to load weather');
    console.error('Weather fetch failed for', location.name, error);
  }
}

function updateCard(location, data) {
  const card = document.getElementById(location.cardId);
  if (!card) return;

  card.classList.remove('loading');
  const current = data.current_weather;
  const currentTimestamp = new Date(current.time).getTime();
  const currentHourlyIndex = findCurrentHourlyIndex(data, currentTimestamp);
  const humidity = currentHourlyIndex >= 0 ? data.hourly.relativehumidity_2m[currentHourlyIndex] : '--';
  const rainChance = currentHourlyIndex >= 0 ? data.hourly.precipitation_probability[currentHourlyIndex] : '--';
  const apparentTemperature = currentHourlyIndex >= 0 ? data.hourly.apparent_temperature[currentHourlyIndex] : null;
  const windDirection = formatDirection(current.winddirection);
  const windArrow = getWindDirectionArrow(current.winddirection);
  const windSpeed = convertWindSpeed(current.windspeed);
  const windUnit = currentUnit === 'english' ? 'mph' : 'km/h';
  const sunrise = new Date(data.daily.sunrise[0]);
  const sunset = new Date(data.daily.sunset[0]);
  const now = new Date(current.time);
  const moonTimes = getMoonTimes(now, location.latitude, location.longitude);
  const todayLow = convertTemperature(data.daily.temperature_2m_min[0]);
  const todayHigh = convertTemperature(data.daily.temperature_2m_max[0]);
  const todayMaxWind = formatWindForecast(
    data.daily.windspeed_10m_max?.[0],
    data.daily.winddirection_10m_dominant?.[0]
  );
  const todayRainChance = getRemainingTodayRainChance(data, now);

  const conditionTextEl = card.querySelector('.condition-text');
  const weatherIconEl = card.querySelector('.weather-icon');
  const temperatureEl = card.querySelector('.temperature');
  const temperatureSubEl = card.querySelector('.temperature-sub');
  const humidityEl = card.querySelector('.humidity-detail');
  const rainEl = card.querySelector('.rain-detail');
  const sunDetailEl = card.querySelector('.sun-detail');
  const moonTimesEl = card.querySelector('.moon-times-detail');
  const windDetailEl = card.querySelector('.wind-detail');
  const summaryTempEl = card.querySelector('.summary-temp');
  const summaryWindEl = card.querySelector('.summary-wind');
  const summaryRainEl = card.querySelector('.summary-rain');

  if (conditionTextEl) conditionTextEl.textContent = weatherCodeMap[current.weathercode] || 'Weather';
  if (weatherIconEl) weatherIconEl.textContent = getWeatherEmoji(current.weathercode);
  if (temperatureEl) temperatureEl.textContent = `${convertTemperature(current.temperature)}\u00b0`;
  if (temperatureSubEl) {
    temperatureSubEl.textContent = apparentTemperature === null
      ? ''
      : `Feels like ${convertTemperature(apparentTemperature)}\u00b0`;
  }
  if (windDetailEl) windDetailEl.textContent = `${windArrow} ${windDirection} @ ${windSpeed} ${windUnit}`;
  if (humidityEl) humidityEl.textContent = `${humidity ?? '--'}%`;
  if (rainEl) rainEl.textContent = `${rainChance ?? '--'}%`;
  if (sunDetailEl) sunDetailEl.textContent = `${formatTime(sunrise)} / ${formatTime(sunset)}`;
  if (moonTimesEl) moonTimesEl.textContent = formatMoonTimes(moonTimes);
  if (summaryTempEl) summaryTempEl.textContent = `${todayHigh}\u00b0 / ${todayLow}\u00b0`;
  if (summaryWindEl) summaryWindEl.textContent = todayMaxWind;
  if (summaryRainEl) summaryRainEl.textContent = todayRainChance === null ? '--' : `${todayRainChance}%`;

  const moonValue = getMoonPhaseValue(new Date());
  const moonDetail = card.querySelector('.moon-detail');
  if (moonDetail) {
    moonDetail.textContent = `${getMoonPhaseLabel(moonValue)}`;
  }
  const moonIcon = document.getElementById(location.moonIconId);
  if (moonIcon) {
    const moonClass = getMoonIcon(moonValue);
    moonIcon.className = `moon-phase-icon ${moonClass}`;
    moonIcon.textContent = '';
    moonIcon.setAttribute('title', getMoonPhaseLabel(moonValue));
  }

  const sunPhase = calculateSunPhase(now, sunrise, sunset);
  const sunLabelEl = document.getElementById(location.sunLabelId);
  if (sunLabelEl) sunLabelEl.textContent = sunPhase.label;
  updateSunDial(card, now, sunrise, sunset);

  const hourlyIndex = data.hourly.time.findIndex((t) => new Date(t).getTime() >= now.getTime());
  const startIndex = hourlyIndex >= 0 ? hourlyIndex : 0;
  card.querySelector('.hourly-items').innerHTML = buildHourlyItems(data, startIndex);
  card.querySelector('.daily-items').innerHTML = buildDailyItems(data);
  card.querySelector('.map-link').href = `https://www.rainviewer.com/map.html?loc=${location.latitude},${location.longitude},10`;
}

async function refreshWeather() {
  document.getElementById('last-updated').textContent = 'Updating\u2026';
  await Promise.all(locations.map((location) => fetchWeather(location)));
  document.getElementById('last-updated').textContent = `Last updated: ${new Date().toLocaleString()}`;
}

function updateCurrentTime() {
  const now = new Date();
  const currentTime = document.getElementById('current-time');
  if (currentTime) {
    currentTime.textContent = `Current time: ${formatCurrentTime(now)}`;
  }
}

function refreshDisplay() {
  locations.forEach(location => {
    if (weatherData[location.id]) {
      updateCard(location, weatherData[location.id]);
    }
  });
}

async function init() {
  const stored = loadStoredSettings();
  locations = defaultLocations.map((location) => ({ ...location }));
  currentTheme = stored && stored.theme ? stored.theme : 'dark';
  let savedUnit = stored && stored.unit ? stored.unit : 'metric';
  if (savedUnit === 'celsius') savedUnit = 'metric';
  if (savedUnit === 'fahrenheit') savedUnit = 'english';
  currentUnit = savedUnit;
  setTheme(currentTheme);
  updateUnitToggleLabel();

  renderCards();

  document.getElementById('refresh-btn').addEventListener('click', refreshWeather);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });
  document.getElementById('unit-toggle').addEventListener('click', () => {
    currentUnit = currentUnit === 'metric' ? 'english' : 'metric';
    updateUnitToggleLabel();
    saveSettings();
    refreshDisplay();
  });

  updateCurrentTime();
  setInterval(updateCurrentTime, 60000);
  await refreshWeather();
}

window.addEventListener('DOMContentLoaded', init);
