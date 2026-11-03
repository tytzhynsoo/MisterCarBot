// Повні дані конкретних оголошень (для ручного розбору)
import { fetchHtml, extractNextData, collectParams, parseDetailPage } from './otomoto.js';
const urls = [
  'https://www.otomoto.pl/osobowe/oferta/toyota-prius-ID6Ij2OY.html',
  'https://www.otomoto.pl/osobowe/oferta/toyota-prius-OLX_ID6IhOnE.html',
  'https://www.otomoto.pl/osobowe/oferta/toyota-prius-ID6IiTaT.html',
  'https://www.otomoto.pl/osobowe/oferta/toyota-prius-ID6Iizqx.html',
  'https://www.otomoto.pl/osobowe/oferta/toyota-prius-ID6HOLbQ.html',
  'https://www.otomoto.pl/osobowe/oferta/toyota-prius-plus-OLX_ID6IgNc8.html',
];
for (const u of urls) {
  try {
    const html = await fetchHtml(u);
    const d = extractNextData(html);
    const adv = d?.props?.pageProps?.advert || {};
    const p = collectParams(adv);
    const l = parseDetailPage(html, u);
    console.log(`\nAD ${u}\nAD status=${adv.status} created=${adv.createdAt} photos=${adv.images?.photos?.length} seller=${adv.seller?.type}/${adv.seller?.name} loc=${adv.seller?.location?.address}`);
    console.log('AD params: ' + Object.entries(p).filter(([k]) => !/^(audio|comfort|electronics|performance|security|bluetooth|radio|hands|navigation|sound|touch|air_|uphol|heated|lumbar|armrest|leather|steering|multi|digital|keyless|rain|power_|cruise|rear_view|door_|speed|traction|daytime|fog|tyre|antilock|esp|collision|driver_|passenger_|head_|side_|child|alloy|catalog|version_label|approval)/.test(k)).map(([k, v]) => `${k}=${v.value}`).join(', '));
    console.log('AD desc: ' + (l?.description || '').replace(/\s+/g, ' '));
  } catch (e) { console.log('AD ERR', u, e.message); }
  await new Promise((r) => setTimeout(r, 2500));
}
