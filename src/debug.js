// Діагностика Sprzedajemy.pl
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const H1 = { 'User-Agent': UA, 'Accept-Language': 'pl-PL,pl;q=0.9', Accept: 'text/html,application/xhtml+xml' };
const sq = (s) => s.replace(/\s+/g, ' ');
const u = 'https://sprzedajemy.pl/motoryzacja/samochody-osobowe/toyota/prius';
const t = await (await fetch(u, { headers: H1 })).text();
const a = t.indexOf('<li id="offer-');
const b = t.indexOf('<li id="offer-', a + 20);
console.log('ITEM:', sq(t.slice(a, b)));
const names = [...new Set((t.match(/name="[^"]+"/g) || []))];
console.log('NAMES:', names.join(' '));
const sel = t.match(/<select[^>]*>[\s\S]{0,600}/g) || [];
console.log('SELECTS:', sel.slice(0, 8).map((s) => sq(s).slice(0, 400)).join('\n'));
const filt = [...new Set(t.match(/[?&](inp_[^"'&\s]+|items_per_page[^"&]*|sort[^"&]*)/g) || [])];
console.log('URLPARAMS:', filt.slice(0, 40).join(' '));
const pg = t.match(/href="[^"]*(?:offset|page)=[^"]*"/g) || [];
console.log('PAGING:', pg.slice(0, 3).join(' '));
const link = t.match(/href="(\/[^"]*nr\d+)"/)[1];
const d = await (await fetch('https://sprzedajemy.pl' + link, { headers: H1 })).text();
for (const key of ['class="price', 'offerDescription', 'description', 'Oferta od', 'og:image', 'class="locationName', 'location', 'Lokalizacja', 'Cena']) {
  const i = d.indexOf(key);
  console.log(`DETAIL[${key}] @${i}:`, i >= 0 ? sq(d.slice(Math.max(0, i - 200), i + 900)) : '-');
}
console.log('DETAIL ldjson:', (d.match(/application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g) || []).map((x) => sq(x).slice(0, 1500)).join('\n'));
// фільтри в URL: пробуємо кілька варіантів і дивимось, чи міняється кількість
for (const q of ['', '?inp_price%5Bto%5D=20000', '?inp_price[to]=20000', '?inp_attribute_249%5Bfrom%5D=2014']) {
  const tt = await (await fetch(u + q, { headers: H1 })).text();
  const cnt = (tt.match(/Wyniki:\s*[\d\s–-]+z?\s*[\d\s]*/) || tt.match(/(\d[\d\s]*)\s*ogłosze/) || [''])[0];
  const prices = (tt.match(/class="price">[^<]*/g) || []).slice(0, 6).join(' | ');
  console.log(`Q ${q}: ${sq(cnt)} :: ${sq(prices)}`);
  await new Promise((r) => setTimeout(r, 2000));
}
