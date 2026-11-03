import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanVin, vinFromText, isNorthAmericanVin } from '../src/vin.js';
import { purchaseCost } from '../src/costs.js';
import { addSamples, livePrice } from '../src/market.js';
import { parseOlxResponse } from '../src/olx.js';
import { analyze } from '../src/analyze.js';
import { formatMessage } from '../src/telegram.js';
import { fingerprint } from '../src/index.js';
import { localNow, reportsDue, dailyReport, weeklyReport, dayStats } from '../src/reports.js';
import { emptyState, getSeen } from '../src/state.js';

const car = (o = {}) => ({
  id: '1', url: 'https://www.otomoto.pl/osobowe/oferta/toyota-auris-ID6Iabc.html', source: 'otomoto',
  title: 'Toyota Auris 1.8 HSD Touring Sports', price: 33000, year: 2015, mileage: 140000,
  fuel: 'hybrid hybryda', fuelLabel: 'Hybryda', gearbox: 'automatic automatyczna', body: 'combi kombi',
  engine: 1798, make: 'toyota', model: 'auris', damaged: false, registeredPL: true,
  description: 'Serwisowany w ASO, książka serwisowa, test baterii. Salon Polska. Auto zadbane, bezwypadkowe, gotowe do jazdy.',
  sellerType: 'PRIVATE', ...o,
});

test('VIN: справжній приймається, фейковий — ні', () => {
  assert.equal(cleanVin('sb1zs3je50e055807'), 'SB1ZS3JE50E055807');
  assert.equal(cleanVin('12345678901234567'), null);
  assert.equal(cleanVin('xxxxxxxxxxxxxxxxx'), null);
  assert.equal(vinFromText('VIN: JTDKN3DU5A0123456 zapraszam'), 'JTDKN3DU5A0123456');
  assert.ok(isNorthAmericanVin('1NXBR32E85Z123456'));
  assert.ok(!isNorthAmericanVin('JTDKN3DU5A0123456'));
});

test('Повна сума: приватна особа з PCC, фірма без', () => {
  const p = purchaseCost({ price: 33000, sellerType: 'PRIVATE' });
  assert.equal(p.pcc, 660);
  assert.equal(p.total, 33000 + 660 + 180 + 900 + 400 + 1500 + 1000);
  assert.ok(p.over < 0);
  const b = purchaseCost({ price: 33000, sellerType: 'PROFESSIONAL' });
  assert.equal(b.pcc, 0);
  assert.equal(purchaseCost({ price: 37000 }).seller, 'unknown');
  assert.ok(purchaseCost({ price: 37000 }).over > 0);
});

test('Дорога машина понад бюджет "під ключ" → не HOT, порада торгуватися', () => {
  const a = analyze(car({ price: 37500 }));
  assert.notEqual(a.verdict, 'HOT');
  assert.ok(a.cons.some((c) => c.includes('Торгуйся до')));
});

test('Жива ціна: медіана з поправкою на пробіг', () => {
  const m = {};
  addSamples(m, [30000, 31000, 32000, 33000, 34000].map((p, i) => ({ id: 'a' + i, key: 'auris_ts', year: 2015, mileage: 150000, price: p })));
  const lp = livePrice(m, 'auris_ts', 2015, 150000);
  assert.equal(lp.price, 32000);
  assert.equal(lp.n, 5);
  assert.ok(livePrice(m, 'auris_ts', 2015, 100000).price > 32000);
  assert.equal(livePrice(m, 'prius', 2015, 150000), null);
});

test('Аналіз показує і таблицю, і живу ціну', () => {
  const a = analyze(car(), { live: { price: 36000, n: 8, exactYear: true } });
  assert.ok(a.ref);
  assert.equal(a.live.price, 36000);
  assert.equal(a.basis, 36000);
  const msg = formatMessage(car(), a);
  assert.match(msg, /таблиця ~/);
  assert.match(msg, /живий ~36\s000/);
  assert.match(msg, /Разом під ключ/);
});

const olxApi = {
  data: [
    {
      id: 111, url: 'https://www.olx.pl/d/oferta/toyota-prius-CID5-ID1abc.html', title: 'Toyota Prius III 1.8 Hybrid',
      description: 'Sprzedam Priusa, hybryda, zarejestrowany w Polsce.<br />Serwisowany.',
      business: false,
      params: [
        { key: 'price', value: { value: 31900, label: '31 900 zł' } },
        { key: 'year', value: { key: '2013', label: '2013' } },
        { key: 'milage', value: { key: '180000', label: '180 000 km' } },
        { key: 'petrol', value: { key: 'cng', label: 'CNG i Hybryda' } },
        { key: 'transmission', value: { key: 'automatic', label: 'Automatyczna' } },
        { key: 'vin', value: { key: 'JTDKN36U401234567', label: 'JTDKN36U401234567' } },
        { key: 'model', value: { key: 'prius', label: 'Prius' } },
        { key: 'condition', value: { key: 'notdamaged', label: 'Nieuszkodzony' } },
      ],
      location: { city: { name: 'Kraków' }, region: { name: 'Małopolskie' } },
      photos: [{ link: 'https://ireland.apollo.olxcdn.com/v1/files/abc/image;s={width}x{height}' }],
    },
    { id: 222, url: 'https://www.olx.pl/d/oferta/fiat-CID5-ID2.html', title: 'Fiat Panda 1.2 CNG',
      params: [{ key: 'petrol', value: { key: 'cng', label: 'CNG i Hybryda' } }, { key: 'price', value: { value: 15000 } }, { key: 'year', value: { key: '2015' } }] },
  ],
};

test('OLX: розбір API, VIN, фото, CNG-не-гібрид відсіюється', () => {
  const [prius, panda] = parseOlxResponse(olxApi);
  assert.equal(prius.id, 'olx-111');
  assert.equal(prius.price, 31900);
  assert.equal(prius.mileage, 180000);
  assert.equal(prius.vin, 'JTDKN36U401234567');
  assert.equal(prius.photo, 'https://ireland.apollo.olxcdn.com/v1/files/abc/image;s=800x600');
  assert.equal(prius.city, 'Kraków');
  assert.notEqual(analyze(prius).verdict, 'SKIP');
  const a = analyze(panda);
  assert.equal(a.verdict, 'SKIP');
  assert.ok(a.skipCodes.includes('notHybrid'));
});

test('Повідомлення: зниження ціни і VIN', () => {
  const [prius] = parseOlxResponse(olxApi);
  const msg = formatMessage(prius, analyze(prius), { priceDrop: { oldPrice: 33900 } });
  assert.match(msg, /ЦІНА ЗНИЖЕНА: було 33\s900 → 31\s900 zł \(−2\s000\)/);
  assert.match(msg, /VIN: <code>JTDKN36U401234567/);
  assert.match(msg, /historiapojazdu/);
});

test('Відбиток: та сама машина на Otomoto і OLX збігається', () => {
  const a = fingerprint({ make: 'toyota', title: 'Toyota Auris', year: 2014, mileage: 156100 });
  const b = fingerprint({ make: null, title: 'Toyota Auris 1.8 hybrid', year: 2014, mileage: 156100 });
  assert.equal(a, b);
  assert.equal(fingerprint({ vin: 'JTDKN36U401234567' }), 'vin:JTDKN36U401234567');
  assert.equal(fingerprint({ make: 'toyota', year: 2014, mileage: 842 }), null);
});

test('Старий формат памʼяті конвертується', () => {
  const s = emptyState();
  s.seen.abc = 123;
  assert.deepEqual(getSeen(s, 'abc'), { t: 123 });
});

test('Звіти: о 20:00 за Варшавою, тижневий у неділю', () => {
  const s = emptyState();
  // 3 листопада 2026, 19:30 UTC = 20:30 у Варшаві (вівторок)
  const tue = new Date('2026-11-03T19:30:00Z');
  assert.equal(localNow(tue).hour, 20);
  let d = reportsDue(s, tue);
  assert.ok(d.daily && !d.weekly);
  s.lastDailyReport = d.day;
  assert.ok(!reportsDue(s, tue).daily);
  assert.ok(!reportsDue(emptyState(), new Date('2026-11-03T17:00:00Z')).daily);
  d = reportsDue(emptyState(), new Date('2026-11-08T19:30:00Z'));
  assert.ok(d.daily && d.weekly);

  const st = dayStats(s, '2026-11-03');
  Object.assign(st, { runs: 40, checked: 12, otomoto: 9, olx: 3, skipped: 10, reasons: { notHybrid: 6, price: 4 } });
  const txt = dailyReport(s, '2026-11-03');
  assert.match(txt, /03\.11/);
  assert.match(txt, /не гібрид 6/);
  s.sentLog.push({ t: Date.now(), title: 'Toyota Auris TS', price: 33000, url: 'u', v: 'HOT' });
  assert.match(weeklyReport(s, '2026-11-03'), /Надіслані за тиждень/);
});
