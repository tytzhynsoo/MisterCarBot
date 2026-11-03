// Sprzedajemy.pl: звичайний HTML без JSON, тож розбираємо розмітку.
import { parseNumber, stripHtml } from './otomoto.js';
import { vinFromText, firstRegFromText } from './vin.js';
import { BUDGET } from './config.js';

const BASE = 'https://sprzedajemy.pl';

// Пошуки: розділи моделей + текстовий пошук "hybryda/hybrid" для інших марок
export const SPRZ_SEARCHES = [
  { name: 'Sprzedajemy: Toyota Auris', path: '/motoryzacja/samochody-osobowe/toyota/auris' },
  { name: 'Sprzedajemy: Toyota Prius', path: '/motoryzacja/samochody-osobowe/toyota/prius' },
  { name: 'Sprzedajemy: Lexus', path: '/motoryzacja/samochody-osobowe/lexus' },
  { name: 'Sprzedajemy: hybryda', path: '/motoryzacja/samochody-osobowe?inp_text%5Bn%5D=hybryda' },
  { name: 'Sprzedajemy: hybrid', path: '/motoryzacja/samochody-osobowe?inp_text%5Bn%5D=hybrid' },
];
export const sprzUrl = (s) => BASE + s.path;

const text = (html) => stripHtml(html || '').replace(/\s+/g, ' ').trim();
const abs = (href) => (href.startsWith('http') ? href : BASE + href);

// Сторінка пошуку → оголошення з базовими даними (ціна, продавець, місто, фото)
export function parseSprzSearch(html) {
  const out = [];
  const parts = String(html).split('<li id="offer-').slice(1);
  for (const part of parts) {
    const id = (part.match(/^(\d+)/) || [])[1];
    const href = (part.match(/href="([^"]*nr\d+)"/) || [])[1];
    if (!id || !href) continue;
    const title = text((part.match(/<h2[^>]*class="title[^"]*"[^>]*>([\s\S]*?)<\/h2>/) || [])[1]);
    const price = parseNumber(text((part.match(/<span class="price[^"]*">([\s\S]*?)<\/span>/) || [])[1]));
    const sellerType = /seller-type-info--private/.test(part) ? 'private' : /seller-type-info--(company|business|firm)/.test(part) ? 'business' : null;
    const city = text((part.match(/<strong class="city">([\s\S]*?)<\/strong>/) || [])[1]) || null;
    const photo = (part.match(/<img src="([^"]+)"/) || [])[1] || null;
    out.push({
      id: `sprz-${id}`,
      source: 'sprzedajemy',
      url: abs(href),
      title,
      price,
      sellerType,
      city,
      photo,
      // дані про рік/пробіг/паливо є лише на сторінці оголошення.
      // Якщо ціна вже понад ліміт — сторінку не відкриваємо.
      partial: !price || price <= BUDGET.maxPrice,
      description: '',
      shortDescription: '',
    });
  }
  return out;
}

// Сторінка оголошення → повні дані
export function parseSprzDetail(html, url) {
  const attrs = {};
  for (const m of String(html).matchAll(/<li class="[^"]*item[^"]*">\s*<span>([\s\S]*?)<\/span>\s*<strong[^>]*>([\s\S]*?)<\/strong>/g)) {
    attrs[text(m[1]).toLowerCase()] = text(m[2]);
  }
  const a = (k) => attrs[k] || '';
  const price = parseNumber(text((html.match(/<strong class="price[^"]*">([\s\S]*?)<\/strong>/) || [])[1]));
  const description = stripHtml((html.match(/<div class="offerDescription">([\s\S]*?)<\/div>/) || [])[1] || '');
  const meta = (p) => (html.match(new RegExp(`<meta property="${p}" content="([^"]*)"`)) || [])[1] || null;
  const fuel = a('paliwo').toLowerCase();
  const gear = a('skrzynia biegów').toLowerCase();
  const cond = a('stan techniczny').toLowerCase();
  const seller = a('oferta od').toLowerCase();
  const id = (String(url).match(/nr(\d+)/) || [])[1];
  return {
    id: `sprz-${id}`,
    source: 'sprzedajemy',
    url,
    title: text((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]) || (meta('og:title') || ''),
    price,
    year: parseNumber(a('rok produkcji')),
    mileage: parseNumber(a('przebieg')),
    fuel: /hybryd/.test(fuel) ? `hybrid ${fuel}` : fuel,
    fuelLabel: a('paliwo'),
    gearbox: /automat/.test(gear) ? `automatic ${gear}` : /manual/.test(gear) ? `manual ${gear}` : gear,
    body: a('typ nadwozia').toLowerCase(),
    engine: parseNumber(a('pojemność silnika')),
    make: a('marka').toLowerCase() || null,
    model: a('model').toLowerCase() || null,
    damaged: /^uszkodzon/.test(cond),
    origin: a('kraj pochodzenia') || null,
    registeredPL: /^tak/i.test(a('zarejestrowany w polsce')),
    hasVin: 'vin' in attrs,
    vin: vinFromText(description),
    hasRegData: false,
    firstRegistration: firstRegFromText(description),
    sellerType: /prywat/.test(seller) ? 'private' : /firm/.test(seller) ? 'business' : null,
    city: meta('og:locality'),
    region: meta('og:region'),
    photo: meta('og:image'),
    description,
  };
}
