import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, detectKind, referencePrice } from '../src/analyze.js';

const base = (o = {}) => ({
  id: 'X1', url: 'https://www.otomoto.pl/osobowe/oferta/toyota-auris-ID6Iabc.html',
  title: 'Toyota Auris 1.8 HSD Touring Sports', price: 33000, year: 2015, mileage: 140000,
  fuel: 'hybrid hybryda', fuelLabel: 'Hybryda', gearbox: 'automatic automatyczna', body: 'combi kombi',
  engine: 1798, make: 'toyota', model: 'auris', damaged: false, description: 'Serwisowany w ASO, książka serwisowa, test baterii w ASO. Salon Polska. Auto zadbane, bezwypadkowe, gotowe do jazdy.',
  sellerType: 'private', ...o,
});

test('Auris TS у хорошому стані й нижче ринку → 🔥 HOT', () => {
  const a = analyze(base());
  assert.equal(a.kind, 'auris_ts');
  assert.equal(a.verdict, 'HOT');
});

test('Таксі в описі → не HOT', () => {
  const a = analyze(base({ description: 'Samochód po taxi, Uber, serwisowany ASO, salon polska, książka serwisowa.' }));
  assert.notEqual(a.verdict, 'HOT');
  assert.ok(a.cons.some((c) => c.includes('таксі')));
});

test('Підозріло дешево → CAUTION', () => {
  const a = analyze(base({ price: 22000 }));
  assert.equal(a.verdict, 'CAUTION');
});

test('Дорожче за бюджет → SKIP', () => {
  assert.equal(analyze(base({ price: 45000 })).verdict, 'SKIP');
});

test('Пробіг понад ліміт → SKIP', () => {
  assert.equal(analyze(base({ mileage: 260000 })).verdict, 'SKIP');
});

test('Auris 1.33 бензин → SKIP (не гібрид)', () => {
  const a = analyze(base({ title: 'Toyota Auris 1.33 Dual VVT-i', fuel: 'petrol benzyna', fuelLabel: 'Benzyna', engine: 1329, gearbox: 'manual manualna' }));
  assert.equal(a.verdict, 'SKIP');
});

test('Prius+ з газом (Otomoto пише Benzyna+LPG) — визнається гібридом', () => {
  const a = analyze(base({ title: 'Toyota Prius+ 1.8 HSD', url: 'https://www.otomoto.pl/osobowe/oferta/toyota-prius-plus-ID6Ixyz.html', fuel: 'petrol-lpg benzyna+lpg', fuelLabel: 'Benzyna+LPG', model: 'prius-plus', year: 2014, price: 38000, mileage: 160000 }));
  assert.equal(a.kind, 'prius_plus');
  assert.notEqual(a.verdict, 'SKIP');
});

test('Хетчбек Auris отримує мінус за сон', () => {
  const a = analyze(base({ title: 'Toyota Auris 1.8 HSD Luna', body: 'compact kompakt' }));
  assert.equal(a.kind, 'auris_hatch');
  assert.ok(a.cons.some((c) => c.includes('Хетчбек')));
});

test('Kia Niro → попередження про DCT, не HOT', () => {
  const a = analyze(base({ title: 'Kia Niro 1.6 GDI Hybrid', make: 'kia', model: 'niro', url: 'https://www.otomoto.pl/osobowe/oferta/kia-niro-ID6Ikia.html', body: 'suv' }));
  assert.equal(a.kind, 'other_brand_hybrid');
  assert.notEqual(a.verdict, 'HOT');
  assert.ok(a.cons.some((c) => c.includes('DCT')));
});

test('"aso" не знаходиться всередині слів', () => {
  const a = analyze(base({ description: 'Masowo produkowany model, kasowanie błędów zrobione. Auto jeździ dobrze, polecam bardzo.' }));
  assert.ok(!a.pros.some((p) => p.includes('ASO')));
});

test('Ринкова ціна враховує пробіг', () => {
  assert.equal(referencePrice('auris_ts', 2015, 150000), 39000);
  assert.ok(referencePrice('auris_ts', 2015, 220000) < 39000);
  assert.ok(referencePrice('auris_ts', 2015, 80000) > 39000);
});

test('Визначення Prius vs Prius+', () => {
  assert.equal(detectKind({ title: 'Toyota Prius 1.8 HSD', make: 'toyota', url: '' }), 'prius');
  assert.equal(detectKind({ title: 'Toyota Prius+ 1.8', make: 'toyota', url: '' }), 'prius_plus');
});

test('Під пригон / аукціон → SKIP', () => {
  assert.equal(analyze(base({ description: 'Auto pod sprowadzenie z USA, Copart lot 123. Bardzo ładne.' })).verdict, 'SKIP');
  assert.equal(analyze(base({ description: 'Samochód w drodze do Polski, dostępny od grudnia.' })).verdict, 'SKIP');
});

test('Імпорт зі США, але вже в Польщі → не SKIP, з попередженням', () => {
  const a = analyze(base({ description: 'Sprowadzony z USA w 2024, zarejestrowany w Polsce, serwis ASO. Auto zadbane i gotowe do jazdy.' }));
  assert.notEqual(a.verdict, 'SKIP');
  assert.ok(a.cons.some((c) => c.includes('США')));
  assert.ok(a.pros.some((p) => p.includes('Польщі')));
});

test('"mile widziane" не вважається США', () => {
  const a = analyze(base({ description: 'Oględziny mile widziane, serwis ASO, zarejestrowany w Polsce. Auto zadbane.' }));
  assert.ok(!a.cons.some((c) => c.includes('США')));
});

test('Хитрість з пробігом 842 → SKIP', () => {
  const a = analyze(base({ mileage: 842 }));
  assert.equal(a.verdict, 'SKIP');
  assert.ok(a.skipReasons.some((r) => r.includes('842')));
});

test('Новий Camry за копійки → SKIP', () => {
  const a = analyze(base({ title: 'Toyota Camry 2.5 Hybrid', model: 'camry', url: 'https://www.otomoto.pl/osobowe/oferta/toyota-camry-ID6Icam.html', year: 2021, price: 39000, mileage: 40000, body: 'sedan' }));
  assert.equal(a.verdict, 'SKIP');
});

test('Зареєстрована в Польщі → плюс; без інформації → мінус', () => {
  assert.ok(analyze(base({ registeredPL: true })).pros.some((p) => p.includes('польські номери')));
  assert.ok(analyze(base({ description: 'Auto zadbane, serwis ASO, książka serwisowa, polecam serdecznie wszystkim.' })).cons.some((c) => c.includes('фізично')));
});

test('"usatysfakcjonowany" не вважається США', () => {
  const a = analyze(base({ description: 'Będziesz usatysfakcjonowany, serwis ASO, zarejestrowany w Polsce. Auto zadbane.' }));
  assert.ok(!a.cons.some((c) => c.includes('США')));
});

const bmw = (o = {}) => base({
  url: 'https://www.otomoto.pl/osobowe/oferta/bmw-seria-3-ID6Ibmw.html', title: 'BMW Seria 3 320d Touring', make: 'bmw', model: 'seria-3',
  fuel: 'diesel olej napędowy', fuelLabel: 'Diesel', engine: 1995, year: 2016, mileage: 150000, price: 41000, ...o,
});

test('BMW 320d 2016 автомат → не SKIP', () => {
  const a = analyze(bmw());
  assert.equal(a.kind, 'bmw_b47');
  assert.notEqual(a.verdict, 'SKIP');
});

test('BMW понад 160 тис. км → SKIP', () => {
  assert.equal(analyze(bmw({ mileage: 165000 })).verdict, 'SKIP');
});

test('BMW 2014 (ризик N47) → SKIP', () => {
  assert.equal(analyze(bmw({ year: 2014 })).verdict, 'SKIP');
});

test('BMW бензин → SKIP', () => {
  assert.equal(analyze(bmw({ fuel: 'petrol benzyna', fuelLabel: 'Benzyna' })).verdict, 'SKIP');
});

const journey = (o = {}) => base({
  url: 'https://www.otomoto.pl/osobowe/oferta/dodge-journey-ID6Ijrn.html', title: 'Dodge Journey 3.6 V6 AWD', make: 'dodge', model: 'journey',
  fuel: 'petrol benzyna', fuelLabel: 'Benzyna', engine: 3604, year: 2012, mileage: 160000, price: 38000, ...o,
});

test('Journey 3.6 160 тис. → не SKIP', () => {
  const a = analyze(journey());
  assert.equal(a.kind, 'journey_v6');
  assert.notEqual(a.verdict, 'SKIP');
});

test('Journey 2.4 → SKIP', () => {
  assert.equal(analyze(journey({ engine: 2360, title: 'Dodge Journey 2.4' })).verdict, 'SKIP');
});

test('Journey 175 тис. км → SKIP', () => {
  assert.equal(analyze(journey({ mileage: 175000 })).verdict, 'SKIP');
});

test('Toyota 175 тис. км → SKIP (ліміт 170 тис.)', () => {
  assert.equal(analyze(base({ mileage: 175000 })).verdict, 'SKIP');
});

test('Ціна 43 500 → не SKIP за ціною', () => {
  assert.ok(!analyze(base({ price: 43500 })).skipCodes?.includes('price'));
});

import { formatMessage } from '../src/telegram.js';
test('BMW: у повідомленні питання про B47/ATF, не про батарею гібрида', () => {
  const l = bmw();
  const msg = formatMessage(l, analyze(l));
  assert.match(msg, /B47\?/);
  assert.doesNotMatch(msg, /тест батареї/);
});
