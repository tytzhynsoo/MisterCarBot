// Відстань по дорогах від дому до продавця.
// За замовчуванням — безкоштовні OpenStreetMap-сервіси:
//   Nominatim (адреса → координати) і OSRM (маршрут авто).
// Якщо задано GOOGLE_MAPS_API_KEY — використовується Google Maps.
//
// Адреса дому береться ЛИШЕ з секрету HOME_ADDRESS (або HOME_LAT/HOME_LON)
// і ніде не зберігається у файлах репозиторію.

const UA = 'otomoto-hybrid-bot/1.0 (personal, low-volume use)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastNominatimCall = 0;

export function createGeo({ fetchFn = fetch, googleKey = process.env.GOOGLE_MAPS_API_KEY, cache = {} } = {}) {
  async function getJson(url) {
    const res = await fetchFn(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pl' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Адреса/місто → { lat, lon }. Результати для міст кешуються.
  async function geocode(query, { useCache = true } = {}) {
    const key = query.toLowerCase().trim();
    if (useCache && cache[key]) return cache[key];
    let point = null;
    if (googleKey) {
      const j = await getJson(`https://maps.googleapis.com/maps/api/geocode/json?region=pl&address=${encodeURIComponent(query)}&key=${googleKey}`);
      const loc = j.results?.[0]?.geometry?.location;
      if (loc) point = { lat: loc.lat, lon: loc.lng };
    } else {
      // Правила Nominatim: не частіше 1 запиту на секунду
      const wait = 1100 - (Date.now() - lastNominatimCall);
      if (wait > 0) await sleep(wait);
      lastNominatimCall = Date.now();
      const j = await getJson(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pl&q=${encodeURIComponent(query)}`);
      if (j?.[0]) point = { lat: Number(j[0].lat), lon: Number(j[0].lon) };
    }
    if (point && useCache) cache[key] = point;
    return point;
  }

  // Маршрут авто: { km, minutes }
  async function route(from, to) {
    if (googleKey) {
      const j = await getJson(
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${from.lat},${from.lon}&destinations=${to.lat},${to.lon}&mode=driving&key=${googleKey}`,
      );
      const el = j.rows?.[0]?.elements?.[0];
      if (el?.status !== 'OK') return null;
      return { km: Math.round(el.distance.value / 1000), minutes: Math.round(el.duration.value / 60) };
    }
    const j = await getJson(
      `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`,
    );
    const r = j.routes?.[0];
    if (!r) return null;
    return { km: Math.round(r.distance / 1000), minutes: Math.round(r.duration / 60) };
  }

  return { geocode, route };
}

// Звідки брати адресу продавця: точні координати з оголошення (якщо є) → місто + регіон
export function listingPlaceQuery(l) {
  if (!l.city) return null;
  return [l.city, l.region, 'Polska'].filter(Boolean).join(', ');
}

export async function homePoint(geo) {
  const lat = Number(process.env.HOME_LAT);
  const lon = Number(process.env.HOME_LON);
  if (Number.isFinite(lat) && Number.isFinite(lon) && process.env.HOME_LAT) return { lat, lon };
  const addr = (process.env.HOME_ADDRESS || '').trim();
  if (!addr) return null;
  // адресу дому НЕ кешуємо у state.json (репозиторій може бути публічним)
  for (const q of homeQueryVariants(addr)) {
    const p = await geo.geocode(q, { useCache: false });
    if (p) return p;
  }
  return { notFound: true };
}

// Варіанти запиту від найточнішого до найзагальнішого:
// повна адреса → без номера квартири → поштовий код + місто
export function homeQueryVariants(addr) {
  const variants = [addr];
  const noFlat = addr
    .replace(/\s*(\/|m\.|kw\.?|кв\.?|apt\.?|lok\.?)\s*\d+[a-z]?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  variants.push(noFlat);
  const postal = addr.match(/\b\d{2}-?\d{3}\b/);
  const city = /krak[oó]w|краків/i.test(addr) ? 'Kraków' : '';
  if (postal) {
    const code = postal[0].includes('-') ? postal[0] : `${postal[0].slice(0, 2)}-${postal[0].slice(2)}`;
    variants.push(`${code} ${city}`.trim() + ', Polska');
  }
  return [...new Set(variants.filter(Boolean))];
}

export async function distanceTo(geo, home, l) {
  if (!home) return null;
  let target = l.coords || null;
  if (!target) {
    const q = listingPlaceQuery(l);
    if (!q) return null;
    target = await geo.geocode(q);
  }
  if (!target) return null;
  return geo.route(home, target);
}

export function formatDistance(d) {
  if (!d) return null;
  const h = Math.floor(d.minutes / 60);
  const m = d.minutes % 60;
  const time = h ? `${h} год ${m} хв` : `${m} хв`;
  return `🚗 ${d.km} км від дому, ~${time} їзди`;
}
