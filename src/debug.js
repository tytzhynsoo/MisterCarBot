// Fiat Tipo 1.6 E.torQ з автоматом: усі оголошення до 42 тис.
import { fetchHtml, parseSearchPage, extractNextData, collectParams, stripHtml } from './otomoto.js';
const seen = new Set();
for (const fuel of ['petrol', 'petrol-lpg']) {
  for (const page of [1, 2]) {
    const p = new URLSearchParams({ 'search[filter_enum_gearbox]': 'automatic', 'search[filter_enum_fuel_type]': fuel, 'search[filter_float_price:to]': '42000', 'search[order]': 'filter_float_price:asc' });
    if (page > 1) p.set('page', '2');
    let list = [];
    try { list = parseSearchPage(await fetchHtml(`https://www.otomoto.pl/osobowe/fiat/tipo?${p}`)); } catch (e) { console.log('TIPO ERR', e.message); }
    console.log(`TIPO == ${fuel} p${page}: ${list.length}`);
    for (const l of list) {
      if (seen.has(l.id)) continue; seen.add(l.id);
      try {
        const d = extractNextData(await fetchHtml(l.url));
        const adv = d?.props?.pageProps?.advert || {};
        const pr = collectParams(adv);
        const g = (k) => pr[k]?.value ?? '';
        const desc = stripHtml(adv.description || '').replace(/\s+/g, ' ');
        console.log('TIPO ' + JSON.stringify({
          url: l.url, price: l.price, year: g('year'), km: g('mileage'), hp: g('engine_power'), cc: g('engine_capacity'),
          body: g('body_type'), fuel: g('fuel_type'), ver: g('version'), regPL: g('registered'), origin: g('country_origin'),
          noAcc: g('no_accident'), aso: g('service_record'), first: g('original_owner'), seller: adv.seller?.type, loc: adv.seller?.location?.address,
          photos: adv.images?.photos?.length, created: adv.createdAt, desc: desc.slice(0, 600),
        }));
      } catch (e) { console.log('TIPO ERR', l.url, e.message); }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (list.length < 30) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
}
