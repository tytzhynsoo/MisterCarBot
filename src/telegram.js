import { VERDICT, fmt } from './analyze.js';
import { formatDistance } from './geo.js';
import { FAR_DISTANCE_KM } from './config.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pctStr = (price, base) => {
  const pct = Math.round((price / base - 1) * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
};

// extra: { priceDrop: { oldPrice, relisted } }
export function formatMessage(l, a, extra = {}) {
  const lines = [];
  const drop = extra.priceDrop;
  if (drop) {
    const diff = drop.oldPrice - l.price;
    lines.push(
      drop.relisted
        ? `♻️📉 <b>ПЕРЕВИСТАВЛЕНА ДЕШЕВШЕ: було ${fmt(drop.oldPrice)} → ${fmt(l.price)} zł (−${fmt(diff)})</b>`
        : `📉 <b>ЦІНА ЗНИЖЕНА: було ${fmt(drop.oldPrice)} → ${fmt(l.price)} zł (−${fmt(diff)})</b>`,
    );
  }
  lines.push(`<b>${VERDICT[a.verdict]}</b>`);
  lines.push(`<b>${esc(l.title || 'Оголошення')}</b>${l.source === 'olx' ? ' · OLX' : ''}`);

  // ---- ціна і ринок ----
  lines.push(`💰 ${fmt(l.price)} zł`);
  const market = [];
  if (a.ref && l.price) market.push(`таблиця ~${fmt(a.ref)} (${pctStr(l.price, a.ref)})`);
  if (a.live?.price && l.price) {
    market.push(`живий ~${fmt(a.live.price)} (${pctStr(l.price, a.live.price)}, ${a.live.n} огол.${a.live.exactYear ? '' : ', ±1 рік'})`);
  }
  if (market.length) lines.push(`📊 Ринок: ${market.join(' · ')}`);
  else if (l.price) lines.push('📊 Ринок: поки мало даних для порівняння');

  // ---- повна сума ----
  if (a.cost) {
    const c = a.cost;
    const status = c.over > 0 ? `❌ на ${fmt(c.over)} понад ${fmt(c.budget)}` : `✅ у бюджеті ${fmt(c.budget)} (запас ${fmt(-c.over)})`;
    lines.push(`🧾 <b>Разом під ключ: ~${fmt(c.total)} zł</b> — ${status}`);
    const parts = c.items.filter(([, v]) => v > 0).map(([n, v]) => `${n} ${fmt(v)}`);
    const pccNote = c.seller === 'business' ? ' (фірма — без PCC)' : c.seller === 'unknown' ? ' (PCC — якщо продає приватна особа)' : '';
    lines.push(`   ${parts.join(' · ')}${pccNote}`);
  }

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

  // ---- історія: VIN, реєстрація ----
  const hist = [];
  if (l.vin) hist.push(`🔎 VIN: <code>${esc(l.vin)}</code>`);
  else if (l.hasVin) hist.push('🔎 VIN є в оголошенні — відкрий кнопкою VIN в оголошенні');
  if (l.firstRegistration) hist.push(`📄 Перша реєстрація: ${esc(l.firstRegistration)}`);
  if (l.hasRegData && !l.firstRegistration) hist.push('📄 Номер і дата 1-ї реєстрації вказані в оголошенні (по кнопці)');
  if (hist.length) {
    lines.push('', ...hist);
    if (l.vin || l.hasRegData) lines.push('   → перевір на historiapojazdu.gov.pl (VIN + номер + дата 1-ї реєстрації)');
  }

  if (a.pros.length) {
    lines.push('', '✅ <b>Плюси:</b>');
    for (const p of a.pros) lines.push(`• ${esc(p)}`);
  }
  if (a.cons.length) {
    lines.push('', '⚠️ <b>Мінуси / перевірити:</b>');
    for (const c of a.cons) lines.push(`• ${esc(c)}`);
  }
  const ask = l.vin ? 'номер і дату 1-ї реєстрації' : 'VIN';
  lines.push('', `📞 Спитай: ${ask}, чи не таксі, історію сервісу, тест батареї в ASO до купівлі.`);
  if (l.url) lines.push(`🔗 ${esc(l.url)}`);
  return lines.join('\n');
}

// photo — посилання на фото: Telegram покаже його великим прев'ю над текстом
export async function sendTelegram(text, { token, chatId, dryRun }, photo = null) {
  if (dryRun || !token || !chatId) {
    console.log('\n----- [DRY RUN] повідомлення в Telegram -----\n' + (photo ? `[фото: ${photo}]\n` : '') + text.replace(/<\/?(b|code)>/g, '') + '\n---------------------------------------------');
    return;
  }
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  body.link_preview_options = photo
    ? { url: photo, prefer_large_media: true, show_above_text: true }
    : { is_disabled: true };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Telegram ${res.status}: ${t}`);
  }
}
