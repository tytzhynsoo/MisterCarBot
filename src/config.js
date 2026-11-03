// ============================================================
//  НАЛАШТУВАННЯ БОТА — тут міняєш фільтри, ціни й слова-тригери
// ============================================================

// Загальний бюджет "під ключ": авто + PCC + реєстрація + OC + діагностика + перше ТО + резерв
export const TOTAL_BUDGET = 40000;

// Витрати при купівлі (zł). Перевірено в листопаді 2026:
// реєстрація з новими номерами 180 zł (зі старими — 67 zł);
// OC у Кракові в середньому ~700–850 zł за рік, беремо із запасом.
export const PURCHASE_COSTS = {
  pccRate: 0.02,      // PCC 2% — лише якщо продає приватна особа
  registration: 180,  // реєстрація з новими номерами
  oc: 900,            // OC на рік (орієнтовно)
  inspection: 400,    // діагностика перед купівлею + тест батареї в ASO
  firstService: 1500, // перше ТО гібрида: масло, фільтри, свічки, гальмівна рідина, рідина коробки
  reserve: 1000,      // резерв на дрібниці
};

export const BUDGET = {
  // Оголошення дорожчі за це — ігноруються повністю
  maxPrice: 42000,
  maxMileage: 230000,
  minYear: 2010,
};

// Як часто бот може робити запити (мс між запитами до Otomoto)
export const REQUEST_DELAY_MS = 3000;
// Скільки сторінок оголошень максимум відкривати за один запуск
export const MAX_DETAIL_FETCHES = 15;
// Надсилати також "👀 ГЛЯНЬ" (а не лише "🔥 ДЗВОНИ ВЖЕ")
export const NOTIFY_LOOK = true;
// Надсилати "⚠️ підозріло дешево"? Практика показала: майже завжди це
// побиті машини / США / шахрайство, тому за замовчуванням вимкнено.
export const NOTIFY_CAUTION = false;
// Від скількох км від дому позначати оголошення як "далеко"
export const FAR_DISTANCE_KM = 300;

const COMMON_PARAMS = {
  'search[filter_float_price:to]': String(BUDGET.maxPrice),
  'search[filter_float_mileage:to]': String(BUDGET.maxMileage),
  'search[filter_float_year:from]': String(BUDGET.minYear),
  'search[order]': 'created_at_first:desc',
};

// Пошуки на Otomoto. path — частина адреси після /osobowe/
// Без фільтра палива для Toyota — щоб не пропустити гібриди з газом
// (Otomoto показує їх як "Benzyna+LPG"); негібриди відсіюють правила.
export const SEARCHES = [
  { name: 'Toyota Auris', path: 'toyota/auris', params: {} },
  { name: 'Toyota Prius', path: 'toyota/prius', params: {} },
  { name: 'Toyota Prius+', path: 'toyota/prius_plus', params: {} },
  { name: 'Lexus CT', path: 'lexus/ct', params: {} },
  {
    name: 'Інші гібриди',
    path: '',
    params: { 'search[filter_enum_fuel_type]': 'hybrid' },
  },
];

export function buildSearchUrl(search, { market = false, page = 1 } = {}) {
  const base = 'https://www.otomoto.pl/osobowe' + (search.path ? '/' + search.path : '');
  // Для "живих цін" — без обмеження ціни (інакше медіана буде занижена)
  const common = market
    ? {
        'search[filter_float_mileage:to]': '300000',
        'search[filter_float_year:from]': String(BUDGET.minYear),
        'search[filter_enum_fuel_type]': 'hybrid',
        'search[order]': 'created_at_first:desc',
      }
    : COMMON_PARAMS;
  const params = new URLSearchParams({ ...common, ...(market ? {} : search.params) });
  if (page > 1) params.set('page', String(page));
  return `${base}?${params.toString()}`;
}

// ---- Живі ринкові ціни ----
// Раз на добу бот збирає свіжі оголошення цих моделей БЕЗ обмеження ціни
// і рахує медіану для моделі/року з поправкою на пробіг.
export const MARKET = {
  refreshHours: 20, // як часто оновлювати
  pages: 2,         // скільки сторінок кожної моделі брати
  keepDays: 45,     // скільки днів памʼятати ціни
  minSamples: 5,    // мінімум оголошень, щоб показувати живу ціну
};

// ---- OLX ----
// На OLX гібриди сховані у фільтрі палива "CNG i Hybryda" (значення cng).
// Чисті CNG-машини потім відсіюють правила ("не гібрид").
export const OLX = { enabled: true, pages: 2, limit: 50 };
export function buildOlxUrl(offset = 0) {
  const p = new URLSearchParams({
    offset: String(offset),
    limit: String(OLX.limit),
    category_id: '84', // Samochody osobowe
    sort_by: 'created_at:desc',
    'filter_enum_petrol[0]': 'cng',
    'filter_enum_transmission[0]': 'automatic',
    'filter_float_price:to': String(BUDGET.maxPrice),
    'filter_float_year:from': String(BUDGET.minYear),
    'filter_float_milage:to': String(BUDGET.maxMileage),
  });
  return `https://www.olx.pl/api/v1/offers/?${p.toString()}`;
}

// ---- Звіти (час Варшави) ----
export const REPORTS = {
  timeZone: 'Europe/Warsaw',
  dailyHour: 20,  // щоденний звіт після 20:00
  weeklyDay: 0,   // тижневий — у неділю (0 = неділя)
};

// Орієнтовні ринкові ціни (zł) для пробігу ~150 тис. км.
// Це МОЇ оцінки з оголошень листопада 2026 — підправляй під ринок.
export const REFERENCE_PRICES = {
  auris_hatch: { 2010: 24000, 2011: 25500, 2012: 27000, 2013: 30000, 2014: 33000, 2015: 36000, 2016: 39000, 2017: 43000, 2018: 47000 },
  auris_ts: { 2013: 33000, 2014: 36000, 2015: 39000, 2016: 42000, 2017: 46000, 2018: 50000 },
  prius: { 2010: 26000, 2011: 28000, 2012: 30000, 2013: 32000, 2014: 34000, 2015: 36000 },
  prius_plus: { 2012: 42000, 2013: 44000, 2014: 47000, 2015: 50000, 2016: 54000, 2017: 58000, 2018: 62000 },
  lexus_ct: { 2011: 32000, 2012: 34000, 2013: 36000, 2014: 39000, 2015: 42000, 2016: 46000 },
};
// Поправка на пробіг: ± за кожні 10 тис. км від 150 тис., з обмеженням
export const MILEAGE_ADJ_PER_10K = 500;
export const MILEAGE_ADJ_CAP = 5000;

// Слова-тригери в описі (польською, у нижньому регістрі)
export const KEYWORDS = {
  taxi: ['taxi', 'taksówk', 'taksowk', 'uber', 'bolt', 'free now', 'freenow', 'korporacj', 'po taxi', 'ex taxi'],
  damaged: ['uszkodzon', 'do naprawy', 'powypadkow', 'nie odpala', 'zatarty', 'na części', 'na czesci'],
  rhd: ['anglik', 'kierownica po prawej', 'kierownica z prawej', 'rhd'],
  // Імпорт зі США/Канади — НЕ відсіюємо, лише попереджаємо (якщо машина вже в Польщі)
  usa: ['usa', 'u.s.a', 'stany zjednoczone', 'kanad', 'z ameryki', 'ameryka', 'amerykań', 'carfax'],
  // ("mile" не додаємо: у польській "mile widziane" = "бажано")
  // Машина ще НЕ в Польщі: під пригон, у дорозі, лот з аукціону — відсіюємо повністю
  notInPoland: ['pod sprowadzenie', 'na zamówienie', 'na zamowienie', 'w drodze', 'w transporcie', 'auto w usa',
    'dostępny od', 'dostepny od', 'przed sprowadzeniem', 'sprowadzimy', 'płyną', 'na statku', 'transport z',
    'copart', 'iaai', 'manheim', 'licytacj', 'aukcj', 'auction', 'lot number', 'numer lotu'],
  // Ознаки, що машина фізично в Польщі
  inPoland: ['zarejestrowan', 'polskie tablice', 'tablice pl', 'opłacon', 'oplacon', 'gotowy do rejestracji',
    'gotowe do rejestracji', 'akcyza zapłacona', 'akcyza zaplacona', 'przegląd w polsce', 'oc i przegląd'],
  service: ['aso', 'książka serwisowa', 'ksiazka serwisowa', 'serwisowan', 'historia serwis', 'faktury'],
  battery: ['test baterii', 'test akumulatora', 'bateria sprawdzon', 'battery care', 'stan baterii', 'gwarancja na bateri', 'bateria po regeneracji', 'nowa bateria'],
  polishSalon: ['salon polska', 'salon pl', 'polski salon'],
  firstOwner: ['pierwszy właściciel', 'pierwszy wlasciciel', '1 właściciel', '1 wlasciciel', 'jeden właściciel', 'i właściciel'],
  lpg: ['lpg', 'gaz', 'autogaz', 'instalacja gazowa'],
  // "приватна особа", але в тексті — комісіонка/автосалон
  dealerHint: ['komis', 'w komisie', 'autohandel', 'auto handel', 'plac samochodowy', 'skup aut', 'skup$$$', 'zapraszamy na oględziny', 'zapraszamy do kontaktu'],
  invoiceNoPcc: ['nie płaci podatku', 'bez pcc', 'zwolniony z pcc', 'nie płacisz pcc', 'wystawiam fakturę', 'faktura vat', 'faktura marża'],
  plugIn: ['plug-in', 'plugin', 'phev'],
};

// Марки/коробки. Toyota/Lexus — e-CVT (планетарна, надійна).
export const GOOD_HYBRID_MAKES = ['toyota', 'lexus'];
export const GEARBOX_WARNINGS = {
  kia: 'Kia-гібриди мають роботизовану коробку DCT — проти наших правил',
  hyundai: 'Hyundai-гібриди мають роботизовану коробку DCT — проти наших правил',
  honda: 'Старі гібриди Honda (до ~2020) — ремінний CVT; новіші e:HEV — ок. Перевір рік і тип',
  peugeot: 'Peugeot/Citroën Hybrid4 — роботизована коробка, проти наших правил',
  citroen: 'Peugeot/Citroën Hybrid4 — роботизована коробка, проти наших правил',
  ds: 'Роботизована коробка, проти наших правил',
  suzuki: 'Suzuki — переважно мʼякий гібрид з механікою або CVT; перевір',
  renault: 'Renault E-Tech — своя мультирежимна коробка; перевір',
  ford: 'Ford Hybrid (Mondeo/Kuga) — e-CVT як у Toyota, загалом ок; перевір версію',
  mitsubishi: 'Mitsubishi PHEV — плагін-гібрид, перевір стан батареї',
};
