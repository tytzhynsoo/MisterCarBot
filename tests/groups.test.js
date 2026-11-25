import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analyze.js';
import { SEARCHES, buildSearchUrl } from '../src/config.js';

const desc = 'Serwisowany w ASO, książka serwisowa, salon Polska, pierwszy właściciel. Zarejestrowany w Polsce. Auto zadbane, bezwypadkowe.';

const bmw = (o = {}) => ({
  id: 'B1', group: 'bmw_b47', url: 'https://www.otomoto.pl/osobowe/oferta/bmw-seria-3-320d-touring-ID6Ibmw.html',
  title: 'BMW Seria 3 320d Touring', price: 39500, year: 2016, mileage: 140000,
  fuel: 'diesel diesel', fuelLabel: 'Diesel', gearbox: 'automatic automatyczna', body: 'combi kombi',
  engine: 1995, make: 'bmw', model: 'seria-3', damaged: false, description: desc, sellerType: 'private', ...o,
});

const journey = (o = {}) => ({
  id: 'J1', group: 'v6_awd', url: 'https://www.otomoto.pl/osobowe/oferta/fiat-freemont-3-6-awd-ID6Ifre.html',
  title: 'Fiat Freemont 3.6 V6 AWD', price: 36000, year: 2014, mileage: 170000,
  fuel: 'petrol-lpg benzyna+lpg', fuelLabel: 'Benzyna+LPG', gearbox: 'automatic automatyczna', body: 'minivan',
  engine: 3604, make: 'fiat', model: 'freemont', damaged: false, description: desc + ' Napęd AWD, instalacja LPG sekwencyjna.',
  sellerType: 'private', ...o,
});

test('BMW 320d Touring 2016, 140 тис., 39,5 тис. → не відсіюється, задній привід', () => {
  const a = analyze(bmw());
  assert.notEqual(a.verdict, 'SKIP');
  assert.equal(a.kind, 'bmw_b47');
  assert.ok(a.pros.some((p) => p.includes('ZF 8HP')));
});

test('BMW: пробіг понад 160 тис. → SKIP', () => {
  assert.equal(analyze(bmw({ mileage: 165000 })).verdict, 'SKIP');
});

test('BMW: ціна понад 43 тис. → SKIP, 42 тис. → торгуйся', () => {
  assert.equal(analyze(bmw({ price: 43500 })).verdict, 'SKIP');
  const a = analyze(bmw({ price: 42000 }));
  assert.notEqual(a.verdict, 'SKIP');
  assert.notEqual(a.verdict, 'HOT');
  assert.ok(a.cons.some((c) => c.includes('торгуйся')));
});

test('BMW 155 тис. — проходить, але з мінусом «понад бажані 150»', () => {
  const a = analyze(bmw({ mileage: 155000 }));
  assert.notEqual(a.verdict, 'SKIP');
  assert.ok(a.cons.some((c) => c.includes('бажані')));
});

test('BMW 1.5d (B37) і бензин → SKIP', () => {
  assert.equal(analyze(bmw({ engine: 1496, title: 'BMW 216d Active Tourer' })).verdict, 'SKIP');
  assert.equal(analyze(bmw({ fuel: 'petrol benzyna', fuelLabel: 'Benzyna', engine: 1998 })).verdict, 'SKIP');
});

test('BMW механіка → SKIP', () => {
  assert.equal(analyze(bmw({ gearbox: 'manual manualna' })).verdict, 'SKIP');
});

test('BMW 2015 → попередження про N47', () => {
  const a = analyze(bmw({ year: 2015 }));
  assert.ok(a.cons.some((c) => c.includes('N47')));
  assert.notEqual(a.verdict, 'HOT');
});

test('BMW 218d Gran Tourer → передній привід Aisin', () => {
  const a = analyze(bmw({ title: 'BMW Seria 2 218d Gran Tourer', model: 'seria-2', url: 'https://www.otomoto.pl/osobowe/oferta/bmw-218d-gran-tourer-ID6Igt.html', body: 'minivan' }));
  assert.ok(a.pros.some((p) => p.includes('Aisin')));
});

test('BMW 2018 за 39 тис. не відсіюється як «нереально дешево» (це правило лише для гібридів)', () => {
  assert.notEqual(analyze(bmw({ year: 2018 })).verdict, 'SKIP');
});

test('Freemont 3.6 AWD з LPG → не відсіюється', () => {
  const a = analyze(journey());
  assert.notEqual(a.verdict, 'SKIP');
  assert.equal(a.kind, 'journey_v6');
  assert.ok(a.pros.some((p) => p.includes('ГБО')));
});

test('Freemont 2.0 дизель → SKIP', () => {
  assert.equal(analyze(journey({ engine: 1956, fuel: 'diesel diesel', fuelLabel: 'Diesel', title: 'Fiat Freemont 2.0 Multijet' })).verdict, 'SKIP');
});

test('Journey лише бензин: 39 тис. + ГБО > 43 тис. → SKIP; 37 тис. → ок', () => {
  const petrol = { fuel: 'petrol benzyna', fuelLabel: 'Benzyna', description: desc + ' Napęd AWD.' };
  assert.equal(analyze(journey({ ...petrol, price: 39000 })).verdict, 'SKIP');
  const a = analyze(journey({ ...petrol, price: 37000 }));
  assert.notEqual(a.verdict, 'SKIP');
  assert.ok(a.cons.some((c) => c.includes('ГБО')));
});

test('Journey без згадки AWD → не HOT, просить перепитати', () => {
  const a = analyze(journey({ title: 'Dodge Journey 3.6', make: 'dodge', model: 'journey', description: desc + ' instalacja LPG.' }));
  assert.notEqual(a.verdict, 'HOT');
  assert.ok(a.cons.some((c) => c.includes('AWD')));
});

test('Гібриди працюють як раніше: бензинова BMW у групі гібридів → SKIP', () => {
  assert.equal(analyze(bmw({ group: undefined })).verdict, 'SKIP');
});

test('URL пошуку BMW містить ліміти групи', () => {
  const s = SEARCHES.find((x) => x.group === 'bmw_b47');
  const url = decodeURIComponent(buildSearchUrl(s));
  assert.ok(url.includes('filter_float_price:to]=43000'));
  assert.ok(url.includes('filter_float_mileage:to]=160000'));
  assert.ok(url.includes('fuel_type]=diesel'));
  const mk = decodeURIComponent(buildSearchUrl(s, { market: true }));
  assert.ok(!mk.includes('price:to'));
  assert.ok(!mk.includes('hybrid'));
});

test('URL ринку для Toyota досі фільтрує гібриди', () => {
  const s = SEARCHES.find((x) => x.path === 'toyota/auris');
  assert.ok(decodeURIComponent(buildSearchUrl(s, { market: true })).includes('fuel_type]=hybrid'));
});
