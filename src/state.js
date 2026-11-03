// Памʼять бота: бачені оголошення (з ціною), відбитки машин, ринок, статистика
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pruneMarket } from './market.js';

const DAY = 24 * 3600 * 1000;
const KEEP_DAYS = 90;

export function emptyState() {
  return {
    seen: {},          // key -> { t, price, verdict, sent } (старий формат: key -> timestamp)
    fps: {},           // відбиток машини -> { key, price, t }
    market: {},        // id -> { k, y, m, p, t } — ціни для "живого ринку"
    marketUpdatedAt: null,
    sources: {},       // джерело -> true, якщо вже був перший запуск
    stats: {},         // 'YYYY-MM-DD' -> лічильники для звітів
    sentLog: [],       // надіслані за останні дні (для тижневого звіту)
    lastDailyReport: null,
    lastWeeklyReport: null,
    lastErrorNotifiedAt: null,
    lastHomeWarnAt: null,
    geoCache: {},
  };
}

export async function loadState(path) {
  const s = emptyState();
  try {
    Object.assign(s, JSON.parse(await readFile(path, 'utf8')));
  } catch { /* перший запуск */ }
  // старий стан: Otomoto вже працював
  if (!s.sources.otomoto && Object.keys(s.seen).some((k) => !k.startsWith('olx-'))) s.sources.otomoto = true;
  return s;
}

// Запис про бачене оголошення завжди в новому форматі
export function getSeen(state, key) {
  const r = state.seen[key];
  if (r === undefined) return null;
  if (typeof r === 'number') return (state.seen[key] = { t: r });
  return r;
}

export async function saveState(path, state, now = Date.now()) {
  const cutoff = now - KEEP_DAYS * DAY;
  for (const [id, r] of Object.entries(state.seen)) {
    const t = typeof r === 'number' ? r : r?.ls || r?.t;
    if (!t || t < cutoff) delete state.seen[id];
  }
  for (const [fp, r] of Object.entries(state.fps)) if (!r?.t || r.t < cutoff) delete state.fps[fp];
  pruneMarket(state.market, now);
  const statsCutoff = new Date(now - 15 * DAY).toISOString().slice(0, 10);
  for (const d of Object.keys(state.stats)) if (d < statsCutoff) delete state.stats[d];
  state.sentLog = state.sentLog.filter((x) => x.t > now - 10 * DAY);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state) + '\n');
}
