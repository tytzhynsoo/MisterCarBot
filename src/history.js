// Автоматична перевірка на historiapojazdu.gov.pl (Centralna Ewidencja Pojazdów).
// Запускається окремим кроком на GitHub лише тоді, коли в черзі є машини,
// для яких продавець сам вказав VIN + номер + дату першої реєстрації.
// Також можна запустити вручну: Run workflow → поля VIN, номер, дата.
import { readFile } from 'node:fs/promises';
import { loadState, saveState } from './state.js';
import { toPlDate, cleanVin } from './vin.js';

const STATE_PATH = process.env.STATE_PATH || 'data/state.json';
const URL = 'https://historiapojazdu.gov.pl/';
const MAX_PER_RUN = 3;
const fmt = (n) => Number(n).toLocaleString('uk-UA').replace(/,/g, ' ');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- розбір тексту звіту (чиста функція, покрита тестами) ----
export function summarize(text, listingMileage = null) {
  const t = String(text).replace(/\s+/g, ' ');
  if (/Nie znaleźliśmy pojazdu/i.test(t)) return { found: false };
  const readings = [...t.matchAll(/(?:Odczytany|Ostatni) stan licznika:\s*([\d\s ]+)\s*km/gi)]
    .map((m) => Number(m[1].replace(/\D/g, '')))
    .filter((n) => n > 0);
  const uniq = [...new Set(readings)];
  const sorted = [...uniq].sort((a, b) => a - b);
  const max = sorted.length ? sorted[sorted.length - 1] : null;
  // Якщо в звіті показання йдуть хронологічно, зменшення = підозра на скручування
  let decreased = false;
  for (let i = 1; i < readings.length; i++) if (readings[i] < readings[i - 1] - 1000) decreased = true;
  const owners = (t.match(/Liczba (?:aktualnych )?właścicieli:\s*(\d+)/i) || [])[1];
  const changes = (t.match(/Zmiana właściciela/gi) || []).length;
  const taxiNo = /taxi\s*nie odnotowano|nie odnotowano.{0,30}taxi/i.test(t);
  const taxiYes = !taxiNo && /(służył|używany) jako taxi(?!\s*nie)/i.test(t);
  const stolen = /(kradzież|kradziony|poszukiwany)(?!.{0,20}nie odnotowano)/i.test(t) && !/nie (jest )?poszukiwany/i.test(t);
  const inspection = (t.match(/Badanie techniczne:\s*(aktualne|nieaktualne|brak[^.]*)/i) || [])[1] || null;
  const firstPl = (t.match(/Pierwsza rejestracja w Polsce[^0-9]{0,40}(\d{2}\.\d{2}\.\d{4})/i) || [])[1] || null;
  const flags = [];
  if (decreased) flags.push('Пробіг у звіті ЗМЕНШУВАВСЯ — ймовірно скручений лічильник');
  if (max && listingMileage && listingMileage < max - 1000) {
    flags.push(`В оголошенні ${fmt(listingMileage)} км, а в реєстрі вже було ${fmt(max)} км — скручений пробіг!`);
  }
  if (taxiYes) flags.push('Машина була таксі');
  if (stolen) flags.push('Згадка про крадіжку/розшук — перевір уважно');
  if (inspection && !/^aktualne/i.test(inspection)) flags.push(`Техогляд: ${inspection}`);
  return { found: true, readings: uniq, max, owners: owners ? Number(owners) : null, changes, taxi: taxiYes, taxiNo, inspection, firstPl, flags };
}

export function summaryText(item, s) {
  const head = `🔎 <b>historiapojazdu.gov.pl</b>: ${esc(item.title || item.vin)}`;
  if (!s.found) {
    return `${head}\n❌ Машину НЕ знайдено в реєстрі за даними з оголошення (VIN ${esc(item.vin)}, номер ${esc(item.plate)}, дата ${esc(item.date)}).\nАбо продавець помилився, або дані фейкові — перепитай.${item.url ? `\n🔗 ${esc(item.url)}` : ''}`;
  }
  const lines = [head];
  lines.push(s.flags.length ? '⚠️ <b>Червоні прапорці:</b>' : '✅ Явних червоних прапорців у реєстрі немає');
  for (const f of s.flags) lines.push(`• ${esc(f)}`);
  if (s.readings.length) lines.push(`🛣 Показання лічильника на техоглядах: ${s.readings.map(fmt).join(' → ')} км`);
  if (s.owners !== null) lines.push(`👤 Власників зараз: ${s.owners}${s.changes ? `, змін власника: ${s.changes}` : ''}`);
  if (s.firstPl) lines.push(`🇵🇱 Перша реєстрація в Польщі: ${s.firstPl}`);
  lines.push(`🚕 Таксі: ${s.taxi ? 'ТАК' : s.taxiNo ? 'не відмічено' : 'невідомо'}`);
  if (s.inspection) lines.push(`🧰 Техогляд: ${esc(s.inspection)}`);
  lines.push('Повний звіт — у PDF нижче. Пробіг у реєстрі записують з 2014 року.');
  if (item.url) lines.push(`🔗 ${esc(item.url)}`);
  return lines.join('\n');
}

// ---- Telegram ----
async function tgCall(method, form) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || process.env.DRY_RUN === '1') {
    console.log(`[DRY RUN] ${method}`, form instanceof FormData ? [...form.keys()] : form);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}
const sendText = (text) => {
  const f = new FormData();
  f.set('chat_id', process.env.TELEGRAM_CHAT_ID);
  f.set('text', text);
  f.set('parse_mode', 'HTML');
  f.set('link_preview_options', JSON.stringify({ is_disabled: true }));
  return tgCall('sendMessage', f);
};
const sendFile = (method, field, buf, name, type, caption) => {
  const f = new FormData();
  f.set('chat_id', process.env.TELEGRAM_CHAT_ID);
  f.set(field, new Blob([buf], { type }), name);
  if (caption) f.set('caption', caption);
  return tgCall(method, f);
};

// ---- сам сайт ----
async function checkOne(browser, item) {
  const page = await browser.newPage({ locale: 'pl-PL', acceptDownloads: true });
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.locator('#registrationNumber').fill(item.plate);
    await page.locator('#VINNumber').fill(item.vin);
    await page.locator('#firstRegistrationDate').fill(item.date);
    await page.getByRole('button', { name: /sprawdź pojazd/i }).click();
    await page.waitForFunction(
      () => /Nie znaleźliśmy pojazdu|Pobierz|RAPORT O POJEŹDZIE|Oś czasu|stan licznika/i.test(document.body.innerText),
      null, { timeout: 45000 },
    ).catch(() => {});
    await page.waitForTimeout(2000);
    let text = await page.innerText('body');
    // вкладка "Oś czasu" містить показання лічильника
    const tab = page.getByText(/^Oś czasu$/i).first();
    if (await tab.count()) {
      await tab.click().catch(() => {});
      await page.waitForTimeout(1500);
      text += '\n' + (await page.innerText('body'));
    }
    const s = summarize(text, item.mileage);
    await sendText(summaryText(item, s));
    if (!s.found) return;
    // PDF
    let sent = false;
    const btn = page.getByText(/Pobierz (raport )?PDF/i).first();
    if (await btn.count()) {
      try {
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), btn.click()]);
        const path = await dl.path();
        const buf = await readFile(path);
        await sendFile('sendDocument', 'document', buf, `historia-${item.vin}.pdf`, 'application/pdf', `Звіт historiapojazdu: ${item.vin}`);
        sent = true;
      } catch (e) {
        console.error('PDF:', e.message);
      }
    }
    if (!sent) {
      // запасний варіант — скріншот звіту
      const shot = await page.screenshot({ fullPage: true });
      await sendFile('sendPhoto', 'photo', shot, 'historia.png', 'image/png', `Звіт historiapojazdu (скріншот): ${item.vin}`);
    }
  } finally {
    await page.close();
  }
}

async function main() {
  const state = await loadState(STATE_PATH);
  state.historyQueue ??= [];
  state.historyDone ??= {};
  // ручний запуск із полями
  const mv = cleanVin(process.env.MANUAL_VIN);
  if (mv && process.env.MANUAL_PLATE && process.env.MANUAL_DATE) {
    state.historyQueue.unshift({
      vin: mv,
      plate: process.env.MANUAL_PLATE.toUpperCase().replace(/\s/g, ''),
      date: toPlDate(process.env.MANUAL_DATE.trim()) || process.env.MANUAL_DATE.trim(),
      title: 'Ручна перевірка',
      manual: true,
    });
  }
  const batch = state.historyQueue.splice(0, MAX_PER_RUN);
  if (!batch.length) return console.log('Черга перевірок порожня');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    for (const item of batch) {
      console.log(`Перевіряю ${item.vin} / ${item.plate} / ${item.date}`);
      try {
        await checkOne(browser, item);
        if (!item.manual) state.historyDone[item.vin] = Date.now();
      } catch (e) {
        console.error(`Помилка ${item.vin}: ${e.message}`);
        item.tries = (item.tries || 0) + 1;
        if (item.tries < 3) state.historyQueue.push(item);
        else await sendText(`⚠️ Не вдалося перевірити ${esc(item.title || item.vin)} на historiapojazdu: ${esc(e.message.slice(0, 200))}`).catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }
  await saveState(STATE_PATH, state);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
