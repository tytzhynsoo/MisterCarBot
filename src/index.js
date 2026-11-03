// Головний скрипт: шукає нові оголошення, оцінює, шле в Telegram.
import { readFile } from 'node:fs/promises';
import { SEARCHES, buildSearchUrl, REQUEST_DELAY_MS, MAX_DETAIL_FETCHES, NOTIFY_LOOK } from './config.js';
import { fetchHtml, parseSearchPage, parseDetailPage, mergeListing, BlockedError } from './otomoto.js';
import { analyze } from './analyze.js';
import { formatMessage, sendTelegram } from './telegram.js';
import { loadState, saveState } from './state.js';
import { createGeo, homePoint, distanceTo } from './geo.js';

const STATE_PATH = process.env.STATE_PATH || 'data/state.json';
const tg = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  dryRun: process.env.DRY_RUN === '1',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms + Math.floor(Math.random() * 1000)));
const PRIORITY = { HOT: 0, CAUTION: 1, LOOK: 2, SKIP: 9 };

// ---- Режим перевірки парсера на збереженій сторінці ----
// node src/index.js --parse-file page.html          (сторінка пошуку)
// node src/index.js --parse-file page.html --detail (сторінка оголошення)
async function parseFileMode(path, isDetail) {
  const html = await readFile(path, 'utf8');
  const listings = isDetail
    ? [parseDetailPage(html, 'https://www.otomoto.pl/osobowe/oferta/test-ID0.html')].filter(Boolean)
    : parseSearchPage(html);
  console.log(`Знайдено оголошень: ${listings.length}`);
  for (const l of listings) {
    const a = analyze(l);
    console.log(JSON.stringify({ ...l, description: (l.description || '').slice(0, 120) }, null, 2));
    console.log(`→ ${a.verdict} (бал ${a.score})${a.skipReasons.length ? ' — ' + a.skipReasons.join(', ') : ''}\n`);
  }
}

async function main() {
  const i = process.argv.indexOf('--parse-file');
  if (i !== -1) return parseFileMode(process.argv[i + 1], process.argv.includes('--detail'));

  const state = await loadState(STATE_PATH);
  const firstRun = Object.keys(state.seen).length === 0;
  const all = new Map();
  let blocked = false;
  let okSearches = 0;

  for (const s of SEARCHES) {
    const url = buildSearchUrl(s);
    try {
      const html = await fetchHtml(url);
      const found = parseSearchPage(html);
      console.log(`[${s.name}] знайдено: ${found.length}`);
      if (found.length) okSearches++;
      for (const l of found) if (!all.has(l.id)) all.set(l.id, l);
    } catch (e) {
      if (e instanceof BlockedError) blocked = true;
      console.error(`[${s.name}] помилка: ${e.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  // Якщо нічого не вдалося зчитати — попереджаємо (не частіше раз на добу)
  if (okSearches === 0) {
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    if (!state.lastErrorNotifiedAt || state.lastErrorNotifiedAt < dayAgo) {
      await sendTelegram(
        blocked
          ? '⚠️ Бот: Otomoto блокує запити (403/429). Спробуй запускати рідше або локально на своєму ПК.'
          : '⚠️ Бот: не знайшов жодного оголошення. Можливо, Otomoto змінив сайт — треба оновити парсер.',
        tg,
      ).catch((e) => console.error(e.message));
      state.lastErrorNotifiedAt = Date.now();
    }
    await saveState(STATE_PATH, state);
    return;
  }

  const fresh = [...all.values()].filter((l) => !state.seen[l.id]);
  console.log(`Нових оголошень: ${fresh.length}${firstRun ? ' (перший запуск)' : ''}`);

  const results = [];
  let detailFetches = 0;
  for (const l of fresh) {
    let listing = l;
    let a = l.partial ? null : analyze(l);
    // Детальну сторінку відкриваємо лише для кандидатів (економимо запити)
    if ((!a || a.verdict !== 'SKIP') && detailFetches < MAX_DETAIL_FETCHES) {
      try {
        detailFetches++;
        const detail = parseDetailPage(await fetchHtml(l.url), l.url);
        listing = mergeListing(l, detail);
        a = analyze(listing);
      } catch (e) {
        console.error(`Деталі ${l.url}: ${e.message}`);
        if (e instanceof BlockedError) break;
      }
      await sleep(REQUEST_DELAY_MS);
    }
    if (!a) continue; // неповне оголошення без деталей — спробуємо наступного разу
    state.seen[l.id] = Date.now();
    results.push({ listing, a });
  }

  let toSend = results
    .filter(({ a }) => a.verdict === 'HOT' || a.verdict === 'CAUTION' || (a.verdict === 'LOOK' && NOTIFY_LOOK && !firstRun))
    .sort((x, y) => PRIORITY[x.a.verdict] - PRIORITY[y.a.verdict] || y.a.score - x.a.score);

  if (firstRun) {
    toSend = toSend.slice(0, 5);
    await sendTelegram(
      `🤖 Бот запущено. Зараз на Otomoto за фільтрами: ${all.size} оголошень. ` +
        `Нижче — найкращі з них (до 5). Далі писатиму лише про нові.`,
      tg,
    );
  }

  // Відстань по дорогах — лише для тих, що надсилаємо (економимо запити)
  const geo = createGeo({ cache: state.geoCache });
  let home = null;
  if (toSend.length) {
    try {
      home = await homePoint(geo);
      if (!home) console.log('Відстань: не задано HOME_ADDRESS або HOME_LAT/HOME_LON — пропускаю');
      if (home?.notFound) {
        console.log('Відстань: адресу з HOME_ADDRESS не знайдено на карті');
        const dayAgo = Date.now() - 24 * 3600 * 1000;
        if (!state.lastHomeWarnAt || state.lastHomeWarnAt < dayAgo) {
          await sendTelegram(
            '⚠️ Не вдалося знайти твою адресу на карті, тож відстань поки не рахується. ' +
              'Найпростіше: у Google Maps натисни на свій будинок, скопіюй координати ' +
              'і додай у GitHub секрети HOME_LAT (перше число) та HOME_LON (друге число).',
            tg,
          ).catch((e) => console.error(e.message));
          state.lastHomeWarnAt = Date.now();
        }
        home = null;
      }
    } catch (e) {
      console.error(`Не вдалося знайти координати дому: ${e.message}`);
    }
  }

  for (const { listing, a } of toSend) {
    if (home) {
      try {
        listing.distance = await distanceTo(geo, home, listing);
      } catch (e) {
        console.error(`Відстань до ${listing.city}: ${e.message}`);
      }
    }
    await sendTelegram(formatMessage(listing, a), tg);
    await sleep(1000);
  }
  console.log(`Надіслано: ${toSend.length}`);
  await saveState(STATE_PATH, state);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
