// Ринок альтернатив: ціни за роками (автомат, до 230 тис. км)
import { fetchHtml, parseSearchPage } from './otomoto.js';
const A = { 'search[filter_enum_gearbox]': 'automatic', 'search[filter_enum_fuel_type]': 'petrol' };
const Q = [
  ['Kia Ceed SW авт.', 'kia/ceed', { ...A, 'search[filter_enum_body_type]': 'combi' }],
  ['Hyundai i30 kombi авт.', 'hyundai/i30', { ...A, 'search[filter_enum_body_type]': 'combi' }],
  ['Kia Carens авт.', 'kia/carens', A],
  ['Kia Sportage авт. бензин', 'kia/sportage', A],
  ['Hyundai ix35 авт. бензин', 'hyundai/ix35', A],
  ['Hyundai Tucson авт. бензин', 'hyundai/tucson', A],
  ['Kia Soul авт.', 'kia/soul', A],
  ['Hyundai i40 kombi авт.', 'hyundai/i40', { ...A, 'search[filter_enum_body_type]': 'combi' }],
];
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
for (const [name, path, extra] of Q) {
  const all = [];
  for (const page of [1, 2, 3]) {
    const p = new URLSearchParams({ 'search[filter_float_year:from]': '2011', 'search[filter_float_mileage:to]': '230000', 'search[order]': 'filter_float_price:asc', ...extra });
    if (page > 1) p.set('page', String(page));
    try {
      const l = parseSearchPage(await fetchHtml(`https://www.otomoto.pl/osobowe/${path}?${p}`));
      all.push(...l.filter((x) => x.price && x.year));
      if (l.length < 30) break;
    } catch (e) { console.log('MKT ERR', name, e.message); break; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  const byYear = {};
  for (const l of all) (byYear[l.year] ??= []).push(l);
  const rows = Object.entries(byYear).sort().map(([y, ls]) => `${y}: n=${ls.length} min=${Math.min(...ls.map((x) => x.price))} med=${med(ls.map((x) => x.price))} km~${med(ls.map((x) => x.mileage || 0))} eng=${[...new Set(ls.map((x) => x.engine))].slice(0, 4).join('/')}`);
  const cheap = all.filter((x) => x.price <= 35000).length;
  for (const l of all.filter((x) => x.price <= 36000).slice(0, 6)) console.log(`MKT   · ${l.year} ${l.engine}cc ${l.mileage}km ${l.price}zł ${l.title}`);
  console.log(`MKT ${name}: найдешевші ${all.length} огол., ≤35k: ${cheap}\nMKT   ${rows.join('\nMKT   ')}`);
}
