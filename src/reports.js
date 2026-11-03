// Щоденний і тижневий звіти
import { REPORTS } from './config.js';
import { SKIP_LABELS, fmt } from './analyze.js';
import { marketSummary } from './market.js';

const DAY = 24 * 3600 * 1000;
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Поточна дата/година у Варшаві
export function localNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: REPORTS.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: WD[parts.weekday] };
}

export function emptyStats() {
  return { runs: 0, otomoto: 0, olx: 0, checked: 0, sent: 0, hot: 0, look: 0, drops: 0, dupes: 0, skipped: 0, errors: 0, reasons: {} };
}

export function dayStats(state, day) {
  return (state.stats[day] ??= emptyStats());
}

const dmy = (day) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
const reasonsLine = (reasons) =>
  Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, n]) => `${SKIP_LABELS[k] || k} ${n}`).join(', ');

function sumStats(list) {
  const s = emptyStats();
  for (const x of list) {
    for (const k of Object.keys(s)) if (typeof s[k] === 'number') s[k] += x[k] || 0;
    for (const [r, n] of Object.entries(x.reasons || {})) s.reasons[r] = (s.reasons[r] || 0) + n;
  }
  return s;
}

function body(s) {
  const lines = [
    `Нових оголошень перевірено: ${s.checked} (Otomoto ${s.otomoto}, OLX ${s.olx})`,
    `Надіслано: ${s.sent} (🔥 ${s.hot}, 👀 ${s.look}) · знижень ціни: ${s.drops} · повторів відсіяно: ${s.dupes}`,
  ];
  if (s.skipped) lines.push(`Відсіяно: ${s.skipped} — ${reasonsLine(s.reasons)}`);
  if (s.errors) lines.push(`⚠️ Помилок завантаження: ${s.errors}`);
  return lines;
}

export function dailyReport(state, day) {
  const s = dayStats(state, day);
  const lines = [`📋 <b>Звіт за ${dmy(day)}</b> — бот працює ✅ (запусків: ${s.runs})`, ...body(s)];
  if (!s.sent) lines.push('Підходящих нових машин сьогодні не було — нічого не пропущено.');
  return lines.join('\n');
}

const KIND_NAMES = {
  auris_ts: 'Auris TS', auris_hatch: 'Auris хетчбек', prius: 'Prius', prius_plus: 'Prius+', lexus_ct: 'Lexus CT',
};
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function weeklyReport(state, day, now = Date.now()) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(new Date(day + 'T12:00:00Z').getTime() - i * DAY).toISOString().slice(0, 10);
    if (state.stats[d]) days.push(state.stats[d]);
  }
  const s = sumStats(days);
  const lines = [`🗓 <b>Тижневий звіт</b> (${dmy(new Date(new Date(day + 'T12:00:00Z').getTime() - 6 * DAY).toISOString().slice(0, 10))}–${dmy(day)})`, ...body(s)];

  const sent = state.sentLog.filter((x) => x.t > now - 7 * DAY).sort((a, b) => a.price - b.price).slice(0, 10);
  if (sent.length) {
    lines.push('', '<b>Надіслані за тиждень:</b>');
    for (const x of sent) lines.push(`• ${x.v === 'HOT' ? '🔥' : '👀'} ${esc(x.title)} — ${fmt(x.price)} zł\n  ${esc(x.url)}`);
  }

  const sum = marketSummary(state.market);
  const mk = Object.keys(KIND_NAMES).filter((k) => sum[k]);
  if (mk.length) {
    lines.push('', '<b>Живі ціни ринку</b> (медіана, перераховано на 150 тис. км):');
    for (const k of mk) {
      const years = Object.entries(sum[k]).sort((a, b) => a[0] - b[0]).slice(-5)
        .map(([y, v]) => `${y} — ${fmt(v.price)} (${v.n})`).join(', ');
      lines.push(`• ${KIND_NAMES[k]}: ${years}`);
    }
  }
  return lines.join('\n');
}

// Чи час надсилати звіти зараз
export function reportsDue(state, date = new Date()) {
  const { day, hour, weekday } = localNow(date);
  const daily = hour >= REPORTS.dailyHour && state.lastDailyReport !== day;
  const weekly = daily && weekday === REPORTS.weeklyDay && state.lastWeeklyReport !== day;
  return { day, daily, weekly };
}
