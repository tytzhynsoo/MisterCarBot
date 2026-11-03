// Конкретні i30 CW / Ceed SW з автоматом: потужність, коробка, газ
import { fetchHtml, parseSearchPage, extractNextData, collectParams } from './otomoto.js';
const base = { 'search[filter_enum_gearbox]': 'automatic', 'search[filter_float_year:from]': '2012', 'search[filter_float_year:to]': '2018', 'search[filter_float_price:to]': '42000', 'search[filter_enum_body_type]': 'combi' };
const Q = [];
for (const m of ['hyundai/i30', 'kia/ceed']) for (const f of ['petrol', 'petrol-lpg']) Q.push([m, f]);
const seen = new Set();
for (const [path, fuel] of Q) {
  const p = new URLSearchParams({ ...base, 'search[filter_enum_fuel_type]': fuel });
  let list = [];
  try { list = parseSearchPage(await fetchHtml(`https://www.otomoto.pl/osobowe/${path}?${p}`)); } catch (e) { console.log('CAR ERR', path, fuel, e.message); }
  console.log(`CAR == ${path} ${fuel}: ${list.length}`);
  for (const l of list.slice(0, 20)) {
    if (seen.has(l.id)) continue; seen.add(l.id);
    try {
      const d = extractNextData(await fetchHtml(l.url));
      const adv = d?.props?.pageProps?.advert || {};
      const pr = collectParams(adv);
      const g = (k) => pr[k]?.value ?? '';
      const desc = String(adv.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const dct = /dct|dwusprzęg|dwusprzeg|7.?biegow|7.?st/i.test(`${l.title} ${g('version')} ${desc}`);
      console.log(`CAR ${g('year')} | ${g('engine_power')} | ${g('fuel_type')} | ${g('version')} | ${l.price}zł | ${g('mileage')} | DCT?${dct} | ${adv.seller?.type} ${adv.seller?.location?.address || ''} | ${l.url}`);
    } catch (e) { console.log('CAR ERR', l.url, e.message); }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
