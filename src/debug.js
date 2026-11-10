import { fetchHtml, parseSearchPage } from './otomoto.js';
const B = 'https://www.otomoto.pl/osobowe';
const Q = (path, extra = '') =>
  `${B}/${path}?search%5Bfilter_float_price%3Ato%5D=36000&search%5Bfilter_enum_fuel_type%5D=hybrid&search%5Bfilter_enum_damaged%5D=0&search%5Border%5D=filter_float_year%3Adesc${extra}`;
const SEARCHES = [
  ['auris-hybrid', Q('toyota/auris')],
  ['auris-hybrid-p2', Q('toyota/auris','&page=2')],
  ['prius', Q('toyota/prius')],
];
for (const [name, url] of SEARCHES) {
  try {
    const html = await fetchHtml(url);
    const ads = parseSearchPage(html);
    console.log(`AD ### ${name}: ${ads.length}`);
    for (const a of ads) console.log(`AD [${name}] ${a.price} | ${a.year} | ${a.mileage} | ${a.engine||''} | ${a.fuel||''} | ${a.city||a.location||''} | ${a.seller||''} | ${a.title} | ${a.url}`);
  } catch (e) { console.log(`AD ERR ${name} ${e.message}`); }
}
