import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, summaryText } from '../src/history.js';
import { plateFromText, toPlDate, firstRegFromText } from '../src/vin.js';

const report = `RAPORT O POJEŹDZIE TOYOTA PRIUS Pierwsza rejestracja w Polsce 02.06.2015
Okresowe badanie techniczne Wynik badania: pozytywny Odczytany stan licznika: 120 300 km
Okresowe badanie techniczne Odczytany stan licznika: 150 100 km
Zmiana właściciela Zmiana właściciela
Badanie techniczne: aktualne Ostatni stan licznika: 182 000 km Liczba aktualnych właścicieli: 1
Służył jako taxi nie odnotowano Pobierz raport PDF`;

test('historiapojazdu: нормальний звіт', () => {
  const s = summarize(report, 185000);
  assert.ok(s.found);
  assert.deepEqual(s.readings, [120300, 150100, 182000]);
  assert.equal(s.owners, 1);
  assert.equal(s.changes, 2);
  assert.equal(s.taxi, false);
  assert.equal(s.firstPl, '02.06.2015');
  assert.equal(s.flags.length, 0);
  assert.match(summaryText({ title: 'Prius', vin: 'X' }, s), /Явних червоних прапорців/);
});

test('historiapojazdu: скручений пробіг', () => {
  const s = summarize(report, 140000);
  assert.ok(s.flags.some((f) => f.includes('скручений')));
  const s2 = summarize('Odczytany stan licznika: 200 000 km Odczytany stan licznika: 150 000 km', null);
  assert.ok(s2.flags.some((f) => f.includes('ЗМЕНШУВАВСЯ')));
});

test('historiapojazdu: не знайдено', () => {
  const s = summarize('Nie znaleźliśmy pojazdu w Centralnej Ewidencji Pojazdów');
  assert.equal(s.found, false);
  assert.match(summaryText({ vin: 'V', plate: 'P', date: 'D' }, s), /НЕ знайдено/);
});

test('Номер і дата з тексту оголошення', () => {
  const t = 'Sprzedam. VIN JTDKN3DU5A0123456, nr rej. KR 1AB23, data pierwszej rejestracji: 2.4.2013';
  assert.equal(plateFromText(t), 'KR1AB23');
  assert.equal(toPlDate(firstRegFromText(t)), '02.04.2013');
  assert.equal(plateFromText('nowe tablice, polskie tablice'), null);
});
