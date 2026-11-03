import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeo, distanceTo, homePoint, formatDistance } from '../src/geo.js';
import { findCoords } from '../src/otomoto.js';

// Підставний fetch: імітує відповіді Nominatim, OSRM і Google
function mockFetch(log) {
  return async (url) => {
    log.push(url);
    let body;
    if (url.includes('nominatim')) {
      body = url.includes('Bytom') ? [{ lat: '50.348', lon: '18.915' }] : [{ lat: '50.045', lon: '19.975' }];
    } else if (url.includes('project-osrm')) {
      body = { routes: [{ distance: 84600, duration: 3960 }] };
    } else if (url.includes('distancematrix')) {
      body = { rows: [{ elements: [{ status: 'OK', distance: { value: 90100 }, duration: { value: 4500 } }] }] };
    } else if (url.includes('geocode/json')) {
      body = { results: [{ geometry: { location: { lat: 50.3, lng: 18.9 } } }] };
    }
    return { ok: true, json: async () => body };
  };
}

test('Відстань по дорогах через OpenStreetMap', async () => {
  const log = [];
  const cache = {};
  const geo = createGeo({ fetchFn: mockFetch(log), googleKey: '', cache });
  process.env.HOME_ADDRESS = 'Testowa 1, 30-000 Kraków';
  delete process.env.HOME_LAT;
  const home = await homePoint(geo);
  const d = await distanceTo(geo, home, { city: 'Bytom', region: 'Śląskie' });
  assert.deepEqual(d, { km: 85, minutes: 66 });
  // місто кешується, домашня адреса — ні
  assert.ok(cache['bytom, śląskie, polska']);
  assert.ok(!Object.keys(cache).some((k) => k.includes('testowa')));
  assert.ok(log.some((u) => u.includes('router.project-osrm.org')));
});

test('Координати з оголошення мають пріоритет над містом', async () => {
  const log = [];
  const geo = createGeo({ fetchFn: mockFetch(log), googleKey: '', cache: {} });
  const d = await distanceTo(geo, { lat: 50.04, lon: 19.97 }, { city: 'Bytom', coords: { lat: 50.35, lon: 18.91 } });
  assert.ok(d);
  assert.ok(!log.some((u) => u.includes('nominatim')));
});

test('Google Maps, якщо є ключ', async () => {
  const log = [];
  const geo = createGeo({ fetchFn: mockFetch(log), googleKey: 'KEY', cache: {} });
  const d = await distanceTo(geo, { lat: 50.04, lon: 19.97 }, { city: 'Bytom', region: 'Śląskie' });
  assert.deepEqual(d, { km: 90, minutes: 75 });
  assert.ok(log.some((u) => u.includes('maps.googleapis.com')));
});

test('HOME_LAT/HOME_LON без запитів', async () => {
  const log = [];
  process.env.HOME_LAT = '50.04';
  process.env.HOME_LON = '19.97';
  const geo = createGeo({ fetchFn: mockFetch(log), googleKey: '', cache: {} });
  assert.deepEqual(await homePoint(geo), { lat: 50.04, lon: 19.97 });
  assert.equal(log.length, 0);
  delete process.env.HOME_LAT;
  delete process.env.HOME_LON;
});

test('Формат відстані', () => {
  assert.equal(formatDistance({ km: 85, minutes: 66 }), '🚗 85 км від дому, ~1 год 6 хв їзди');
  assert.equal(formatDistance({ km: 12, minutes: 25 }), '🚗 12 км від дому, ~25 хв їзди');
  assert.equal(formatDistance(null), null);
});

test('findCoords бере лише точки в Польщі', () => {
  assert.deepEqual(findCoords({ map: { lat: 50.35, lon: 18.91 } }), { lat: 50.35, lon: 18.91 });
  assert.equal(findCoords({ map: { lat: 0, lon: 0 } }), null);
});

import { homeQueryVariants } from '../src/geo.js';
test('Варіанти пошуку адреси дому', () => {
  const v = homeQueryVariants('Testowa 12 m. 93, 30-000 Kraków');
  assert.equal(v[0], 'Testowa 12 m. 93, 30-000 Kraków');
  assert.equal(v[1], 'Testowa 12, 30-000 Kraków');
  assert.equal(v[2], '30-000 Kraków, Polska');
  assert.deepEqual(homeQueryVariants('Testowa 12/93, 30000 Kraków')[2], '30-000 Kraków, Polska');
});
