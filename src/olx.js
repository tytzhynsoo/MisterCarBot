// OLX: публічний API оголошень (той самий, що використовує сайт).
import { BlockedError, parseNumber, stripHtml } from './otomoto.js';
import { cleanVin } from './vin.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'pl-PL,pl;q=0.9',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.olx.pl/',
};

export async function fetchOlx(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 403 || res.status === 429) throw new BlockedError(`OLX відповів ${res.status}`);
  if (!res.ok) throw new Error(`OLX HTTP ${res.status}`);
  return res.json();
}

// Параметри OLX бувають у двох форматах:
//  API:  { key, value: { key, label } }   або   сторінка: { key, value: "Diesel", normalizedValue: "diesel" }
function readParams(list) {
  const out = {};
  for (const p of list || []) {
    const v = p.value;
    if (v && typeof v === 'object') {
      out[p.key] = { key: String(v.key ?? v.value ?? ''), label: String(v.label ?? v.key ?? ''), raw: v };
    } else {
      out[p.key] = { key: String(p.normalizedValue ?? v ?? ''), label: String(v ?? ''), raw: v };
    }
  }
  return out;
}

const firstPhoto = (o) => {
  const ph = o.photos?.[0];
  const link = typeof ph === 'string' ? ph : ph?.link || ph?.url;
  return link ? link.replace('{width}', '800').replace('{height}', '600') : null;
};

export function normalizeOlx(o) {
  const p = readParams(o.params);
  const price =
    parseNumber(p.price?.raw?.value) ||
    parseNumber(o.price?.regularPrice?.value) ||
    parseNumber(p.price?.label);
  const fuel = p.petrol;
  const rhdLabel = (p.righthanddrive?.label || '').toLowerCase();
  const description = stripHtml(o.description || '');
  return {
    id: `olx-${o.id}`,
    source: 'olx',
    url: o.url,
    title: String(o.title || '').trim(),
    price,
    year: parseNumber(p.year?.key || p.year?.label),
    mileage: parseNumber(p.milage?.key || p.milage?.label),
    // "CNG i Hybryda" — у OLX це одне значення; чи це справді гібрид, вирішує analyze
    fuel: fuel ? `${fuel.key} ${fuel.label}`.toLowerCase() : '',
    fuelLabel: fuel?.label || '',
    gearbox: p.transmission ? `${p.transmission.key} ${p.transmission.label}`.toLowerCase() : '',
    body: p.car_body ? `${p.car_body.key} ${p.car_body.label}`.toLowerCase() : '',
    engine: parseNumber(p.enginesize?.key || p.enginesize?.label),
    make: null, // OLX не дає марку окремо — визначаємо з назви
    model: p.model?.key ? p.model.key.toLowerCase() : null,
    damaged: p.condition?.key === 'damaged',
    rhd: /prawej/.test(rhdLabel),
    noAccident: null,
    serviceRecord: null,
    origin: p.country_origin?.label || null,
    registeredPL: false,
    hasPlate: false,
    vin: cleanVin(p.vin?.key || p.vin?.label),
    hasVin: false,
    hasRegData: false,
    firstRegistration: null,
    city: o.location?.city?.name || o.location?.cityName || null,
    region: o.location?.region?.name || o.location?.regionName || null,
    coords: o.map?.lat && o.map?.lon ? { lat: Number(o.map.lat), lon: Number(o.map.lon) } : null,
    sellerType: (o.business ?? o.isBusiness) ? 'business' : 'private',
    photo: firstPhoto(o),
    description,
    shortDescription: '',
  };
}

export function parseOlxResponse(json) {
  return (json?.data || [])
    .filter((o) => o && o.id && o.url)
    // оголошення, які OLX лише перенаправляє на Otomoto, бот і так бачить на Otomoto
    .filter((o) => !/otomoto\.pl/.test(o.url) && !o.external_url && !o.externalUrl)
    .map(normalizeOlx);
}
