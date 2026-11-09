// Пошук найкращих кандидатів під вимоги Олександра
import { fetchHtml, parseSearchPage } from './otomoto.js';

const B = 'https://www.otomoto.pl/osobowe';
const Q = (path, extra = '') =>
  `${B}/${path}?search%5Bfilter_float_price%3Ato%5D=35500&search%5Bfilter_enum_gearbox%5D=automatic&search%5Bfilter_enum_damaged%5D=0&search%5Border%5D=created_at_first%3Adesc${extra}`;

const SEARCHES = [
  ['Auris TS Hybrid', Q('toyota/auris/seg-combi', '&search%5Bfilter_enum_fuel_type%5D=hybrid')],
  ['Prius+', Q('toyota/prius-plus')],
  ['Journey 3.6', Q('dodge/journey', '&search%5Bfilter_float_engine_capacity%3Afrom%5D=3500')],
  ['Freemont 3.6', Q('fiat/freemont', '&search%5Bfilter_float_engine_capacity%3Afrom%5D=3500')],
  ['V70 3.2', Q('volvo/v70', '&search%5Bfilter_float_engine_capacity%3Afrom%5D=3100&search%5Bfilter_float_engine_capacity%3Ato%5D=3300')],
  ['XC70 3.2', Q('volvo/xc-70', '&search%5Bfilter_float_engine_capacity%3Afrom%5D=3100&search%5Bfilter_float_engine_capacity%3Ato%5D=3300')],
];

for (const [name, url] of SEARCHES) {
  for (const page of [1, 2]) {
    try {
      const html = await fetchHtml(page === 1 ? url : `${url}&page=${page}`);
      const items = parseSearchPage(html);
      if (!items.length) break;
      for (const l of items) {
        console.log(`AD [${name}] ${l.price ?? '?'}zł | ${l.year} | ${l.mileage}km | ${l.engine}cc | ${l.fuelLabel} | ${l.city || ''} ${l.region || ''} | ${l.sellerType || ''} | orig=${l.origin || ''} | ${l.title} | ${l.url}`);
      }
      if (items.length < 20) break;
    } catch (e) {
      console.log(`AD [${name}] ERR ${e.message}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
}
