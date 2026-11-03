import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSprzSearch, parseSprzDetail } from '../src/sprzedajemy.js';
import { mergeListing } from '../src/otomoto.js';
import { analyze } from '../src/analyze.js';

const searchHtml = `<ul><li id="offer-74023289" class="odd "> <article class="element "> <ul> <li class="has photo"> <a href="/toyota-prius-iii-1-8-hybrid-szczecin-4-6bea9f-nr74023289" class="picture offerLink"> <span class="listImgWrp "> <img src="https://thumbs.img-sprzedajemy.pl/350x250c/a7/prius.jpg" loading="lazy" alt="x" /> </span> </a> </li> <li class="details"> <div class="flex-grow "> <h2 class="title "> <a href="/toyota-prius-iii-1-8-hybrid-szczecin-4-6bea9f-nr74023289" class="offerLink"> Toyota Prius III 1.8 Hybrid </a> </h2> <div class="pricing "> <span class="price "> 36 900 zł </span> </div> <div class="seller-type-info seller-type-info--private"> <span class="seller-type-info__label ">OSOBA PRYWATNA</span> </div> </div> <div class="right-bottom"> <div class="address"> <a class="location" href="#"> <strong class="city"> Szczecin </strong> </a> </div> </div> </li> </ul> </article> </li>
<li id="offer-555" class="even"><article><a href="/toyota-rav4-nr555" class="offerLink">x</a><h2 class="title"><a href="/toyota-rav4-nr555">Toyota RAV4 Hybrid</a></h2><span class="price "> 89 000 zł </span></article></li></ul>`;

const detailHtml = `<meta property="og:image" content="https://thumbs.img-sprzedajemy.pl/1000x901c/a7/prius.jpg" > <meta property="og:region" content="zachodniopomorskie" > <meta property="og:locality" content="Szczecin" >
<h1 class="title">Toyota Prius III 1.8 Hybrid</h1>
<ul class="attribute-list"> <li class="item"> <span>Oferta od</span> <strong>osoby prywatnej </strong> </li> <li class="item"> <span>Marka</span> <strong><a href="#">Toyota</a></strong> </li> <li class="item"> <span>Model</span> <strong><a href="#">Prius</a></strong> </li> <li class="item"> <span>Rok produkcji</span> <strong>2012</strong> </li> <li class="item"> <span>Przebieg</span> <strong>186022 km</strong> </li> <li class="item"> <span>Pojemność silnika</span> <strong>1797 cm³</strong> </li> <li class="item"> <span>Paliwo</span> <strong>hybryda</strong> </li> <li class="item"> <span>Stan techniczny</span> <strong>nieuszkodzony</strong> </li> <li class="item"> <span>Skrzynia biegów</span> <strong>automatyczna</strong> </li> <li class="item"> <span>VIN</span> <strong><a>pokaż VIN &raquo;</a></strong> </li></ul>
<div class="offerDescription"> <span>Sprzedam Toyotę Prius III, zarejestrowany w Polsce, serwisowany w ASO, nowa bateria hybrydowa z gwarancją. Auto zadbane.</span></div>
<strong class="price priceWrpWithLabel"> <span data-nosnippet> 36 900 zł </span> </strong>`;

test('Sprzedajemy: список', () => {
  const [p, rav] = parseSprzSearch(searchHtml);
  assert.equal(p.id, 'sprz-74023289');
  assert.equal(p.price, 36900);
  assert.equal(p.sellerType, 'private');
  assert.equal(p.city, 'Szczecin');
  assert.equal(p.title, 'Toyota Prius III 1.8 Hybrid');
  assert.ok(p.partial);
  assert.equal(rav.price, 89000);
  assert.ok(!rav.partial);
  assert.equal(analyze(rav).verdict, 'SKIP');
});

test('Sprzedajemy: сторінка оголошення', () => {
  const [p] = parseSprzSearch(searchHtml);
  const d = parseSprzDetail(detailHtml, p.url);
  assert.equal(d.year, 2012);
  assert.equal(d.mileage, 186022);
  assert.equal(d.engine, 1797);
  assert.equal(d.sellerType, 'private');
  assert.ok(d.hasVin);
  assert.ok(!d.damaged);
  assert.match(d.photo, /1000x901c/);
  const l = mergeListing(p, d);
  const a = analyze(l);
  assert.notEqual(a.verdict, 'SKIP', a.skipReasons.join());
  assert.equal(a.kind, 'prius');
});
