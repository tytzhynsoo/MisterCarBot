import { VERDICT, fmt } from './analyze.js';
import { formatDistance } from './geo.js';
import { FAR_DISTANCE_KM } from './config.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function formatMessage(l, a) {
  const lines = [];
  lines.push(`<b>${VERDICT[a.verdict]}</b>`);
  lines.push(`<b>${esc(l.title || 'Оголошення')}</b>`);

  let priceLine = `💰 ${fmt(l.price)} zł`;
  if (a.ref && a.ratio) {
    const pct = Math.round((a.ratio - 1) * 100);
    priceLine += ` (ринок ~${fmt(a.ref)}, ${pct > 0 ? '+' : ''}${pct}%)`;
  }
  lines.push(priceLine);

  const meta = [
    l.year && `📅 ${l.year}`,
    l.mileage && `🛣 ${fmt(l.mileage)} км`,
    l.fuelLabel && `⛽ ${esc(l.fuelLabel)}`,
    (l.city || l.region) && `📍 ${esc([l.city, l.region].filter(Boolean).join(', '))}`,
  ].filter(Boolean);
  if (meta.length) lines.push(meta.join(' · '));
  const dist = formatDistance(l.distance);
  if (dist) {
    lines.push(dist + (l.distance.km > FAR_DISTANCE_KM ? ' — ⚠️ далеко, спершу все узгодь телефоном' : ''));
  }

  if (a.pros.length) {
    lines.push('', '✅ <b>Плюси:</b>');
    for (const p of a.pros) lines.push(`• ${esc(p)}`);
  }
  if (a.cons.length) {
    lines.push('', '⚠️ <b>Мінуси / перевірити:</b>');
    for (const c of a.cons) lines.push(`• ${esc(c)}`);
  }
  lines.push('', '📞 Спитай: VIN, чи не таксі, історію сервісу, тест батареї в ASO до купівлі.');
  if (l.url) lines.push(`🔗 ${esc(l.url)}`);
  return lines.join('\n');
}

export async function sendTelegram(text, { token, chatId, dryRun }) {
  if (dryRun || !token || !chatId) {
    console.log('\n----- [DRY RUN] повідомлення в Telegram -----\n' + text.replace(/<\/?b>/g, '') + '\n---------------------------------------------');
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: false }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram ${res.status}: ${body}`);
  }
}
