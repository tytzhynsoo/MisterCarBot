// Ринок альтернатив: ціни за роками (автомат, до 230 тис. км)
import { fetchHtml, parseSearchPage } from './otomoto.js';
const Q = [
  ['Kia Ceed авт. бензин', 'kia/ceed', { 'search[filter_enum_gearbox]': 'automatic', 'search[filter_enum_fuel_type]': 'petrol' }],
  ['Hyundai i30 авт. бензин', 'hyundai/i30', { 'search[filter_enum_gearbox]': 'automatic', 'search[filter_enum_fuel_type]': 'petrol' }],
  ['Skoda Octavia авт. бензин', 'skoda/octavia', { 'search[filter_enum_gearbox]': 'automatic', 'search[filter_enum_fuel_type]': 'petrol' }],
  ['Honda Civic авт. бензин', 'honda/civic', { 'search[filter_enum_gearbox]': 'automatic', 'search[filter_enum_fuel_type]': 'petrol' }],
  ['Honda Accord авт. бензин', 'honda/accord', { 'search[filter_enum_gearbox]': 'automatic', 'search[filter_enum_fuel_type]': 'petrol' }],
  ['Honda Jazz гібрид', 'honda/jazz', { 'search[filter_enum_fuel_type]': 'hybrid' }],
  ['Mazda 6 авт. бензин', 'mazda/6', { 'search[filter_enum_gearbox]': 'automatic', 'search[filter_enum_fuel_type]': 'petrol' }],
  ['Mazda 3 авт. бензин', 'mazda/3', { 'search[filter_enum_gearbox]': 'automatic', 'search[filter_enum_fuel_type]': 'petrol' }],
  ['Kia Niro гібрид', 'kia/niro', { 'search[filter_enum_fuel_type]': 'hybrid' }],
  ['Hyundai Ioniq гібрид', 'hyundai/ioniq', { 'search[filter_enum_fuel_type]': 'hybrid' }],
  ['Ford Mondeo гібрид', 'ford/mondeo', { 'search[filter_enum_fuel_type]': 'hybrid' }],
  ['Kia Venga авт.', 'kia/venga', { 'search[filter_enum_gearbox]': 'automatic' }],
  ['Hyundai ix20 авт.', 'hyundai/ix20', { 'search[filter_enum_gearbox]': 'automatic' }],
  ['Toyota Corolla гібрид', 'toyota/corolla', { 'search[filter_enum_fuel_type]': 'hybrid' }],
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
  console.log(`MKT ${name}: найдешевші ${all.length} огол., ≤35k: ${cheap}\nMKT   ${rows.join('\nMKT   ')}`);
}
