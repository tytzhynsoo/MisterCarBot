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

// ---- Sprzedajemy.pl ----
const sUrls = [
  'https://sprzedajemy.pl/motoryzacja/samochody-osobowe/toyota/prius',
  'https://sprzedajemy.pl/motoryzacja/samochody-osobowe/toyota/auris?inp_price%5Bto%5D=42000',
];
for (const u of sUrls) {
  const r = await fetch(u, { headers: H1 });
  const t = await r.text();
  console.log(`SPRZ ${u} -> ${r.status} len ${t.length}`);
  if (r.status !== 200) { console.log('SPRZ body', t.slice(0, 300).replace(/\s+/g, ' ')); continue; }
  const links = [...new Set(t.match(/https?:\/\/sprzedajemy\.pl\/[a-z0-9-]+-nr\d+/g) || t.match(/href="(\/[^"]*nr\d+)"/g) || [])];
  console.log('SPRZ links', links.length, links.slice(0, 5).join(' '));
  console.log('SPRZ jsonld', (t.match(/application\/ld\+json[^>]*>([\s\S]{0,800})/) || [])[1]?.replace(/\s+/g, ' '));
  const i = t.indexOf('offer-list-item') >= 0 ? t.indexOf('offer-list-item') : t.indexOf('<article');
  console.log('SPRZ item html:', t.slice(i, i + 2500).replace(/\s+/g, ' '));
  if (links[0]) {
    const lu = links[0].startsWith('http') ? links[0] : 'https://sprzedajemy.pl' + links[0].replace(/^href="|"$/g, '');
    const rr = await fetch(lu, { headers: H1 });
    const tt = await rr.text();
    console.log(`SPRZ detail ${lu} -> ${rr.status}`);
    const k = tt.indexOf('Rok produkcji');
    console.log('SPRZ detail params:', tt.slice(Math.max(0, k - 1500), k + 2500).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  }
  await new Promise((res) => setTimeout(res, 3000));
}
