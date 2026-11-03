// Живі ринкові ціни: зберігаємо ціни свіжих оголошень і рахуємо медіану.
import { MARKET, MILEAGE_ADJ_PER_10K, MILEAGE_ADJ_CAP } from './config.js';

const DAY = 24 * 3600 * 1000;
const YEAR_STEP = 2500; // приблизна різниця ціни між сусідніми роками

// Поправка на пробіг відносно 150 тис. км (та сама, що й у таблиці)
export function mileageAdj(m) {
  if (!m) return 0;
  const diff10k = (150000 - m) / 10000;
  return Math.max(-MILEAGE_ADJ_CAP, Math.min(MILEAGE_ADJ_CAP, diff10k * MILEAGE_ADJ_PER_10K));
}

const KNOWN = ['auris_hatch', 'auris_ts', 'prius', 'prius_plus', 'lexus_ct'];
export function marketKey(kind, l) {
  if (KNOWN.includes(kind)) return kind;
  if (l.make && l.model) return `${l.make}:${l.model}`.toLowerCase();
  return null;
}

// Додає зразки цін. sample = { key, year, mileage, price }
export function addSamples(market, samples, now = Date.now()) {
  let n = 0;
  for (const s of samples) {
    if (!s.key || !s.year || !s.price || s.price < 3000 || !s.id) continue;
    market[s.id] = { k: s.key, y: s.year, m: s.mileage || null, p: s.price, t: now };
    n++;
  }
  return n;
}

export function pruneMarket(market, now = Date.now()) {
  const cutoff = now - MARKET.keepDays * DAY;
  for (const [id, s] of Object.entries(market)) if (!s || s.t < cutoff) delete market[id];
}

const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

// Медіана для моделі/року, перерахована на заданий пробіг.
// Якщо того ж року мало оголошень — додаємо сусідні роки з поправкою.
export function livePrice(market, key, year, mileage) {
  if (!key || !year) return null;
  const same = [];
  const near = [];
  for (const s of Object.values(market)) {
    if (s.k !== key) continue;
    const norm = s.p - mileageAdj(s.m); // ціна "як за 150 тис. км"
    if (s.y === year) same.push(norm);
    else if (Math.abs(s.y - year) === 1) near.push(norm + (year - s.y) * YEAR_STEP);
  }
  let vals = same;
  let exactYear = true;
  if (same.length < MARKET.minSamples) {
    vals = same.concat(near);
    exactYear = false;
  }
  if (vals.length < MARKET.minSamples) return null;
  const price = Math.round((median(vals) + mileageAdj(mileage)) / 100) * 100;
  return { price, n: vals.length, exactYear };
}

// Зведення для тижневого звіту: { key: { year: {price, n} } } (для 150 тис. км)
export function marketSummary(market) {
  const by = {};
  for (const s of Object.values(market)) {
    const k = `${s.k}|${s.y}`;
    (by[k] ??= []).push(s.p - mileageAdj(s.m));
  }
  const out = {};
  for (const [k, vals] of Object.entries(by)) {
    if (vals.length < 3) continue;
    const [key, y] = k.split('|');
    (out[key] ??= {})[y] = { price: Math.round(median(vals) / 100) * 100, n: vals.length };
  }
  return out;
}
