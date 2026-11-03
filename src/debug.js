// Діагностика: показує, які дані реально віддають Otomoto та OLX.
// Запуск: node src/debug.js (на GitHub — Run workflow з галочкою debug)
import { fetchHtml, extractNextData, collectParams, parseSearchPage } from './otomoto.js';

const short = (v, n = 300) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + '…' : s;
};

function findKeys(root, re, out = [], path = '', depth = 0, seen = new Set()) {
  if (!root || typeof root !== 'object' || depth > 40 || seen.has(root)) return out;
  seen.add(root);
  for (const [k, v] of Object.entries(root)) {
    const p = `${path}.${k}`;
    if (re.test(k) && out.length < 60) out.push(`${p} = ${short(v, 200)}`);
    if (typeof v === 'string' && v.length > 50 && (v.startsWith('{"') || v.startsWith('[{'))) {
      try { findKeys(JSON.parse(v), re, out, p + '(json)', depth + 1, seen); } catch {}
    } else if (v && typeof v === 'object') findKeys(v, re, out, p, depth + 1, seen);
  }
  return out;
}

async function otomoto() {
  console.log('===== OTOMOTO SEARCH =====');
  const url = 'https://www.otomoto.pl/osobowe/toyota/prius?search%5Bfilter_float_price%3Ato%5D=42000&search%5Border%5D=created_at_first%3Adesc';
  const html = await fetchHtml(url);
  const data = extractNextData(html);
  console.log('photo/image keys in search:', findKeys(data, /photo|image|thumbnail/i).slice(0, 10).join('\n'));
  const list = parseSearchPage(html);
  console.log('listings:', list.length, short(list[0], 800));
  if (!list[0]) return;
  console.log('===== OTOMOTO DETAIL =====', list[0].url);
  const d = extractNextData(await fetchHtml(list[0].url));
  console.log(findKeys(d, /vin|regist|rejestr|plate|photo|image|seller.?type|^type$|business|private/i).join('\n'));
  const params = collectParams(d);
  console.log('PARAM KEYS:', Object.entries(params).map(([k, v]) => `${k}=${short(v.value, 40)}|${short(v.label, 40)}`).join('\n'));
}

async function olx() {
  console.log('===== OLX API =====');
  const base = 'https://www.olx.pl/api/v1/offers/?offset=0&limit=40&category_id=84&sort_by=created_at:desc';
  const res = await fetch(base + '&query=toyota%20prius', { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  console.log('status', res.status);
  const j = await res.json();
  const o = j.data?.[0];
  console.log('keys:', o && Object.keys(o).join(','));
  console.log('first:', short({ ...o, description: short(o?.description, 100) }, 2500));
  const values = {};
  for (const off of j.data || []) for (const p of off.params || []) {
    values[p.key] ??= new Set();
    values[p.key].add(`${p.value?.key ?? ''}|${p.value?.label ?? ''}`);
  }
  for (const [k, s] of Object.entries(values)) console.log(`PARAM ${k}: ${short([...s].slice(0, 12).join(' ; '), 400)}`);
  console.log('metadata:', short(j.metadata, 600), 'links:', short(j.links, 400));
  for (const f of ['filter_enum_petrol[0]=hybrid', 'filter_enum_petrol[0]=hybryda', 'filter_enum_petrol[0]=cng-hybrid', 'filter_enum_petrol[0]=hybrid-cng']) {
    const r = await fetch(`${base}&${f}&query=toyota`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const jj = await r.json().catch(() => ({}));
    console.log(`TRY ${f}: status ${r.status}, n=${jj.data?.length}, total=${jj.metadata?.total_elements}, petrol=${(jj.data || []).slice(0, 5).map((x) => x.params?.find((p) => p.key === 'petrol')?.value?.label).join(',')}`);
  }
  // сторінка OLX — варіанти фільтра палива
  const page = await fetch('https://www.olx.pl/motoryzacja/samochody/toyota/', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0' } }).then((r) => r.text());
  const m = page.match(/.{0,300}(CNG|Hybryd).{0,300}/gi) || [];
  console.log('PAGE fuel snippets:', m.slice(0, 4).map((s) => short(s, 400)).join('\n---\n'));
}

await otomoto().catch((e) => console.log('otomoto error', e.message));
await olx().catch((e) => console.log('olx error', e.message));
