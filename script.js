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
let radarMetadata = null;

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

function formatDirection(degrees) {
  const compass = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return `${compass[index]} (${Math.round(degrees)}°)`;
}

function getWindDirectionArrow(degrees) {
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const index = Math.round(degrees / 45) % 8;
  return arrows[index];
}

function latLonToTile(lat, lon, zoom) {
  const x = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom)
  );
  return { x, y };
}

async function loadRadarMetadata() {
  if (radarMetadata) return radarMetadata;
  try {
    const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if (!response.ok) throw new Error('Radar metadata fetch failed');
    radarMetadata = await response.json();
  } catch (error) {
    console.warn('Unable to load radar metadata', error);
    radarMetadata = null;
  }
  return radarMetadata;
}

async function getRadarTileUrl(lat, lon) {
  const metadata = await loadRadarMetadata();
  if (!metadata?.radar?.past?.length) return null;
  const latestFrame = metadata.radar.past[metadata.radar.past.length - 1];
  const zoom = 5;
  const { x, y } = latLonToTile(lat, lon, zoom);
  return `https://tilecache.rainviewer.com/v2/radar/${latestFrame.time}/${zoom}/${x}/${y}/2/1_1.png`;
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

function getWeatherEmoji(code) {
  const map = {
    0: '☀️',
    1: '🌤️',
    2: '⛅',
    3: '☁️',
    45: '🌫️',
    48: '🌫️',
    51: '🌧️',
    53: '🌧️',
    55: '🌧️',
    56: '🌧️',
    57: '🌧️',
    61: '🌧️',
    63: '🌧️',
    65: '⛈️',
    66: '🌧️',
    67: '🌧️',
    71: '🌨️',
    73: '🌨️',
    75: '❄️',
    77: '🌨️',
    80: '🌦️',
    81: '🌦️',
    82: '⛈️',
    85: '🌨️',
    86: '❄️',
    95: '⛈️',
    96: '⛈️',
    99: '⛈️',
  };
  return map[code] || '🌈';
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

function getMoonPhaseValue(date) {  const year = date.getUTCFullYear();
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
  const moonMarker = svg.querySelector('.moon-marker');

  if (!sunrise || !sunset) {
    daylightArc.setAttribute('d', '');
    sunMarker.setAttribute('cx', 50);
    sunMarker.setAttribute('cy', 10);
    if (moonMarker) {
      moonMarker.setAttribute('cx', 50);
      moonMarker.setAttribute('cy', 90);
    }
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
  const moonAngle = ((currentHour + 12) % 24) * 15;

  // Draw daylight arc
  const path = createArcPath(sunriseAngle, sunsetAngle);
  daylightArc.setAttribute('d', path);

  // Position sun marker
  const sunPos = getCirclePosition(currentAngle);
  sunMarker.setAttribute('cx', sunPos.x);
  sunMarker.setAttribute('cy', sunPos.y);

  // Position moon marker opposite the current time on the 24-hour dial
  const moonPos = getCirclePosition(moonAngle);
  moonMarker.setAttribute('cx', moonPos.x);
  moonMarker.setAttribute('cy', moonPos.y);
}

function buildWeatherCard(location) {
  return `
    <article id="${location.cardId}" class="weather-card loading">
      <div class="card-header">
        <div>
          <p class="location-name">${location.name}</p>
          <p class="location-meta">${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}</p>
          <p class="condition-text">Loading current conditions…</p>
        </div>
        <div class="weather-icon">☁️</div>
      </div>

      <div class="current-row">
        <div>
          <p class="temperature">--°</p>
          <p class="temperature-sub">Waiting for data…</p>
        </div>
        <div class="stat-grid">
          <div class="stat-pill">
            <span>Wind</span>
            <strong class="wind-detail">—</strong>
          </div>
          <div class="stat-pill">
            <span>Humidity</span>
            <strong class="humidity-detail">—</strong>
          </div>
        </div>
      </div>

      <div class="weather-content">
        <div class="detail-row">
          <span>Sun times</span>
          <strong class="sun-detail">—</strong>
        </div>
        <div class="detail-row moon-detail-row">
          <span>Moon phase</span>
          <div class="moon-phase-inline">
            <span class="moon-phase-icon" id="${location.moonIconId}"></span>
            <strong class="moon-detail" id="${location.moonLabelId}">—</strong>
          </div>
        </div>
      </div>

      <div class="sun-moon-row">
        <section class="phase-panel sun-panel">
          <h3>Sun-Moon progress <span class="sun-moon-inline">🌙</span></h3>
          <div class="sun-dial">
            <svg class="sun-circle" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="black" stroke-width="8"/>
              <path class="daylight-arc" d="" fill="none" stroke="#ffe27d" stroke-width="8" stroke-linecap="round"/>
              <circle class="sun-marker" cx="50" cy="10" r="5" fill="#ffbb76" stroke="black" stroke-width="1"/>
              <circle class="moon-marker" cx="50" cy="90" r="4" fill="#fff" stroke="#000" stroke-width="1"/>
            </svg>
          </div>
          <div class="phase-label"><span id="${location.sunLabelId}">—</span></div>
        </section>
      </div>

      <section class="hourly-forecast">
        <p class="hourly-forecast-title">Hourly forecast</p>
        <div class="hourly-items"></div>
      </section>

      <section class="daily-forecast">
        <p class="daily-forecast-title">5-day outlook</p>
        <div class="daily-items"></div>
      </section>

      <section class="map-panel">
        <div class="map-details">
          <a class="map-link" href="https://www.rainviewer.com/map.html?loc=${location.latitude},${location.longitude},7" target="_blank" rel="noopener noreferrer">Open radar</a>
        </div>
      </section>
    </article>
  `;
}

function buildHourlyItems(data, currentIndex) {
  const start = currentIndex >= 0 ? currentIndex : 0;
  const slice = data.hourly.time.slice(start, start + 12);
  return slice
    .map((time, index) => {
      const actualIndex = start + index;
      const hour = new Date(time);
      const code = data.hourly.weathercode[actualIndex];
      const temp = convertTemperature(data.hourly.temperature_2m[actualIndex]);
      const rain = data.hourly.precipitation_probability[actualIndex];
      return `
        <div class="hourly-card">
          <strong>${formatHour(hour)}</strong>
          <span>${getWeatherEmoji(code)}</span>
          <span>${temp}°</span>
          <span>${rain}% rain</span>
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
      return `
        <div class="daily-card">
          <strong>${formatDay(date)}</strong>
          <span>${getWeatherEmoji(code)} ${weatherCodeMap[code] || 'Forecast'}</span>
          <span>${low}° / ${high}°</span>
        </div>
      `;
    })
    .join('');
}

function parseCoordinateInput(input) {
  const parts = input.split(',').map((part) => part.trim());
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    return { latitude: lat, longitude: lon, name: `${lat.toFixed(3)}, ${lon.toFixed(3)}` };
  }
  return null;
}

async function resolveLocation(query) {
  const coordinate = parseCoordinateInput(query);
  if (coordinate) return coordinate;
  const endpoint = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('Unable to search location');
  const data = await response.json();
  if (!data.results || !data.results.length) throw new Error('Location not found');
  const result = data.results[0];
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    name: `${result.name}${result.admin1 ? ', ' + result.admin1 : ''}${result.country ? ', ' + result.country : ''}`,
  };
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: currentTheme, unit: currentUnit, locations }));
}

function setStatusMessage(message) {
  const status = document.getElementById('status-message');
  if (!status) return;
  status.textContent = message;
}

function setTheme(theme) {
  currentTheme = theme;
  document.body.classList.toggle('theme-light', theme === 'light');
  document.getElementById('theme-toggle').textContent = theme === 'light' ? 'Dark theme' : 'Light theme';
  saveSettings();
}

function renderCards() {
  const root = document.getElementById('weather-root');
  root.innerHTML = locations.map(buildWeatherCard).join('');
}

async function updateLocationsFromInputs() {
  const input1 = document.getElementById('location-1-input').value.trim();
  const input2 = document.getElementById('location-2-input').value.trim();
  const resolved = [];

  try {
    resolved.push(await resolveLocation(input1 || defaultLocations[0].name));
  } catch (error) {
    console.warn('Location 1 resolution failed', error);
    resolved.push({ ...defaultLocations[0] });
  }

  try {
    resolved.push(await resolveLocation(input2 || defaultLocations[1].name));
  } catch (error) {
    console.warn('Location 2 resolution failed', error);
    resolved.push({ ...defaultLocations[1] });
  }

  locations = resolved.map((item, index) => ({
    ...defaultLocations[index],
    name: item.name,
    latitude: item.latitude,
    longitude: item.longitude,
  }));

  renderCards();
  saveSettings();
  setStatusMessage('Location loaded, refreshing weather…');
  await refreshWeather();
}

function showError(location, message) {
  const card = document.getElementById(location.cardId);
  if (!card) return;
  card.classList.remove('loading');
  const conditionText = card.querySelector('.condition-text');
  const temperatureEl = card.querySelector('.temperature');
  const temperatureSub = card.querySelector('.temperature-sub');
  conditionText && (conditionText.textContent = message);
  temperatureEl && (temperatureEl.textContent = '--°');
  temperatureSub && (temperatureSub.textContent = '');
}

async function fetchWeather(location) {
  const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,precipitation_probability,weathercode&daily=sunrise,sunset,weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`;
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
  let humidity = '--';
  const humidityIndex = data.hourly.time.findIndex((t) => new Date(t).getTime() === currentTimestamp);
  if (humidityIndex >= 0) {
    humidity = data.hourly.relativehumidity_2m[humidityIndex];
  } else {
    const fallbackIndex = data.hourly.time.findIndex((t) => new Date(t).getTime() >= currentTimestamp);
    if (fallbackIndex >= 0) {
      humidity = data.hourly.relativehumidity_2m[fallbackIndex];
    }
  }
  const windDirection = formatDirection(current.winddirection);
  const windArrow = getWindDirectionArrow(current.winddirection);
  const sunrise = new Date(data.daily.sunrise[0]);
  const sunset = new Date(data.daily.sunset[0]);
  const now = new Date(current.time);

  const conditionTextEl = card.querySelector('.condition-text');
  const weatherIconEl = card.querySelector('.weather-icon');
  const temperatureEl = card.querySelector('.temperature');
  const temperatureSubEl = card.querySelector('.temperature-sub');
  const humidityEl = card.querySelector('.humidity-detail');
  const sunDetailEl = card.querySelector('.sun-detail');
  const windDetailEl = card.querySelector('.wind-detail');

  if (conditionTextEl) conditionTextEl.textContent = weatherCodeMap[current.weathercode] || 'Weather';
  if (weatherIconEl) weatherIconEl.textContent = getWeatherEmoji(current.weathercode);
  if (temperatureEl) temperatureEl.textContent = `${convertTemperature(current.temperature)}°`;
  if (temperatureSubEl) temperatureSubEl.textContent = '';
  if (windDetailEl) windDetailEl.textContent = `${windArrow} ${windDirection}`;
  if (humidityEl) humidityEl.textContent = `${humidity ?? '--'}%`;
  if (sunDetailEl) sunDetailEl.textContent = `${formatTime(sunrise)} / ${formatTime(sunset)}`;

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
  card.querySelector('.map-link').href = `https://www.rainviewer.com/map.html?loc=${location.latitude},${location.longitude},7`;
  updateRadarPreview(card, location);
}

async function updateRadarPreview(card, location) {
  const radarImage = card.querySelector('.radar-image');
  if (!radarImage) return;
  const radarUrl = await getRadarTileUrl(location.latitude, location.longitude);
  if (radarUrl) {
    radarImage.src = radarUrl;
    radarImage.alt = `Radar preview for ${location.name}`;
  } else {
    radarImage.alt = 'Radar preview unavailable';
  }
}


async function refreshWeather() {
  setStatusMessage('Fetching latest weather data…');
  document.getElementById('last-updated').textContent = 'Updating…';
  await Promise.all(locations.map((location) => fetchWeather(location)));
  document.getElementById('last-updated').textContent = `Last updated: ${new Date().toLocaleString()}`;
  setStatusMessage('Weather updated');
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
  locations = stored && Array.isArray(stored.locations) ? stored.locations : defaultLocations;
  currentTheme = stored && stored.theme ? stored.theme : 'dark';
  let savedUnit = stored && stored.unit ? stored.unit : 'metric';
  if (savedUnit === 'celsius') savedUnit = 'metric';
  if (savedUnit === 'fahrenheit') savedUnit = 'english';
  currentUnit = savedUnit;
  setTheme(currentTheme);

  renderCards();

  document.getElementById('location-1-input').value = locations[0].name;
  document.getElementById('location-2-input').value = locations[1].name;

  document.getElementById('load-locations-btn').addEventListener('click', async () => {
    await updateLocationsFromInputs();
  });

  document.getElementById('refresh-btn').addEventListener('click', refreshWeather);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });
  document.getElementById('unit-toggle').addEventListener('click', () => {
    currentUnit = currentUnit === 'metric' ? 'english' : 'metric';
    saveSettings();
    refreshDisplay();
  });

  updateCurrentTime();
  setInterval(updateCurrentTime, 60000);
  await refreshWeather();
}

window.addEventListener('DOMContentLoaded', init);
