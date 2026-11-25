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
