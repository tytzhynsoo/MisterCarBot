// Діагностика: показує, які дані реально віддають Otomoto та OLX.
import { fetchHtml, extractNextData, collectParams, parseSearchPage } from './otomoto.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const H = { 'User-Agent': UA, 'Accept-Language': 'pl-PL,pl;q=0.9', Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' };
const short = (v, n = 300) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + '…' : s;
};
function findKeys(root, re, out = [], path = '', depth = 0, seen = new Set()) {
  if (!root || typeof root !== 'object' || depth > 40 || seen.has(root)) return out;
  seen.add(root);
  for (const [k, v] of Object.entries(root)) {
    const p = `${path}.${k}`;
    if (re.test(k) && out.length < 40) out.push(`${p} = ${short(v, 200)}`);
    if (typeof v === 'string' && v.length > 50 && (v.startsWith('{"') || v.startsWith('[{'))) {
      try { findKeys(JSON.parse(v), re, out, p + '(json)', depth + 1, seen); } catch {}
    } else if (v && typeof v === 'object') findKeys(v, re, out, p, depth + 1, seen);
  }
  return out;
}

async function otomoto() {
  const html = await fetchHtml('https://www.otomoto.pl/osobowe/toyota/auris?search%5Bfilter_float_price%3Ato%5D=42000&search%5Border%5D=created_at_first%3Adesc');
  const list = parseSearchPage(html).slice(0, 6);
  for (const [i, l] of list.entries()) {
    const d = extractNextData(await fetchHtml(l.url));
    const adv = d?.props?.pageProps?.advert || {};
    const p = collectParams(adv);
    const pick = Object.entries(p).filter(([k]) => /vin|regist|rejestr|plate|date/.test(k)).map(([k, v]) => `${k}=${v.value}`);
    console.log(`#${i} ${l.url}\n  params: ${pick.join(', ')}\n  seller: ${short(adv.seller, 300)}\n  advert keys: ${Object.keys(adv).join(',')}`);
    if (i === 0) {
      const vh = d?.props?.pageProps?.carsConditionWidget?.vehicleHistory?.props || {};
      const { advert, ...rest } = vh;
      console.log('  vehicleHistory props:', short(rest, 1500));
      console.log('  photos[0]:', short(adv.images?.photos?.[0], 300));
      console.log('  vin-ish:', findKeys(d.props.pageProps, /vin|plate|firstRegistration|registrationDate|licen/i).filter((s) => !/featureFlags|cookie/.test(s)).slice(0, 15).join('\n   '));
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function olx() {
  const urls = [
    'https://www.olx.pl/api/v1/offers/?offset=0&limit=5&category_id=84&query=toyota%20prius',
    'https://www.olx.pl/motoryzacja/samochody/toyota/prius/',
  ];
  for (const u of urls) {
    const r = await fetch(u, { headers: { ...H, Referer: 'https://www.olx.pl/' } });
    const t = await r.text();
    console.log(`OLX ${u} -> ${r.status}, len ${t.length}, prerendered=${t.includes('__PRERENDERED_STATE__')}, nextdata=${t.includes('__NEXT_DATA__')}`);
    if (r.status !== 200) { console.log(short(t, 300)); continue; }
    if (u.includes('/api/')) { const j = JSON.parse(t); console.log(short(j.data?.[0], 2500)); continue; }
    const m = t.match(/window\.__PRERENDERED_STATE__\s*=\s*("(?:[^"\\]|\\.)*")/);
    if (m) {
      const state = JSON.parse(JSON.parse(m[1]));
      console.log('state keys:', Object.keys(state).join(','));
      const ads = state.listing?.listing?.ads || [];
      console.log('ads:', ads.length);
      if (ads[0]) console.log('ad0:', short({ ...ads[0], description: short(ads[0].description, 80) }, 3000));
      console.log('petrol filter:', findKeys(state, /petrol/i).slice(0, 10).join('\n'));
    }
    const fuel = t.match(/.{0,200}(CNG i hybryd|Hybryda|hybrid).{0,200}/gi) || [];
    console.log('fuel snippets:', fuel.slice(0, 3).map((s) => short(s, 400)).join('\n---\n'));
  }
  // спроба з фільтром
  for (const f of ['hybrid', 'cng-and-hybrid', 'hybryda', 'cng']) {
    const u = `https://www.olx.pl/motoryzacja/samochody/toyota/?search%5Bfilter_enum_petrol%5D%5B0%5D=${f}`;
    const r = await fetch(u, { headers: H });
    const t = await r.text();
    const m = t.match(/window\.__PRERENDERED_STATE__\s*=\s*("(?:[^"\\]|\\.)*")/);
    let n = '?', petrols = '';
    if (m) {
      const st = JSON.parse(JSON.parse(m[1]));
      const ads = st.listing?.listing?.ads || [];
      n = `${ads.length} total=${st.listing?.listing?.totalElements}`;
      petrols = ads.slice(0, 6).map((a) => a.params?.find((p) => p.key === 'petrol')?.normalizedValue || a.params?.find((p) => p.key === 'petrol')?.value).join(',');
    }
    console.log(`FILTER ${f}: ${r.status} ads=${n} petrol=${petrols}`);
  }
}

await otomoto().catch((e) => console.log('otomoto error', e.message));
await olx().catch((e) => console.log('olx error', e.stack));
