// ============================================================
//  НАЛАШТУВАННЯ БОТА — тут міняєш фільтри, ціни й слова-тригери
// ============================================================

export const BUDGET = {
  // Оголошення дорожчі за це — ігноруються повністю
  maxPrice: 42000,
  // Комфортна ціна: усе, що вище, отримає мінус "понад бюджет"
  targetPrice: 40000,
  maxMileage: 230000,
  minYear: 2010,
};

// Як часто бот може робити запити (мс між запитами до Otomoto)
export const REQUEST_DELAY_MS = 3000;
// Скільки сторінок оголошень максимум відкривати за один запуск
export const MAX_DETAIL_FETCHES = 10;
// Надсилати також "👀 ГЛЯНЬ" (а не лише "🔥 ДЗВОНИ ВЖЕ")
export const NOTIFY_LOOK = true;
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

export function buildSearchUrl(search) {
  const base = 'https://www.otomoto.pl/osobowe' + (search.path ? '/' + search.path : '');
  const params = new URLSearchParams({ ...COMMON_PARAMS, ...search.params });
  return `${base}?${params.toString()}`;
}

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
  usa: ['usa', 'kanad', 'z ameryki', 'copart', 'iaai'],
  service: ['aso', 'książka serwisowa', 'ksiazka serwisowa', 'serwisowan', 'historia serwis', 'faktury'],
  battery: ['test baterii', 'test akumulatora', 'bateria sprawdzon', 'battery care', 'stan baterii', 'gwarancja na bateri', 'bateria po regeneracji', 'nowa bateria'],
  polishSalon: ['salon polska', 'salon pl', 'polski salon'],
  firstOwner: ['pierwszy właściciel', 'pierwszy wlasciciel', '1 właściciel', '1 wlasciciel', 'jeden właściciel', 'i właściciel'],
  lpg: ['lpg', 'gaz', 'autogaz', 'instalacja gazowa'],
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
