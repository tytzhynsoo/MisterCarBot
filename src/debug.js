// Повні дані одного оголошення
import { fetchHtml, extractNextData, collectParams, stripHtml } from './otomoto.js';
const u = 'https://www.otomoto.pl/osobowe/oferta/toyota-prius-ID6IiW2y.html';
const d = extractNextData(await fetchHtml(u));
const adv = d?.props?.pageProps?.advert || {};
const p = collectParams(adv);
console.log(`AD title=${adv.title} price=${JSON.stringify(adv.price)} status=${adv.status} created=${adv.createdAt} updated=${adv.updatedAt} photos=${adv.images?.photos?.length}`);
console.log(`AD seller=${JSON.stringify({ type: adv.seller?.type, name: adv.seller?.name, loc: adv.seller?.location?.address, badges: (adv.seller?.featuresBadges || []).map((b) => b.label) })}`);
console.log('AD params: ' + Object.entries(p).filter(([k]) => !/^(audio|comfort|electronics|performance|security|basic_information|technical_specs|condition_history|financial_information|ev_specs)$/.test(k)).map(([k, v]) => `${k}=${v.value}`).join(' | '));
console.log('AD priceDrop: ' + JSON.stringify(adv.priceDrop) + ' ' + JSON.stringify(adv.advertPriceForPriceDrop));
console.log('AD desc: ' + stripHtml(adv.description || '').replace(/\s+/g, ' '));
