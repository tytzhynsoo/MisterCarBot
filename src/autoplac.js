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

// ---------- детальна сторінка ----------
const plain = (html) => String(html)
  .replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;| /g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ');
const num = (s) => (s ? Number(String(s).replace(/\s/g, '')) || null : null);
const plDate = (s) => {
  const m = String(s || '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

export function parseAutoplacDetail(html, url) {
  let car = null;
  for (const m of String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const d = JSON.parse(m[1]); if (d?.['@type'] === 'Car') car = d; } catch { /* інший блок */ }
  }
  const t = plain(html);
  const after = (label, re) => (t.match(new RegExp(`${label}\\s+${re}`)) || [])[1] || null;
  const tak = (label) => new RegExp(`${label}\\s+Tak`).test(t);

  // Історія CEPiK (сайт сам підтягує, якщо продавець вказав VIN, номер і дату)
  const readings = [...t.matchAll(/Odczytany stan drogomierza:\s*([\d ]+?)\s*km\s+(\d{2}\.\d{2}\.\d{4})/g)]
    .map((m) => ({ km: num(m[1]), date: plDate(m[2]) }));
  const hasCepik = /Historia pojazdu CEPiK/.test(t) || /zweryfikowany w CEPiK/.test(t);
  const cepik = hasCepik ? {
    verified: /VIN zweryfikowany w CEPiK/.test(t),
    mileageConsistent: /Przebieg zgodny z historią przeglądów/.test(t) ? true
      : /Przebieg niezgodny|niezgodn\w* z historią/.test(t) ? false : null,
    lastReading: num(after('Ostatni odczyt:', '([\\d ]+?)\\s*km')),
    foreignFirstReg: plDate(after('Pierwsza rejestracja za granicą', '(\\d{2}\\.\\d{2}\\.\\d{4})')),
    // у хронології дата стоїть ПЕРЕД подією: "23.11.2026 Pierwsza rejestracja w Polsce" або після
    plFirstReg: plDate((t.match(/Pierwsza rejestracja w Polsce\s+(\d{2}\.\d{2}\.\d{4})/) || [])[1]),
    readings,
  } : null;

  const opis = (t.match(/Opis\s+(#[\s\S]*?)(?:Czytaj więcej|Pokaż (?:więcej|pełne wyposażenie)|Wyposażenie\s)/) || [])[1] || '';
  const offer = car?.offers || {};
  const addr = offer.availableAtOrFrom?.address || {};
  const id = autoplacId(url) || (car?.sku ? `ap-${car.sku}` : null);
  const tr = String(car?.vehicleTransmission || '').toUpperCase();
  return {
    id,
    source: 'autoplac',
    url,
    title: car?.name || '',
    price: Number(offer.price) || null,
    year: Number(car?.vehicleModelDate) || null,
    mileage: Number(car?.mileageFromOdometer?.value) || null,
    fuel: FUEL[car?.fuelType] || '',
    fuelLabel: car?.fuelType === 'HYBRID' ? 'Hybryda' : car?.fuelType || '',
    gearbox: tr === 'AUTOMATIC' ? 'automatic automat' : tr === 'MANUAL' ? 'manual manualna' : '',
    body: BODY[car?.bodyType] || String(car?.bodyType || '').toLowerCase(),
    engine: Number(car?.vehicleEngine?.engineDisplacement?.value) || null,
    drive: car?.driveWheelConfiguration || null,
    make: String(car?.brand?.name || '').toLowerCase() || null,
    model: String(car?.model || '').toLowerCase() || null,
    vin: car?.vehicleIdentificationNumber || null,
    hasVin: !!car?.vehicleIdentificationNumber,
    plate: after('Numer rejestracyjny', '([A-Z]{1,3}[0-9A-Z]{4,5})'),
    firstRegistration: car?.dateVehicleFirstRegistered || plDate(after('Data pierwszej rejestracji', '(\\d{2}\\.\\d{2}\\.\\d{4})')),
    hasRegData: true,
    registeredPL: tak('Zarejestrowany w Polsce'),
    damaged: tak('Uszkodzony'),
    noAccident: tak('Bezwypadkowy'),
    city: addr.addressLocality || null,
    region: addr.addressRegion || null,
    photo: Array.isArray(car?.image) ? car.image[0] : car?.image || null,
    description: opis.replace(/\*\*/g, '').trim(),
    cepik,
  };
}
