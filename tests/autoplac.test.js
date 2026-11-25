import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAutoplacSearch, autoplacId } from '../src/autoplac.js';
import { analyze } from '../src/analyze.js';

const html = readFileSync(new URL('./fixtures-autoplac-search.html', import.meta.url), 'utf8');

test('Autoplac: ID з адреси', () => {
  assert.equal(autoplacId('/oferta/toyota/auris/i-1-6-2008r-do-negocjacji-4625-8312-YT'), 'ap-4625-8312-YT');
  assert.equal(autoplacId('/oferty/samochody-osobowe'), null);
});

test('Autoplac: сторінка пошуку → 24 оголошення з ціною, роком, пробігом', () => {
  const list = parseAutoplacSearch(html);
  assert.equal(list.length, 24);
  const a = list[0];
  assert.equal(a.source, 'autoplac');
  assert.equal(a.id, 'ap-4625-8312-YT');
  assert.equal(a.url, 'https://autoplac.pl/oferta/toyota/auris/i-1-6-2008r-do-negocjacji-4625-8312-YT');
  assert.equal(a.price, 11500);
  assert.equal(a.year, 2008);
  assert.equal(a.mileage, 208287);
  assert.equal(a.make, 'toyota');
  assert.ok(list.some((l) => /hybrid/.test(l.fuel)));
});

test('Autoplac: бензинова Toyota відсіюється, аналіз не падає', () => {
  for (const l of parseAutoplacSearch(html)) {
    const a = analyze(l);
    assert.ok(a.verdict);
    if (/^petrol/.test(l.fuel)) assert.equal(a.verdict, 'SKIP');
  }
});

import { parseAutoplacDetail } from '../src/autoplac.js';
const detailHtml = readFileSync(new URL('./fixtures-autoplac-detail.html', import.meta.url), 'utf8');
const URL1 = 'https://autoplac.pl/oferta/toyota/auris/ii-1-8-2015r-hybryda-automat-dach-panoramiczny-kamera-aso-toyoty-2-klu-8502-7338-XT';

test('Autoplac: детальна сторінка — VIN, номер, коробка, CEPiK', () => {
  const d = parseAutoplacDetail(detailHtml, URL1);
  assert.equal(d.id, 'ap-8502-7338-XT');
  assert.equal(d.price, 38999);
  assert.equal(d.vin, 'SB1ZS3JE10E191478');
  assert.equal(d.plate, 'PZ8AT53');
  assert.equal(d.firstRegistration, '2015-12-21');
  assert.match(d.gearbox, /automatic/);
  assert.equal(d.engine, 1798);
  assert.ok(d.registeredPL);
  assert.equal(d.city, 'Poznań');
  assert.ok(d.cepik.verified);
  assert.equal(d.cepik.mileageConsistent, true);
  assert.equal(d.cepik.lastReading, 335779);
  assert.equal(d.cepik.foreignFirstReg, '2015-12-22');
  assert.equal(d.cepik.plFirstReg, '2026-11-23');
  assert.equal(d.cepik.readings.length, 1);
  assert.match(d.description, /Toyota Auris 1\.8 Hybrid/);
});

test('Autoplac: 335 тис. км → SKIP за пробігом', () => {
  assert.equal(analyze(parseAutoplacDetail(detailHtml, URL1)).verdict, 'SKIP');
});

test('Autoplac: щойно ввезена → попередження; пробіг не збігається → SKIP', () => {
  const d = { ...parseAutoplacDetail(detailHtml, URL1), mileage: 150000 };
  const cp = { ...d.cepik, plFirstReg: new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10) };
  const a = analyze({ ...d, cepik: cp });
  assert.notEqual(a.verdict, 'SKIP');
  assert.ok(a.cons.some((c) => c.includes('Щойно ввезена')));
  assert.ok(a.pros.some((p) => p.includes('CEPiK')));
  assert.equal(analyze({ ...d, cepik: { ...cp, mileageConsistent: false } }).verdict, 'SKIP');
});
