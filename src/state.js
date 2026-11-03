// Памʼять бота: які оголошення вже бачили (щоб не слати повторно)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const KEEP_DAYS = 90;

export async function loadState(path) {
  try {
    const s = JSON.parse(await readFile(path, 'utf8'));
    return { seen: s.seen || {}, lastErrorNotifiedAt: s.lastErrorNotifiedAt || null, geoCache: s.geoCache || {} };
  } catch {
    return { seen: {}, lastErrorNotifiedAt: null, geoCache: {} };
  }
}

export async function saveState(path, state) {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
  for (const [id, ts] of Object.entries(state.seen)) {
    if (ts < cutoff) delete state.seen[id];
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + '\n');
}
