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
    latitude: 44.35333,
    longitude: -121.18083,
    elevationMeters: 876,
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
let activeLocationId = defaultLocations[0].id;

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

function convertVisibility(meters) {
  if (!Number.isFinite(meters)) return null;
  if (currentUnit === 'english') {
    return {
      value: Math.round((meters / 1609.344) * 10) / 10,
      unit: 'mi',
    };
  }
  return {
    value: Math.round((meters / 1000) * 10) / 10,
    unit: 'km',
  };
}

function convertPressure(hpa) {
  if (!Number.isFinite(hpa)) return null;
  if (currentUnit === 'english') {
    return {
      value: (hpa * 0.0295299830714).toFixed(2),
      unit: 'in',
    };
  }
  return {
    value: Math.round(hpa),
    unit: 'hPa',
  };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function getComfortLabel(value, ranges) {
  if (!Number.isFinite(value)) return 'Unavailable';
  const match = ranges.find((range) => value <= range.max);
  return match ? match.label : ranges[ranges.length - 1].label;
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

function formatCompactHour(date) {
  return date
    .toLocaleTimeString([], { hour: 'numeric' })
    .replace(/\s/g, '')
    .toLowerCase();
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

function buildTemperatureRibbon(data, startIndex) {
  const slice = data.hourly.temperature_2m.slice(startIndex, startIndex + 12);
  const temps = slice.length ? slice : data.hourly.temperature_2m.slice(0, 12);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const range = Math.max(max - min, 1);
  const width = 360;
  const height = 118;
  const xStep = width / Math.max(temps.length - 1, 1);
  const points = temps.map((temp, index) => {
    const x = index * xStep;
    const y = 86 - ((temp - min) / range) * 58;
    return { x, y, temp, index };
  });
  const linePoints = points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const lowIndex = temps.indexOf(min);
  const highIndex = temps.indexOf(max);

  const markers = points
    .map(({ x, y, temp, index }) => {
      const hour = new Date(data.hourly.time[startIndex + index] || data.hourly.time[index]);
      const showLabel = index === 0 || index === 4 || index === 8 || index === points.length - 1;
      const markerClass = index === 0 ? 'temp-point current' : 'temp-point';
      const label = showLabel
        ? `<text class="temp-time-label" x="${x.toFixed(1)}" y="114" text-anchor="${index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}">${formatCompactHour(hour)}</text>`
        : '';
      return `
        <circle class="${markerClass}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${index === 0 ? 5 : 3.5}">
          <title>${formatHour(hour)} ${convertTemperature(temp)}\u00b0</title>
        </circle>
        ${label}
      `;
    })
    .join('');
  const extremes = points
    .filter(({ index }) => index === lowIndex || index === highIndex)
    .map(({ x, y, temp, index }) => {
      const isLow = index === lowIndex;
      const anchor = x < 48 ? 'start' : x > width - 48 ? 'end' : 'middle';
      const labelY = clamp(y + (isLow ? -12 : -12), 12, 92);
      return `<text class="temp-extreme-label ${isLow ? 'low' : 'high'}" x="${x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}">${convertTemperature(temp)}\u00b0</text>`;
    })
    .join('');

  return `
    <svg class="temperature-ribbon-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Next 12 hour temperature trend">
      <defs>
        <linearGradient id="temp-ribbon-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#88c7aa" />
          <stop offset="52%" stop-color="#e8cf62" />
          <stop offset="100%" stop-color="#efbd3d" />
        </linearGradient>
      </defs>
      <polyline class="temp-ribbon-fill" points="0,96 ${linePoints} ${width},96" />
      <polyline class="temp-ribbon-line" points="${linePoints}" />
      ${extremes}
      ${markers}
    </svg>
  `;
}

function buildWindRibbon(data, startIndex) {
  const slice = data.hourly.windspeed_10m.slice(startIndex, startIndex + 12);
  const speeds = slice.length ? slice : data.hourly.windspeed_10m.slice(0, 12);
  const converted = speeds.map(convertWindSpeed);
  const min = Math.min(...converted);
  const max = Math.max(...converted);
  const range = Math.max(max - min, 1);
  const width = 360;
  const height = 118;
  const xStep = width / Math.max(converted.length - 1, 1);
  const points = converted.map((speed, index) => {
    const x = index * xStep;
    const y = 86 - ((speed - min) / range) * 58;
    return { x, y, speed, index };
  });
  const linePoints = points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const lowIndex = converted.indexOf(min);
  const highIndex = converted.indexOf(max);
  const unit = currentUnit === 'english' ? 'mph' : 'km/h';
  const markers = points
    .map(({ x, y, speed, index }) => {
      const hour = new Date(data.hourly.time[startIndex + index] || data.hourly.time[index]);
      const showLabel = index === 0 || index === 4 || index === 8 || index === points.length - 1;
      const label = showLabel
        ? `<text class="temp-time-label" x="${x.toFixed(1)}" y="114" text-anchor="${index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}">${formatCompactHour(hour)}</text>`
        : '';
      return `
        <circle class="${index === 0 ? 'wind-point current' : 'wind-point'}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${index === 0 ? 5 : 3.5}">
          <title>${formatHour(hour)} ${speed} ${unit}</title>
        </circle>
        ${label}
      `;
    })
    .join('');
  const extremes = points
    .filter(({ index }) => index === lowIndex || index === highIndex)
    .map(({ x, y, speed, index }) => {
      const anchor = x < 48 ? 'start' : x > width - 48 ? 'end' : 'middle';
      const labelY = clamp(y - 12, 12, 92);
      return `<text class="wind-extreme-label ${index === lowIndex ? 'low' : 'high'}" x="${x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}">${speed}</text>`;
    })
    .join('');

  return `
    <svg class="wind-ribbon-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Next 12 hour wind speed trend">
      <defs>
        <linearGradient id="wind-ribbon-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#8cc7d9" />
          <stop offset="55%" stop-color="#6ea0f6" />
          <stop offset="100%" stop-color="#5f78f0" />
        </linearGradient>
      </defs>
      <polyline class="wind-ribbon-fill" points="0,96 ${linePoints} ${width},96" />
      <polyline class="wind-ribbon-line" points="${linePoints}" />
      ${extremes}
      ${markers}
    </svg>
  `;
}

function getNext12HourTemperatureRange(data, startIndex) {
  const slice = data.hourly.temperature_2m.slice(startIndex, startIndex + 12);
  const temps = slice.length ? slice : data.hourly.temperature_2m.slice(0, 12);
  return {
    low: convertTemperature(Math.min(...temps)),
    high: convertTemperature(Math.max(...temps)),
  };
}

function getVisibilityLabel(displayValue) {
  if (!Number.isFinite(displayValue)) return 'Unavailable';
  if (currentUnit === 'english') {
    if (displayValue < 1) return 'Dense';
    if (displayValue < 3) return 'Poor';
    if (displayValue < 6) return 'Reduced';
    return 'Clear';
  }
  if (displayValue < 1.6) return 'Dense';
  if (displayValue < 4.8) return 'Poor';
  if (displayValue < 9.6) return 'Reduced';
  return 'Clear';
}

function buildUvTicks(value) {
  const active = clamp(Math.round(value), 0, 11);
  return Array.from({ length: 11 }, (_, index) => {
    const rotation = -72 + index * 14.4;
    const className = index < active ? 'uv-tick active' : 'uv-tick';
    return `<span class="${className}" style="--tick-rotation:${rotation}deg"></span>`;
  }).join('');
}

function getAqiLabel(value) {
  if (!Number.isFinite(value)) return 'Unavailable';
  if (value <= 50) return 'Good';
  if (value <= 100) return 'Moderate';
  if (value <= 150) return 'Sensitive groups';
  if (value <= 200) return 'Unhealthy';
  if (value <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

function buildWeatherCard(location) {
  return `
    <article id="${location.cardId}" class="weather-card loading">
      <div class="card-header">
        <div class="location-heading">
          <h2 class="location-name">${location.name}</h2>
          <span class="location-meta">${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}</span>
          <span class="location-elevation">Elevation --</span>
        </div>
      </div>

      <div class="current-overview">
        <div class="current-main">
          <div class="current-temp-block">
            <p class="condition-text">Loading current conditions&hellip;</p>
            <p class="temperature">--&deg;</p>
          </div>
          <div class="weather-icon">${getWeatherEmoji(3)}</div>
          <div class="top-condition feels-top">
            <span>Feels Like</span>
            <strong class="feels-like-detail">&mdash;</strong>
          </div>
        </div>
        <section class="metric-tile summary-tile current-summary">
          <div class="summary-stack">
            <div>
              <span>High / Low</span>
              <strong class="summary-temp">&mdash;</strong>
            </div>
            <div>
              <span>Rain</span>
              <strong class="rain-detail">&mdash;</strong>
            </div>
            <div>
              <span>Max wind</span>
              <strong class="summary-wind">&mdash;</strong>
            </div>
          </div>
        </section>
        <section class="top-wind-card">
          <div class="tile-title"><span class="metric-symbol">&rarr;</span><span>Wind</span></div>
          <div class="wind-compass">
            <span class="compass-n">N</span>
            <span class="wind-needle"></span>
          </div>
          <strong class="wind-detail compass-wind-detail">&mdash;</strong>
        </section>
      </div>

      <div class="metric-board">
        <section class="metric-tile temperature-tile">
          <div class="tile-title graph-title"><span>Temperature</span></div>
          <div class="range-strip tile-range">
            <span class="next-temp-low" aria-hidden="true">&mdash;</span>
            <div class="temperature-ribbon"></div>
            <span class="next-temp-high" aria-hidden="true">&mdash;</span>
          </div>
        </section>

        <section class="metric-tile wind-speed-tile">
          <div class="tile-title graph-title"><span>Wind Speed</span></div>
          <div class="range-strip tile-range">
            <div class="wind-ribbon"></div>
          </div>
        </section>

        <section class="metric-tile gauge-tile">
          <div class="tile-title"><span class="metric-symbol">%</span><span>Humidity</span></div>
          <div class="arc-gauge humidity-gauge" style="--gauge-angle:0deg">
            <div class="gauge-readout"><strong class="humidity-detail">&mdash;</strong><span class="humidity-label">--</span></div>
          </div>
        </section>

        <section class="metric-tile uv-tile">
          <div class="tile-title"><span class="metric-symbol">*</span><span>UV Index</span></div>
          <div class="uv-meter" aria-hidden="true"></div>
          <div class="tile-center"><strong class="uv-detail">&mdash;</strong><span class="uv-label">--</span></div>
        </section>

        <section class="metric-tile dew-tile">
          <div class="tile-title"><span class="metric-symbol">&#9702;</span><span>Dew Point</span></div>
          <strong class="dew-detail">&mdash;</strong>
          <div class="dew-track"><span class="dew-fill"></span></div>
          <div class="track-labels"><span class="dew-min">0</span><span class="dew-max">100</span></div>
        </section>

        <section class="metric-tile gauge-tile">
          <div class="tile-title"><span class="metric-symbol">&#8595;</span><span>Pressure</span></div>
          <div class="arc-gauge pressure-gauge" style="--gauge-angle:0deg">
            <div class="gauge-readout"><strong class="pressure-detail">&mdash;</strong><span class="pressure-label">--</span></div>
          </div>
        </section>

        <section class="metric-tile visibility-tile">
          <div class="tile-title"><span class="metric-symbol">&#9679;</span><span>Visibility</span></div>
          <div class="visibility-horizon" style="--visibility-position:0%">
            <div class="visibility-sky">
              <span class="visibility-marker"></span>
              <span class="visibility-graph-label">
                <strong class="visibility-detail">&mdash;</strong>
                <span class="visibility-label">--</span>
              </span>
            </div>
            <div class="visibility-scale">
              <span class="visibility-scale-start">1</span>
              <span class="visibility-scale-mid-low">10</span>
              <span class="visibility-scale-mid-high">25</span>
              <span class="visibility-scale-end">50+</span>
            </div>
          </div>
        </section>

        <section class="metric-tile air-quality-tile gauge-tile">
          <div class="tile-title"><span class="metric-symbol">AQ</span><span>Air Quality</span></div>
          <div class="arc-gauge air-quality-gauge" style="--gauge-angle:0deg">
            <div class="gauge-readout"><strong class="air-quality-detail">&mdash;</strong><span class="air-quality-label">--</span></div>
          </div>
        </section>

      </div>

      <div class="sun-moon-row">
        <section class="phase-panel sun-panel">
          <div class="tile-title"><span class="metric-symbol">&#9728;</span><span>Sunrise &middot; Sunset</span></div>
          <div class="path-labels">
            <div><span>Sunrise</span><strong class="sunrise-detail">&mdash;</strong></div>
            <div><span>Sunset</span><strong class="sunset-detail">&mdash;</strong></div>
          </div>
          <div class="sun-path" style="--path-left:8%">
            <span class="path-dot start-dot"></span>
            <span class="path-dot end-dot"></span>
            <span class="path-orb sun-orb"></span>
          </div>
          <div class="phase-label"><span id="${location.sunLabelId}">&mdash;</span></div>
        </section>

        <section class="phase-panel moon-panel">
          <div class="tile-title"><span class="metric-symbol">&#9790;</span><span>Moonrise &middot; Moonset</span></div>
          <div class="path-labels">
            <div><span>Moonrise</span><strong class="moonrise-detail">&mdash;</strong></div>
            <div><span>Moonset</span><strong class="moonset-detail">&mdash;</strong></div>
          </div>
          <div class="moon-path">
            <span class="path-dot start-dot"></span>
            <span class="path-dot end-dot"></span>
            <span class="path-orb moon-orb"></span>
          </div>
          <div class="phase-label"><span class="moon-times-detail">&mdash;</span></div>
        </section>

        <section class="phase-panel moon-phase-panel">
          <div class="tile-title"><span class="metric-symbol">&#9680;</span><span>Moon Phase</span></div>
          <span class="moon-phase-icon large" id="${location.moonIconId}"></span>
          <strong class="moon-detail" id="${location.moonLabelId}">&mdash;</strong>
        </section>
      </div>

      <div class="weather-content">
        <div class="detail-row">
          <span>High / Low</span>
          <strong class="summary-temp">&mdash;</strong>
        </div>
        <div class="detail-row">
          <span>Sun rise/set</span>
          <strong class="sun-detail">&mdash;</strong>
        </div>
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    theme: currentTheme,
    unit: currentUnit,
    activeLocationId,
  }));
}

function formatElevation(location, dataElevation) {
  const elevation = Number.isFinite(location.elevationMeters)
    ? location.elevationMeters
    : Number(dataElevation);
  if (!Number.isFinite(elevation)) return 'Elevation --';

  const value = currentUnit === 'english' ? Math.round(elevation * 3.28084) : Math.round(elevation);
  const unit = currentUnit === 'english' ? 'ft' : 'm';
  return `Elevation ${value} ${unit}`;
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

function getActiveLocation() {
  return locations.find((location) => location.id === activeLocationId) || locations[0];
}

function updateLocationToggleLabel() {
  const button = document.getElementById('location-toggle');
  const activeLocation = getActiveLocation();
  if (!button || !activeLocation) return;
  const nextLocation = locations.find((location) => location.id !== activeLocation.id);
  button.textContent = nextLocation ? nextLocation.name : activeLocation.name;
  button.setAttribute('aria-label', nextLocation ? `Switch weather display to ${nextLocation.name}` : activeLocation.name);
}

function renderCards() {
  const root = document.getElementById('weather-root');
  const activeLocation = getActiveLocation();
  root.innerHTML = activeLocation ? buildWeatherCard(activeLocation) : '';
  updateLocationToggleLabel();
}

function showError(location, message) {
  const card = document.getElementById(location.cardId);
  if (!card) return;
  card.classList.remove('loading');
  const conditionText = card.querySelector('.condition-text');
  const temperatureEl = card.querySelector('.temperature');
  conditionText && (conditionText.textContent = message);
  temperatureEl && (temperatureEl.textContent = '--\u00b0');
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
  const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true&hourly=temperature_2m,apparent_temperature,dew_point_2m,relativehumidity_2m,precipitation_probability,weathercode,windspeed_10m,winddirection_10m,pressure_msl,surface_pressure,visibility,uv_index&daily=sunrise,sunset,weathercode,temperature_2m_max,temperature_2m_min,windspeed_10m_max,winddirection_10m_dominant&timezone=auto`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    if (!data.current_weather || !data.daily) throw new Error('Weather data missing');
    data.airQuality = await fetchAirQuality(location);
    updateCard(location, data);
    weatherData[location.id] = data;
  } catch (error) {
    showError(location, 'Unable to load weather');
    console.error('Weather fetch failed for', location.name, error);
  }
}

async function fetchAirQuality(location) {
  const endpoint = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${location.latitude}&longitude=${location.longitude}&current=us_aqi&timezone=auto`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Air quality response was not ok');
    return await response.json();
  } catch (error) {
    console.warn('Air quality fetch failed for', location.name, error);
    return null;
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
  const dewPoint = currentHourlyIndex >= 0 ? data.hourly.dew_point_2m?.[currentHourlyIndex] : null;
  const uvIndex = currentHourlyIndex >= 0 ? data.hourly.uv_index?.[currentHourlyIndex] : null;
  const pressure = currentHourlyIndex >= 0
    ? data.hourly.pressure_msl?.[currentHourlyIndex] ?? data.hourly.surface_pressure?.[currentHourlyIndex]
    : null;
  const visibility = currentHourlyIndex >= 0 ? data.hourly.visibility?.[currentHourlyIndex] : null;
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
  const airQuality = data.airQuality?.current?.us_aqi;

  const conditionTextEl = card.querySelector('.condition-text');
  const elevationEl = card.querySelector('.location-elevation');
  const weatherIconEl = card.querySelector('.weather-icon');
  const temperatureEl = card.querySelector('.temperature');
  const humidityEl = card.querySelector('.humidity-detail');
  const rainEl = card.querySelector('.rain-detail');
  const sunDetailEl = card.querySelector('.sun-detail');
  const moonTimesEl = card.querySelector('.moon-times-detail');
  const windDetailEl = card.querySelector('.wind-detail');
  const feelsLikeEl = card.querySelector('.feels-like-detail');
  const uvEl = card.querySelector('.uv-detail');
  const uvLabelEl = card.querySelector('.uv-label');
  const dewEl = card.querySelector('.dew-detail');
  const pressureEl = card.querySelector('.pressure-detail');
  const pressureLabelEl = card.querySelector('.pressure-label');
  const visibilityEl = card.querySelector('.visibility-detail');
  const airQualityEl = card.querySelector('.air-quality-detail');
  const airQualityLabelEl = card.querySelector('.air-quality-label');
  const airQualityGaugeEl = card.querySelector('.air-quality-gauge');
  const windNeedleEl = card.querySelector('.wind-needle');
  const humidityGaugeEl = card.querySelector('.humidity-gauge');
  const humidityLabelEl = card.querySelector('.humidity-label');
  const pressureGaugeEl = card.querySelector('.pressure-gauge');
  const dewFillEl = card.querySelector('.dew-fill');
  const uvMeterEl = card.querySelector('.uv-meter');
  const sunPathEl = card.querySelector('.sun-path');
  const sunriseEl = card.querySelector('.sunrise-detail');
  const sunsetEl = card.querySelector('.sunset-detail');
  const moonriseEl = card.querySelector('.moonrise-detail');
  const moonsetEl = card.querySelector('.moonset-detail');
  const nextTempLowEl = card.querySelector('.next-temp-low');
  const nextTempHighEl = card.querySelector('.next-temp-high');
  const temperatureRibbonEl = card.querySelector('.temperature-ribbon');
  const windRibbonEl = card.querySelector('.wind-ribbon');

  if (conditionTextEl) conditionTextEl.textContent = weatherCodeMap[current.weathercode] || 'Weather';
  if (elevationEl) elevationEl.textContent = formatElevation(location, data.elevation);
  if (weatherIconEl) weatherIconEl.textContent = getWeatherEmoji(current.weathercode);
  if (temperatureEl) temperatureEl.textContent = `${convertTemperature(current.temperature)}\u00b0`;
  if (windDetailEl) windDetailEl.textContent = `${windArrow} ${windDirection} @ ${windSpeed} ${windUnit}`;
  if (feelsLikeEl) feelsLikeEl.textContent = apparentTemperature === null ? '--' : `${convertTemperature(apparentTemperature)}\u00b0`;
  if (humidityEl) humidityEl.textContent = `${humidity ?? '--'}%`;
  if (rainEl) rainEl.textContent = `${rainChance ?? '--'}%`;
  if (sunDetailEl) sunDetailEl.textContent = `${formatTime(sunrise)} / ${formatTime(sunset)}`;
  if (moonTimesEl) moonTimesEl.textContent = formatMoonTimes(moonTimes);
  card.querySelectorAll('.summary-temp').forEach((el) => {
    el.textContent = `${todayHigh}\u00b0 / ${todayLow}\u00b0`;
  });
  card.querySelectorAll('.summary-wind').forEach((el) => {
    el.textContent = todayMaxWind;
  });
  if (temperatureRibbonEl) {
    temperatureRibbonEl.innerHTML = buildTemperatureRibbon(data, currentHourlyIndex >= 0 ? currentHourlyIndex : 0);
  }
  if (windRibbonEl) {
    windRibbonEl.innerHTML = buildWindRibbon(data, currentHourlyIndex >= 0 ? currentHourlyIndex : 0);
  }
  const next12Range = getNext12HourTemperatureRange(data, currentHourlyIndex >= 0 ? currentHourlyIndex : 0);
  if (nextTempLowEl) nextTempLowEl.textContent = `${next12Range.low}\u00b0`;
  if (nextTempHighEl) nextTempHighEl.textContent = `${next12Range.high}\u00b0`;
  if (windNeedleEl) windNeedleEl.style.setProperty('--wind-rotation', `${current.winddirection}deg`);
  if (humidityGaugeEl) humidityGaugeEl.style.setProperty('--gauge-angle', `${clamp(Number(humidity) / 100, 0, 1) * 180}deg`);
  if (humidityLabelEl) {
    humidityLabelEl.textContent = getComfortLabel(Number(humidity), [
      { max: 30, label: 'Dry' },
      { max: 60, label: 'Comfortable' },
      { max: 75, label: 'Humid' },
      { max: 100, label: 'Heavy' },
    ]);
  }
  if (uvEl) uvEl.textContent = Number.isFinite(uvIndex) ? Math.round(uvIndex) : '--';
  if (uvLabelEl) {
    uvLabelEl.textContent = getComfortLabel(Number(uvIndex), [
      { max: 2, label: 'Low' },
      { max: 5, label: 'Moderate' },
      { max: 7, label: 'High' },
      { max: 10, label: 'Very high' },
      { max: 11, label: 'Extreme' },
    ]);
  }
  if (uvMeterEl) uvMeterEl.innerHTML = buildUvTicks(Number(uvIndex));
  if (dewEl) dewEl.textContent = Number.isFinite(dewPoint) ? `${convertTemperature(dewPoint)}\u00b0` : '--';
  if (dewFillEl) {
    const dewDisplay = Number.isFinite(dewPoint) ? convertTemperature(dewPoint) : 0;
    const min = 0;
    const max = currentUnit === 'english' ? 100 : 38;
    dewFillEl.style.width = `${clamp((dewDisplay - min) / (max - min), 0, 1) * 100}%`;
  }
  const dewMinEl = card.querySelector('.dew-min');
  const dewMaxEl = card.querySelector('.dew-max');
  if (dewMinEl) dewMinEl.textContent = '0';
  if (dewMaxEl) dewMaxEl.textContent = currentUnit === 'english' ? '100' : '38';
  const pressureDisplay = convertPressure(pressure);
  if (pressureEl) pressureEl.textContent = pressureDisplay ? `${pressureDisplay.value} ${pressureDisplay.unit}` : '--';
  if (pressureLabelEl) {
    pressureLabelEl.textContent = getComfortLabel(Number(pressure), [
      { max: 1000, label: 'Low' },
      { max: 1022, label: 'Steady' },
      { max: 1050, label: 'High' },
    ]);
  }
  if (pressureGaugeEl) pressureGaugeEl.style.setProperty('--gauge-angle', `${clamp((Number(pressure) - 970) / 80, 0, 1) * 180}deg`);
  const visibilityDisplay = convertVisibility(visibility);
  if (visibilityEl) visibilityEl.textContent = visibilityDisplay ? `${visibilityDisplay.value} ${visibilityDisplay.unit}` : '--';
  const visibilityLabelEl = card.querySelector('.visibility-label');
  const visibilityHorizonEl = card.querySelector('.visibility-horizon');
  const visibilityScaleStartEl = card.querySelector('.visibility-scale-start');
  const visibilityScaleMidLowEl = card.querySelector('.visibility-scale-mid-low');
  const visibilityScaleMidHighEl = card.querySelector('.visibility-scale-mid-high');
  const visibilityScaleEndEl = card.querySelector('.visibility-scale-end');
  if (visibilityLabelEl) visibilityLabelEl.textContent = visibilityDisplay ? getVisibilityLabel(visibilityDisplay.value) : '--';
  if (visibilityScaleStartEl) visibilityScaleStartEl.textContent = currentUnit === 'english' ? '1' : '2';
  if (visibilityScaleMidLowEl) visibilityScaleMidLowEl.textContent = currentUnit === 'english' ? '10' : '16';
  if (visibilityScaleMidHighEl) visibilityScaleMidHighEl.textContent = currentUnit === 'english' ? '25' : '40';
  if (visibilityScaleEndEl) visibilityScaleEndEl.textContent = currentUnit === 'english' ? '50+ mi' : '80+ km';
  if (visibilityHorizonEl) {
    const maxVisibility = currentUnit === 'english' ? 50 : 80;
    const position = visibilityDisplay ? clamp(visibilityDisplay.value / maxVisibility, 0, 1) * 100 : 0;
    visibilityHorizonEl.style.setProperty('--visibility-position', `${position}%`);
  }
  if (airQualityEl) airQualityEl.textContent = Number.isFinite(airQuality) ? Math.round(airQuality) : '--';
  if (airQualityLabelEl) airQualityLabelEl.textContent = getAqiLabel(Number(airQuality));
  if (airQualityGaugeEl) airQualityGaugeEl.style.setProperty('--gauge-angle', `${clamp(Number(airQuality) / 150, 0, 1) * 180}deg`);
  if (sunriseEl) sunriseEl.textContent = formatTime(sunrise);
  if (sunsetEl) sunsetEl.textContent = formatTime(sunset);
  if (moonriseEl) moonriseEl.textContent = moonTimes.rise ? formatTime(moonTimes.rise) : 'No rise';
  if (moonsetEl) moonsetEl.textContent = moonTimes.set ? formatTime(moonTimes.set) : 'No set';

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
  if (sunPathEl) sunPathEl.style.setProperty('--path-left', `${8 + (84 * sunPhase.ratio)}%`);
  updateSunDial(card, now, sunrise, sunset);

  const hourlyIndex = data.hourly.time.findIndex((t) => new Date(t).getTime() >= now.getTime());
  const startIndex = hourlyIndex >= 0 ? hourlyIndex : 0;
  card.querySelector('.hourly-items').innerHTML = buildHourlyItems(data, startIndex);
  card.querySelector('.daily-items').innerHTML = buildDailyItems(data);
  card.querySelector('.map-link').href = `https://www.rainviewer.com/map.html?loc=${location.latitude},${location.longitude},10`;
}

async function refreshWeather() {
  const activeLocation = getActiveLocation();
  if (!activeLocation) return;
  document.getElementById('last-updated').textContent = 'Updating\u2026';
  await fetchWeather(activeLocation);
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
  const activeLocation = getActiveLocation();
  if (activeLocation && weatherData[activeLocation.id]) {
    updateCard(activeLocation, weatherData[activeLocation.id]);
  }
}

async function switchLocation() {
  const currentIndex = locations.findIndex((location) => location.id === activeLocationId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % locations.length : 0;
  activeLocationId = locations[nextIndex].id;
  saveSettings();
  renderCards();

  const activeLocation = getActiveLocation();
  if (weatherData[activeLocation.id]) {
    updateCard(activeLocation, weatherData[activeLocation.id]);
    document.getElementById('last-updated').textContent = `Showing cached data for ${activeLocation.name}`;
    return;
  }

  await refreshWeather();
}

async function init() {
  const stored = loadStoredSettings();
  locations = defaultLocations.map((location) => ({ ...location }));
  currentTheme = stored && stored.theme ? stored.theme : 'dark';
  let savedUnit = stored && stored.unit ? stored.unit : 'metric';
  if (savedUnit === 'celsius') savedUnit = 'metric';
  if (savedUnit === 'fahrenheit') savedUnit = 'english';
  currentUnit = savedUnit;
  const savedLocationId = stored && Number(stored.activeLocationId);
  activeLocationId = locations.some((location) => location.id === savedLocationId)
    ? savedLocationId
    : locations[0].id;
  setTheme(currentTheme);
  updateUnitToggleLabel();

  renderCards();

  document.getElementById('location-toggle').addEventListener('click', switchLocation);
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
