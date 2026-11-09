// Найновіші надійні авто в бюджеті (2015+, автомат, до 36 тис.)
import { fetchHtml, parseSearchPage } from './otomoto.js';

const B = 'https://www.otomoto.pl/osobowe';
const Q = (path, extra = '', from = 2015) =>
  `${B}/${path}?search%5Bfilter_float_price%3Ato%5D=36000&search%5Bfilter_float_year%3Afrom%5D=${from}&search%5Bfilter_enum_gearbox%5D=automatic&search%5Bfilter_enum_damaged%5D=0&search%5Border%5D=filter_float_year%3Adesc${extra}`;
const HYB = '&search%5Bfilter_enum_fuel_type%5D=hybrid';
const CC = (a, b) => `&search%5Bfilter_float_engine_capacity%3Afrom%5D=${a}&search%5Bfilter_float_engine_capacity%3Ato%5D=${b}`;

const SEARCHES = [
  ['Auris Hybrid', Q('toyota/auris', HYB)],
  ['Prius+', Q('toyota/prius', HYB + '&search%5Bfilter_enum_body_type%5D=minivan', 2012)],
  ['Yaris Hybrid', Q('toyota/yaris', HYB, 2017)],
  ['Tipo 1.6', Q('fiat/tipo', CC(1500, 1700))],
  ['Tivoli', Q('ssangyong/tivoli', CC(1500, 1700))],
  ['XLV', Q('ssangyong/xlv', CC(1500, 1700))],
  ['Mazda 3 2.0', Q('mazda/3', CC(1900, 2100))],
  ['CX-3 2.0', Q('mazda/cx-3', CC(1900, 2100))],
  ['ix35 2.0', Q('hyundai/ix35', CC(1900, 2100), 2013)],
  ['Sportage 2.0', Q('kia/sportage', CC(1900, 2100), 2013)],
];

for (const [name, url] of SEARCHES) {
  try {
    const html = await fetchHtml(url);
    const items = parseSearchPage(html).filter((l) => l.price);
    console.log(`AD ### ${name}: ${items.length}`);
    for (const l of items.slice(0, 25)) {
      console.log(`AD [${name}] ${l.price}zł | ${l.year} | ${l.mileage}km | ${l.engine}cc | ${l.fuelLabel} | ${l.city || ''} | ${l.sellerType || ''} | orig=${l.origin || ''} | ${l.title} | ${l.url}`);
    }
  } catch (e) {
    console.log(`AD [${name}] ERR ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 2500));
}
