// Головний скрипт: шукає нові оголошення (Otomoto + OLX), оцінює, шле в Telegram.
import { readFile } from 'node:fs/promises';
import {
  SEARCHES, buildSearchUrl, buildOlxUrl, OLX, MARKET,
  REQUEST_DELAY_MS, MAX_DETAIL_FETCHES, NOTIFY_LOOK, NOTIFY_CAUTION,
} from './config.js';
import { fetchHtml, parseSearchPage, parseDetailPage, mergeListing, BlockedError } from './otomoto.js';
import { fetchOlx, parseOlxResponse } from './olx.js';
import { analyze, detectKind, detectMake } from './analyze.js';
import { formatMessage, sendTelegram } from './telegram.js';
import { loadState, saveState, getSeen } from './state.js';
import { createGeo, homePoint, distanceTo } from './geo.js';
import { addSamples, livePrice, marketKey } from './market.js';
import { dayStats, localNow, dailyReport, weeklyReport, reportsDue } from './reports.js';

const STATE_PATH = process.env.STATE_PATH || 'data/state.json';
const tg = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  dryRun: process.env.DRY_RUN === '1',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms + Math.floor(Math.random() * 1000)));
const PRIORITY = { HOT: 0, CAUTION: 1, LOOK: 2, SKIP: 9 };
const HOUR = 3600 * 1000;

// ---- Режим перевірки парсера на збереженій сторінці ----
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

// Відбиток машини: той самий авто, виставлений повторно або на іншому сайті
export function fingerprint(l) {
  if (l.vin) return `vin:${l.vin}`;
  const make = detectMake(l);
  if (make && l.year && l.mileage && l.mileage >= 1000) return `${make}|${l.year}|${l.mileage}`;
  return null;
}

const liveFor = (state, l) => livePrice(state.market, marketKey(detectKind(l), l), l.year, l.mileage);

// Раз на добу: свіжі ціни без обмеження бюджету — для "живого ринку"
async function refreshMarket(state) {
  if (state.marketUpdatedAt && Date.now() - state.marketUpdatedAt < MARKET.refreshHours * HOUR) return;
  let added = 0;
  for (const s of SEARCHES.filter((x) => x.path)) {
    for (let page = 1; page <= MARKET.pages; page++) {
      try {
        const found = parseSearchPage(await fetchHtml(buildSearchUrl(s, { market: true, page })));
        added += addSamples(state.market, found.filter((l) => !l.partial && !l.damaged).map((l) => ({
          id: l.id, key: marketKey(detectKind(l), l), year: l.year, mileage: l.mileage, price: l.price,
        })));
      } catch (e) {
        console.error(`[ринок ${s.name} p${page}] ${e.message}`);
        if (e instanceof BlockedError) return;
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }
  state.marketUpdatedAt = Date.now();
  console.log(`Ринок оновлено: +${added}, усього ${Object.keys(state.market).length}`);
}

async function collect(stats) {
  const all = new Map();
  let ok = 0;
  let blocked = false;
  for (const s of SEARCHES) {
    try {
      const found = parseSearchPage(await fetchHtml(buildSearchUrl(s)));
      console.log(`[${s.name}] знайдено: ${found.length}`);
      if (found.length) ok++;
      for (const l of found) if (!all.has(l.id)) all.set(l.id, l);
    } catch (e) {
      if (e instanceof BlockedError) blocked = true;
      stats.errors++;
      console.error(`[${s.name}] помилка: ${e.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  if (OLX.enabled) {
    for (let page = 0; page < OLX.pages; page++) {
      try {
        const found = parseOlxResponse(await fetchOlx(buildOlxUrl(page * OLX.limit)));
        console.log(`[OLX p${page + 1}] знайдено: ${found.length}`);
        if (found.length) ok++;
        for (const l of found) if (!all.has(l.id)) all.set(l.id, l);
        if (found.length < OLX.limit / 2) break;
      } catch (e) {
        stats.errors++;
        console.error(`[OLX] помилка: ${e.message}`);
        break;
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }
  return { all, ok, blocked };
}

async function main() {
  const i = process.argv.indexOf('--parse-file');
  if (i !== -1) return parseFileMode(process.argv[i + 1], process.argv.includes('--detail'));

  const state = await loadState(STATE_PATH);
  const testRun = process.env.TEST_TOP === '1';
  const today = localNow().day;
  const stats = dayStats(state, today);
  stats.runs++;

  const { all, ok, blocked } = await collect(stats);

  if (ok === 0) {
    const dayAgo = Date.now() - 24 * HOUR;
    if (!state.lastErrorNotifiedAt || state.lastErrorNotifiedAt < dayAgo) {
      await sendTelegram(
        blocked
          ? '⚠️ Бот: Otomoto блокує запити (403/429). Спробуй запускати рідше.'
          : '⚠️ Бот: не знайшов жодного оголошення. Можливо, сайт змінився — треба оновити парсер.',
        tg,
      ).catch((e) => console.error(e.message));
      state.lastErrorNotifiedAt = Date.now();
    }
    await sendReports(state);
    await saveState(STATE_PATH, state);
    return;
  }

  await refreshMarket(state).catch((e) => console.error(`Ринок: ${e.message}`));

  // ---- що нове, що подешевшало, що повтор ----
  const now = Date.now();
  const candidates = [];
  for (const l of all.values()) {
    const src = l.source || 'otomoto';
    const rec = getSeen(state, l.id);
    if (testRun) { candidates.push({ l, src }); continue; }
    if (rec) {
      rec.ls = now;
      if (rec.price && l.price && l.price < rec.price) {
        candidates.push({ l, src, drop: { oldPrice: rec.price } });
      } else if (l.price && !rec.price) rec.price = l.price;
      continue;
    }
    const fp = fingerprint(l);
    const twin = fp && state.fps[fp];
    if (twin && twin.key !== l.id) {
      if (l.price && twin.price && l.price < twin.price) {
        candidates.push({ l, src, drop: { oldPrice: twin.price, relisted: true } });
      } else {
        // та сама машина вже була (інший сайт або перевиставлена) — мовчимо
        state.seen[l.id] = { t: now, price: l.price, dup: twin.key };
        stats.dupes++;
      }
      continue;
    }
    candidates.push({ l, src });
  }
  // Перший запуск джерела (напр. OLX щойно підключено): не засипаємо старими оголошеннями
  const firstSources = new Set(testRun ? [] : candidates.map((c) => c.src).filter((s) => !state.sources[s]));
  console.log(`Кандидатів: ${candidates.length} (знижень: ${candidates.filter((c) => c.drop).length})${firstSources.size ? `, перший запуск: ${[...firstSources]}` : ''}`);

  // ---- аналіз ----
  const results = [];
  let detailFetches = 0;
  const detailLimit = testRun ? 40 : MAX_DETAIL_FETCHES;
  for (const c of candidates) {
    let listing = c.l;
    let a = listing.partial ? null : analyze(listing, { live: liveFor(state, listing) });
    // Детальна сторінка Otomoto — лише для кандидатів (OLX і так віддає опис)
    if (c.src === 'otomoto' && (!a || a.verdict !== 'SKIP') && detailFetches < detailLimit) {
      try {
        detailFetches++;
        const detail = parseDetailPage(await fetchHtml(listing.url), listing.url);
        listing = mergeListing(listing, detail);
        a = analyze(listing, { live: liveFor(state, listing) });
      } catch (e) {
        console.error(`Деталі ${listing.url}: ${e.message}`);
        if (e instanceof BlockedError) break;
      }
      await sleep(REQUEST_DELAY_MS);
    } else if (c.src === 'otomoto' && a && a.verdict !== 'SKIP') {
      continue; // ліміт детальних сторінок — розберемо наступного запуску
    }
    if (!a) continue;

    const prev = getSeen(state, listing.id);
    state.seen[listing.id] = { t: prev?.t || now, ls: now, price: listing.price, v: a.verdict, sent: prev?.sent || false };
    const fp = fingerprint(listing);
    if (fp) state.fps[fp] = { key: listing.id, price: listing.price, t: now };

    if (!c.drop) {
      stats.checked++;
      stats[c.src === 'olx' ? 'olx' : 'otomoto']++;
      if (a.verdict === 'SKIP') {
        stats.skipped++;
        for (const code of a.skipCodes || []) stats.reasons[code] = (stats.reasons[code] || 0) + 1;
      }
    }
    results.push({ listing, a, c });
  }

  const wanted = ({ a }) =>
    a.verdict === 'HOT' || (a.verdict === 'CAUTION' && NOTIFY_CAUTION) || (a.verdict === 'LOOK' && NOTIFY_LOOK);
  const byScore = (x, y) => PRIORITY[x.a.verdict] - PRIORITY[y.a.verdict] || y.a.score - x.a.score;

  let toSend = [];
  const intro = [];
  if (testRun) {
    toSend = results.filter(wanted).sort(byScore).slice(0, 5);
    const skipped = results.filter(({ a }) => a.verdict === 'SKIP').length;
    intro.push(`🧪 Тест фільтрів. Перевірено: ${results.length} (Otomoto ${results.filter((r) => r.c.src === 'otomoto').length}, OLX ${results.filter((r) => r.c.src === 'olx').length}), відсіяно: ${skipped}. Нижче — до 5 найкращих.`);
  } else {
    toSend = results.filter((r) => !firstSources.has(r.c.src) && wanted(r)).sort(byScore);
    for (const src of firstSources) {
      const best = results.filter((r) => r.c.src === src && wanted(r)).sort(byScore).slice(0, 3);
      const n = results.filter((r) => r.c.src === src).length;
      intro.push(`🤖 ${src === 'olx' ? 'OLX' : 'Otomoto'} підключено: зараз ${n} оголошень за фільтрами. Нижче — до 3 найкращих, далі писатиму лише про нові та подешевшалі.`);
      toSend.push(...best);
    }
  }
  for (const s of firstSources) state.sources[s] = true;

  // ---- відстань (лише для тих, що надсилаємо) ----
  const geo = createGeo({ cache: state.geoCache });
  let home = null;
  if (toSend.length) home = await getHome(state, geo);

  for (const text of intro) await sendTelegram(text, tg).catch((e) => console.error(e.message));
  for (const { listing, a, c } of toSend) {
    if (home) {
      try { listing.distance = await distanceTo(geo, home, listing); } catch (e) { console.error(`Відстань: ${e.message}`); }
    }
    try {
      await sendTelegram(formatMessage(listing, a, { priceDrop: c.drop }), tg, listing.photo);
    } catch (e) {
      // якщо Telegram не зміг з фото — пробуємо без нього
      console.error(e.message);
      await sendTelegram(formatMessage(listing, a, { priceDrop: c.drop }), tg).catch((e2) => console.error(e2.message));
    }
    state.seen[listing.id].sent = true;
    if (!testRun) {
      stats.sent++;
      if (a.verdict === 'HOT') stats.hot++; else stats.look++;
      if (c.drop) stats.drops++;
      state.sentLog.push({ t: Date.now(), title: listing.title, price: listing.price, url: listing.url, v: a.verdict });
    }
    await sleep(1000);
  }
  console.log(`Надіслано: ${toSend.length}`);

  await sendReports(state);
  await saveState(STATE_PATH, state);
}

async function getHome(state, geo) {
  try {
    const home = await homePoint(geo);
    if (!home) console.log('Відстань: не задано HOME_ADDRESS або HOME_LAT/HOME_LON — пропускаю');
    if (home?.notFound) {
      console.log('Відстань: адресу з HOME_ADDRESS не знайдено на карті');
      if (!state.lastHomeWarnAt || state.lastHomeWarnAt < Date.now() - 24 * HOUR) {
        await sendTelegram(
          '⚠️ Не вдалося знайти твою адресу на карті, тож відстань поки не рахується. ' +
            'У Google Maps натисни на свій будинок, скопіюй координати ' +
            'і додай у GitHub секрети HOME_LAT (перше число) та HOME_LON (друге число).',
          tg,
        ).catch((e) => console.error(e.message));
        state.lastHomeWarnAt = Date.now();
      }
      return null;
    }
    return home;
  } catch (e) {
    console.error(`Координати дому: ${e.message}`);
    return null;
  }
}

async function sendReports(state) {
  if (process.env.TEST_TOP === '1') return;
  const due = reportsDue(state);
  if (due.daily) {
    await sendTelegram(dailyReport(state, due.day), tg).catch((e) => console.error(e.message));
    state.lastDailyReport = due.day;
  }
  if (due.weekly) {
    await sendTelegram(weeklyReport(state, due.day), tg).catch((e) => console.error(e.message));
    state.lastWeeklyReport = due.day;
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
