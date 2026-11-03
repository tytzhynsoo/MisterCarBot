// Завантаження й розбір сторінок Otomoto.
// Otomoto — сайт на Next.js: дані оголошень лежать у JSON усередині
// <script id="__NEXT_DATA__">. Структура може змінюватися, тому парсер
// шукає оголошення "універсально" — за ознаками, а не за точним шляхом.

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export class BlockedError extends Error {}

export async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.5',
    },
    redirect: 'follow',
  });
  if (res.status === 403 || res.status === 429) {
    throw new BlockedError(`Otomoto відповів ${res.status} на ${url}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} на ${url}`);
  return res.text();
}

// ---------- допоміжні функції ----------

export function extractNextData(html) {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// Обхід дерева JSON; рядки, що самі є JSON (як у urqlState), теж розгортаються
function walk(node, visit, depth = 0, seen = new Set()) {
  if (depth > 60 || node === null || node === undefined) return;
  if (typeof node === 'string') {
    const s = node.trim();
    if (s.length > 50 && (s.startsWith('{"') || s.startsWith('[{'))) {
      try {
        walk(JSON.parse(s), visit, depth + 1, seen);
      } catch { /* не JSON */ }
    }
    return;
  }
  if (typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  visit(node);
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit, depth + 1, seen);
  } else {
    for (const key of Object.keys(node)) walk(node[key], visit, depth + 1, seen);
  }
}

export function parseNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // беремо перше число з рядка: "1 797 cm3" -> "1 797", "156 000 km" -> "156 000"
  const m = String(v).match(/\d[\d\s .,]*/);
  if (!m) return null;
  const digits = m[0].replace(/[\s ]/g, '').replace(/[.,]$/, '');
  // "39 900" -> 39900; "1 797 cm3" -> 1797; "39900.00" -> 39900
  const normalized = /^\d{1,3}([.,]\d{3})+$/.test(digits)
    ? digits.replace(/[.,]/g, '')          // "39.900" / "39,900" -> 39900
    : digits.replace(',', '.');           // "8,15" -> 8.15
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function idFromUrl(url) {
  const m = String(url || '').match(/ID([A-Za-z0-9]+)\.html/);
  return m ? m[1] : null;
}

function getPrice(obj) {
  const p = obj.price;
  const candidates = [
    p?.amount?.units,
    p?.amount?.value,
    p?.value,
    p?.amount,
    typeof p === 'number' || typeof p === 'string' ? p : null,
    obj.priceSpecification?.price,
    obj.offers?.price,
  ];
  for (const c of candidates) {
    const n = parseNumber(typeof c === 'object' ? null : c);
    if (n) return n;
  }
  return null;
}

// Збирає параметри у вигляді { key: {value, label} } з різних форматів Otomoto
export function collectParams(root) {
  const params = {};
  const add = (key, value, label) => {
    if (!key) return;
    const k = String(key).toLowerCase();
    if (params[k]) return;
    params[k] = { value: value ?? label ?? null, label: label ?? value ?? null };
  };
  walk(root, (node) => {
    if (Array.isArray(node)) {
      for (const it of node) {
        if (it && typeof it === 'object' && typeof it.key === 'string') {
          if ('value' in it || 'displayValue' in it || 'label' in it) {
            const val = typeof it.value === 'object' ? it.value?.value ?? it.value?.label : it.value;
            add(it.key, val, it.displayValue ?? it.label ?? (typeof it.value === 'object' ? it.value?.label : undefined));
          } else if (Array.isArray(it.values) && it.values[0]) {
            add(it.key, it.values[0].value, it.values[0].label);
          }
        }
      }
    } else {
      // форма-словник: { year: { values: [{value, label}] } }
      for (const [k, v] of Object.entries(node)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.values) && v.values[0] && 'value' in v.values[0]) {
          add(k, v.values[0].value, v.values[0].label);
        }
      }
    }
  });
  return params;
}

function paramVal(params, ...keys) {
  for (const k of keys) {
    const p = params[k];
    if (p && (p.value !== null && p.value !== undefined && p.value !== '')) return { value: String(p.value), label: String(p.label ?? p.value) };
  }
  return null;
}

// Перетворює "сирий" обʼєкт оголошення на наш формат
export function normalizeListing(raw) {
  const url = raw.url || raw.href || raw.link;
  const params = collectParams(raw);
  const title = raw.title || raw.name || '';
  const year = parseNumber(paramVal(params, 'year', 'rok_produkcji')?.value);
  const mileage = parseNumber(paramVal(params, 'mileage', 'przebieg')?.value);
  const fuel = paramVal(params, 'fuel_type', 'fuel', 'rodzaj_paliwa');
  const gearbox = paramVal(params, 'gearbox', 'transmission', 'skrzynia_biegow');
  const body = paramVal(params, 'body_type', 'typ_nadwozia');
  const engine = parseNumber(paramVal(params, 'engine_capacity', 'pojemnosc_skokowa')?.value);
  const make = paramVal(params, 'make', 'marka')?.value || null;
  const model = paramVal(params, 'model')?.value || null;
  const damaged = paramVal(params, 'damaged', 'uszkodzony');
  const noAccident = paramVal(params, 'no_accident', 'bezwypadkowy');
  const serviceRecord = paramVal(params, 'service_record', 'serwisowany_w_aso');
  const origin = paramVal(params, 'country_origin', 'kraj_pochodzenia');
  // "Zarejestrowany w Polsce" і "Ma numer rejestracyjny" — назви ключів можуть відрізнятися
  const yes = (p) => !!p && /^(1|true|tak|yes)$/i.test(String(p.value ?? p.label));
  let registeredPL = false;
  let hasPlate = false;
  for (const [k, p] of Object.entries(params)) {
    if (/registered|zarejestrowany/.test(k) && !/date|data/.test(k)) registeredPL ||= yes(p);
    if (/has_registration|registration_number|numer_rejestr|has_plate/.test(k)) hasPlate ||= yes(p);
  }

  const location =
    raw.location?.city?.name ||
    raw.location?.city ||
    raw.location?.name ||
    raw.seller?.location?.city ||
    null;
  const region = raw.location?.region?.name || raw.location?.region || null;

  return {
    id: String(raw.id && /^[A-Za-z0-9]+$/.test(String(raw.id)) ? raw.id : idFromUrl(url) || raw.id || url),
    url,
    title: String(title).trim(),
    price: getPrice(raw),
    year,
    mileage,
    fuel: fuel ? `${fuel.value} ${fuel.label}`.toLowerCase() : '',
    fuelLabel: fuel?.label || '',
    gearbox: gearbox ? `${gearbox.value} ${gearbox.label}`.toLowerCase() : '',
    body: body ? `${body.value} ${body.label}`.toLowerCase() : '',
    engine,
    make: make ? make.toLowerCase() : null,
    model: model ? model.toLowerCase() : null,
    damaged: damaged ? /^(1|true|tak|yes)$/i.test(damaged.value) : false,
    noAccident: noAccident ? /^(1|true|tak|yes)$/i.test(noAccident.value) : null,
    serviceRecord: serviceRecord ? /^(1|true|tak|yes)$/i.test(serviceRecord.value) : null,
    origin: origin?.label || null,
    registeredPL,
    hasPlate,
    city: typeof location === 'string' ? location : null,
    region: typeof region === 'string' ? region : null,
    sellerType: raw.sellerLink?.type || raw.seller?.type || raw.sellerType || null,
    description: '',
    shortDescription: raw.shortDescription || '',
  };
}

const isListingNode = (o) =>
  o && !Array.isArray(o) && typeof (o.url || o.href) === 'string' &&
  /\/osobowe\/oferta\//.test(o.url || o.href) &&
  (o.title || o.name) && ('price' in o || 'parameters' in o);

// Розбір сторінки пошуку → масив оголошень
export function parseSearchPage(html) {
  const out = new Map();
  const data = extractNextData(html);
  if (data) {
    walk(data, (node) => {
      if (isListingNode(node)) {
        const l = normalizeListing(node);
        if (l.id && !out.has(l.id)) out.set(l.id, l);
      }
    });
  }
  // Запасний варіант: просто посилання на оголошення
  if (out.size === 0) {
    const re = /https:\/\/www\.otomoto\.pl\/osobowe\/oferta\/[a-z0-9-]+-ID[A-Za-z0-9]+\.html/g;
    for (const url of new Set(html.match(re) || [])) {
      const id = idFromUrl(url);
      if (id && !out.has(id)) out.set(id, { id, url, title: '', partial: true, description: '' });
    }
  }
  return [...out.values()];
}

// Розбір сторінки одного оголошення → повніші дані + опис
export function parseDetailPage(html, url) {
  const data = extractNextData(html);
  if (!data) return null;
  let advert = null;
  walk(data, (node) => {
    if (advert || Array.isArray(node)) return;
    if (typeof node.description === 'string' && (node.title || node.name) && ('price' in node || 'parameters' in node || 'details' in node || 'parametersDict' in node)) {
      advert = node;
    }
  });
  if (!advert) return null;
  const l = normalizeListing({ url, ...advert });
  l.url = url;
  l.description = stripHtml(advert.description);
  l.sellerType = advert.seller?.type || advert.sellerType || l.sellerType;
  if (!l.city) l.city = advert.seller?.location?.city?.name || advert.seller?.location?.city || null;
  // шукаємо лише всередині самого оголошення, а не по всій сторінці
  // (там можуть бути координати "схожих оголошень")
  l.coords = findCoords(advert);
  return l;
}

// Координати продавця з карти на сторінці (якщо Otomoto їх віддає).
// Беремо лише точки в межах Польщі, щоб не схопити щось стороннє.
export function findCoords(data) {
  let found = null;
  walk(data, (node) => {
    if (found || Array.isArray(node)) return;
    const lat = Number(node.lat ?? node.latitude);
    const lon = Number(node.lon ?? node.lng ?? node.long ?? node.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat > 49 && lat < 55 && lon > 14 && lon < 24.3) {
      found = { lat, lon };
    }
  });
  return found;
}

export function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// Обʼєднує дані з пошуку й детальної сторінки (детальні мають пріоритет)
export function mergeListing(base, detail) {
  if (!detail) return base;
  const merged = { ...base };
  for (const [k, v] of Object.entries(detail)) {
    if (typeof v === 'boolean') merged[k] = Boolean(base[k]) || v; // "так" з будь-якого джерела перемагає
    else if (v !== null && v !== undefined && v !== '') merged[k] = v;
  }
  return merged;
}
