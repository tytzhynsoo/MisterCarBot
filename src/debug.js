// Діагностика доступу до OLX
import { buildOlxUrl } from './config.js';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const H1 = { 'User-Agent': UA, 'Accept-Language': 'pl-PL,pl;q=0.9', Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Upgrade-Insecure-Requests': '1' };
const H2 = { 'User-Agent': UA, 'Accept-Language': 'pl-PL,pl;q=0.9', Accept: 'application/json, text/plain, */*', Referer: 'https://www.olx.pl/' };
const plain = 'https://www.olx.pl/api/v1/offers/?offset=0&limit=50&category_id=84';
const filtered = buildOlxUrl(0);
const raw = filtered.replace(/%5B/g, '[').replace(/%5D/g, ']').replace(/%3A/g, ':');
const cases = [['H1 plain', plain, H1], ['H2 plain', plain, H2], ['H1 filtered', filtered, H1], ['H2 filtered', filtered, H2], ['H1 raw', raw, H1], ['H1 petrol only', plain + '&filter_enum_petrol[0]=cng', H1]];
for (const [name, u, h] of cases) {
  const r = await fetch(u, { headers: h });
  const t = await r.text();
  let info = '';
  if (r.status === 200) { try { const j = JSON.parse(t); info = `n=${j.data?.length} petrol=${(j.data || []).slice(0, 8).map((o) => o.params?.find((p) => p.key === 'petrol')?.value?.key).join(',')} prices=${(j.data || []).slice(0, 5).map((o) => o.params?.find((p) => p.key === 'price')?.value?.value).join(',')} titles=${(j.data || []).slice(0, 4).map((o) => o.title).join(' | ')}`; } catch { info = 'not json'; } }
  console.log(`${name}: ${r.status} ${info}`);
  await new Promise((res) => setTimeout(res, 3000));
}
console.log('URL', filtered);
