// Autoplac.pl: сайт на Angular. Список оголошень на сторінці пошуку
// лежить у JSON-LD (<script type="application/ld+json">, тип CollectionPage).
import { BUDGET } from './config.js';

const BASE = 'https://autoplac.pl';

// Пошуки. Ліміт ціни — у самій адресі (cena-do-43-tysiecy).
export const AUTOPLAC_SEARCHES = [
  { name: 'Autoplac: Toyota', path: '/oferty/samochody-osobowe/toyota/cena-do-43-tysiecy/benzynowe?fuelTypes=GASOLINE,HYBRID,LPG' },
];
export const autoplacUrl = (s) => BASE + s.path;

const FUEL = { GASOLINE: 'petrol benzyna', HYBRID: 'hybrid hybryda', DIESEL: 'diesel olej napędowy', LPG: 'petrol-lpg benzyna+lpg' };
const BODY = { KOMBI: 'combi kombi', HATCHBACK: 'hatchback', MINIVAN: 'minivan', SEDAN: 'sedan', SUV: 'suv' };

// ID оголошення — хвіст адреси: ...-4625-8312-YT
export const autoplacId = (url) => {
  const m = String(url).match(/-(\d{4}-\d{4}-[A-Z]{2})(?:[/?#]|$)/);
  return m ? `ap-${m[1]}` : null;
};

export function parseAutoplacSearch(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let d;
    try { d = JSON.parse(m[1]); } catch { continue; }
    if (d?.['@type'] !== 'CollectionPage') continue;
    for (const el of d.mainEntity?.itemListElement || []) {
      const it = el.item || {};
      const path = el.url || it.offers?.url;
      const id = autoplacId(path);
      if (!id) continue;
      const price = Number(it.offers?.priceSpecification?.price) || null;
      const name = String(it.name || '').trim();
      out.push({
        id,
        source: 'autoplac',
        url: path.startsWith('http') ? path : BASE + path,
        title: name,
        price,
        year: Number(it.modelDate) || null,
        mileage: Number(it.mileageFromOdometer?.value) || null,
        fuel: FUEL[it.fuelType] || String(it.fuelType || '').toLowerCase(),
        fuelLabel: it.fuelType === 'HYBRID' ? 'Hybryda' : it.fuelType || '',
        body: BODY[it.bodyType] || String(it.bodyType || '').toLowerCase(),
        make: String(it.brand || '').toLowerCase() || null,
        model: name.split(/\s+/).slice(1).join(' ').toLowerCase() || null,
        gearbox: '',
        photo: it.image || null,
        description: '',
        // коробки й продавця в списку немає. Детальну сторінку ще не розбираємо,
        // тож оголошення оцінюється з того, що є (без коробки).
        partial: false,
        overBudget: !!price && price > BUDGET.maxPrice,
      });
    }
  }
  return out;
}
