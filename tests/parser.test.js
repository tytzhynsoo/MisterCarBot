import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchPage, parseDetailPage, parseNumber } from '../src/otomoto.js';

// Синтетична сторінка в стилі Otomoto (Next.js + urqlState, де дані — JSON-рядок)
function fakeSearchHtml() {
  const searchData = {
    advertSearch: {
      edges: [
        {
          node: {
            id: '6151397970',
            title: 'Toyota Auris 1.8 HSD Luna',
            url: 'https://www.otomoto.pl/osobowe/oferta/toyota-auris-ID6IiDCi.html',
            price: { amount: { units: 30900, currencyCode: 'PLN' } },
            parameters: [
              { key: 'make', value: 'toyota', displayValue: 'Toyota' },
              { key: 'model', value: 'auris', displayValue: 'Auris' },
              { key: 'year', value: '2015', displayValue: '2015' },
              { key: 'mileage', value: '119000', displayValue: '119 000 km' },
              { key: 'fuel_type', value: 'hybrid', displayValue: 'Hybryda' },
              { key: 'gearbox', value: 'automatic', displayValue: 'Automatyczna' },
              { key: 'engine_capacity', value: '1797', displayValue: '1 797 cm3' },
            ],
            location: { city: { name: 'Bytom' }, region: { name: 'Śląskie' } },
          },
        },
      ],
    },
  };
  const next = { props: { pageProps: { urqlState: { abc: { data: JSON.stringify(searchData) } } } } };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script></body></html>`;
}

test('Парсер знаходить оголошення в urqlState', () => {
  const list = parseSearchPage(fakeSearchHtml());
  assert.equal(list.length, 1);
  const l = list[0];
  assert.equal(l.price, 30900);
  assert.equal(l.year, 2015);
  assert.equal(l.mileage, 119000);
  assert.equal(l.engine, 1797);
  assert.equal(l.city, 'Bytom');
  assert.match(l.fuel, /hybrid/);
});

test('Запасний варіант: лише посилання', () => {
  const html = '<a href="https://www.otomoto.pl/osobowe/oferta/toyota-prius-ID6IiW2y.html">x</a>';
  const list = parseSearchPage(html);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, '6IiW2y');
  assert.ok(list[0].partial);
});

test('Сторінка оголошення: опис і тип продавця', () => {
  const advert = {
    advert: {
      id: '1', title: 'Toyota Prius', description: '<p>Serwis ASO.<br>Test baterii co roku.</p>',
      price: { value: '39900' }, seller: { type: 'private', location: { city: { name: 'Tarnów' } } },
      details: [{ key: 'year', value: '2012' }, { key: 'mileage', value: '230 500 km' }, { key: 'fuel_type', value: 'hybrid', label: 'Hybryda' }],
    },
  };
  const html = `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: advert } })}</script>`;
  const l = parseDetailPage(html, 'https://www.otomoto.pl/osobowe/oferta/toyota-prius-ID6IiW2y.html');
  assert.equal(l.price, 39900);
  assert.equal(l.mileage, 230500);
  assert.equal(l.city, 'Tarnów');
  assert.match(l.description, /Test baterii/);
});

test('parseNumber', () => {
  assert.equal(parseNumber('1 797 cm3'), 1797);
  assert.equal(parseNumber('156 000 km'), 156000);
  assert.equal(parseNumber('39.900'), 39900);
  assert.equal(parseNumber(30900), 30900);
  assert.equal(parseNumber(''), null);
});
