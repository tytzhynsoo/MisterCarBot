// Повні дані кількох оголошень
import { fetchHtml, extractNextData, collectParams, stripHtml } from './otomoto.js';
const URLS = ['https://www.otomoto.pl/osobowe/oferta/subaru-forester-ID6IiHAQ.html'];
for (const u of URLS) {
  try {
    const d = extractNextData(await fetchHtml(u));
    const adv = d?.props?.pageProps?.advert || {};
    const p = collectParams(adv);
    console.log(`AD ===== ${u}`);
    console.log(`AD title=${adv.title} price=${JSON.stringify(adv.price?.value ?? adv.price)} created=${adv.createdAt} photos=${adv.images?.photos?.length}`);
    console.log(`AD seller=${JSON.stringify({ type: adv.seller?.type, name: adv.seller?.name, loc: adv.seller?.location?.address })}`);
    console.log('AD params: ' + Object.entries(p).filter(([k]) => !/^(audio|comfort|electronics|performance|security|basic_information|technical_specs|condition_history|financial_information|ev_specs)$/.test(k)).map(([k, v]) => `${k}=${v.value}`).join(' | '));
    console.log('AD desc: ' + stripHtml(adv.description || '').replace(/\s+/g, ' ').slice(0, 5000));
  } catch (e) { console.log(`AD ERR ${u} ${e.message}`); }
  await new Promise((r) => setTimeout(r, 2500));
}
