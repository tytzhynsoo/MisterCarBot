// Оцінка оголошення за нашими правилами.
// Повертає вердикт (HOT / LOOK / CAUTION / SKIP), плюси, мінуси і ринкову оцінку.

import {
  BUDGET,
  REFERENCE_PRICES,
  MILEAGE_ADJ_PER_10K,
  MILEAGE_ADJ_CAP,
  KEYWORDS,
  GOOD_HYBRID_MAKES,
  GEARBOX_WARNINGS,
  TOTAL_BUDGET,
  GROUPS,
  groupOf,
} from './config.js';
import { purchaseCost } from './costs.js';
import { isNorthAmericanVin } from './vin.js';

// Коди причин відсіювання — для щоденних звітів
export const SKIP_LABELS = {
  price: 'дорожче за ліміт',
  mileage: 'завеликий пробіг',
  year: 'занадто старі',
  notHybrid: 'не гібрид',
  manual: 'механіка',
  damaged: 'пошкоджені',
  rhd: 'правий кермо',
  notInPL: 'ще не в Польщі',
  fakeMileage: 'хитрий пробіг',
  tooCheap: 'нереально дешеві',
  notDiesel: 'BMW не дизель',
  notB47: 'BMW не 2.0d (не B47)',
  notV6: 'Journey/Freemont не 3.6 V6',
  lpgBudget: 'з установкою ГБО дорожче за ліміт',
};

export const VERDICT = {
  HOT: '🔥 ДЗВОНИ ВЖЕ',
  CAUTION: '⚠️ ПІДОЗРІЛО ДЕШЕВО — ДЗВОНИ, АЛЕ ОБЕРЕЖНО',
  LOOK: '👀 ГЛЯНЬ',
  SKIP: 'SKIP',
};

// Короткі слова (aso, usa, gaz…) шукаємо лише як окремі слова,
// щоб "aso" не знаходилось у "kasowanie", а "usa" — у "usatysfakcjonowany".
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text, words) =>
  words.some((w) =>
    w.length <= 4
      ? new RegExp(`(^|[^a-z0-9ąćęłńóśźż])${escapeRe(w)}($|[^a-z0-9ąćęłńóśźż])`, 'i').test(text)
      : text.includes(w),
  );

export function detectMake(l) {
  if (l.make) return l.make;
  const t = `${l.title} ${l.url}`.toLowerCase();
  const known = ['toyota', 'lexus', 'kia', 'hyundai', 'honda', 'peugeot', 'citroen', 'ds', 'suzuki', 'renault', 'ford', 'mitsubishi', 'volvo', 'bmw', 'mercedes', 'audi', 'volkswagen', 'skoda', 'nissan', 'mazda', 'opel', 'fiat', 'jeep', 'porsche'];
  return known.find((m) => t.includes(m)) || null;
}

// Визначаємо "тип" машини — від нього залежать ринкова ціна і сон у машині
export function detectKind(l) {
  const t = `${l.title} ${l.model || ''} ${l.url || ''}`.toLowerCase();
  const make = detectMake(l);
  const isCombi = /kombi|combi|touring|\bts\b/.test(`${t} ${l.body || ''}`);
  if (make === 'toyota' && /prius[_\s-]?(\+|plus)|prius-plus|prius_plus|prius v\b|prius alpha/.test(t)) return 'prius_plus';
  if (make === 'toyota' && /prius/.test(t)) return has(t, KEYWORDS.plugIn) ? 'other_toyota_hybrid' : 'prius';
  if (make === 'toyota' && /auris/.test(t)) return isCombi ? 'auris_ts' : 'auris_hatch';
  if (make === 'lexus' && /\bct\b|ct ?200|lexus-ct/.test(t)) return 'lexus_ct';
  if (make === 'toyota' || make === 'lexus') return 'other_toyota_hybrid';
  if (l.group === 'bmw_b47') return 'bmw_b47';
  if (l.group === 'v6_awd') return 'journey_v6';
  return 'other_brand_hybrid';
}

export function referencePrice(kind, year, mileage) {
  const table = REFERENCE_PRICES[kind];
  if (!table || !year) return null;
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  let base;
  if (table[year]) base = table[year];
  else if (year < years[0]) base = table[years[0]] - (years[0] - year) * 3000;
  else base = table[years[years.length - 1]] + (year - years[years.length - 1]) * 3000;
  if (mileage) {
    const diff10k = (150000 - mileage) / 10000;
    const adj = Math.max(-MILEAGE_ADJ_CAP, Math.min(MILEAGE_ADJ_CAP, diff10k * MILEAGE_ADJ_PER_10K));
    base += adj;
  }
  return Math.round(base / 100) * 100;
}

export function isHybrid(l, kind = detectKind(l)) {
  const f = `${l.fuel} ${l.fuelLabel}`.toLowerCase();
  // OLX: "CNG i Hybryda" — одне значення для обох, тож перевіряємо назву/опис
  const ambiguous = f.includes('cng');
  if (!ambiguous && (f.includes('hybrid') || f.includes('hybryd'))) return true;
  if (ambiguous && /hybrid|hybryd|\bhsd\b|\bhev\b|e:hev|full hybrid/i.test(`${l.title} ${l.description || ''}`)) return true;
  // Toyota/Lexus-гібриди з газом Otomoto показує як "Benzyna+LPG"
  const hybridKinds = ['auris_hatch', 'auris_ts', 'prius', 'prius_plus', 'lexus_ct'];
  if (hybridKinds.includes(kind)) {
    if (kind === 'prius' || kind === 'prius_plus') return true; // усі Prius — гібриди
    const t = `${l.title}`.toLowerCase();
    if (/hybrid|hybryd|hsd|\bct ?200h\b/.test(t)) return true;
    // Auris 1.8 з автоматом у Європі — лише гібрид
    if (l.engine && l.engine >= 1790 && l.engine <= 1800 && /automat|auto/.test(l.gearbox)) return true;
  }
  return false;
}

// ctx.live — жива ринкова ціна { price, n } (рахує index.js з market.js)
export function analyze(l, ctx = {}) {
  const pros = [];
  const cons = [];
  const skipReasons = [];
  const skipCodes = [];
  const skip = (code, text) => { skipCodes.push(code); skipReasons.push(text); };
  const kind = detectKind(l);
  const make = detectMake(l);
  const text = `${l.title}\n${l.description || ''}\n${l.shortDescription || ''}`.toLowerCase();

  const group = groupOf(l);
  const G = GROUPS[group];
  const fuel = `${l.fuel || ''} ${l.fuelLabel || ''}`.toLowerCase();
  const hasLpg = /lpg/.test(fuel) || has(text, KEYWORDS.lpg);

  // ---------- жорсткі фільтри ----------
  if (l.price && l.price > G.maxPrice) skip('price', `ціна ${l.price} > ${G.maxPrice}`);
  if (l.mileage && l.mileage > G.maxMileage) skip('mileage', `пробіг ${l.mileage} > ${G.maxMileage}`);
  if (l.year && l.year < G.minYear) skip('year', `рік ${l.year} < ${G.minYear}`);
  if (group === 'hybrid' && !isHybrid(l, kind)) skip('notHybrid', 'не гібрид');
  if (group === 'bmw_b47') {
    if (fuel.trim() && !/diesel/.test(fuel)) skip('notDiesel', 'не дизель — не B47');
    if (l.engine && (l.engine < 1990 || l.engine > 2000)) skip('notB47', `обʼєм ${l.engine} см³ — не 2.0d B47`);
  }
  if (group === 'v6_awd') {
    if (l.engine && (l.engine < 3500 || l.engine > 3700)) skip('notV6', `обʼєм ${l.engine} см³ — не 3.6 V6`);
    if (/diesel/.test(fuel)) skip('notV6', 'дизель — не 3.6 V6');
    // Лише бензин: ціна + установка ГБО теж має вкластися в ліміт
    if (!hasLpg && l.price && l.price + G.lpgInstall > G.maxPrice) {
      skip('lpgBudget', `без ГБО: ${l.price} + ~${G.lpgInstall} установка > ${G.maxPrice}`);
    }
  }
  if (/manual/.test(l.gearbox)) skip('manual', 'механіка');
  if (l.damaged || has(text, KEYWORDS.damaged)) skip('damaged', 'пошкоджена');
  if (l.rhd || has(text, KEYWORDS.rhd)) skip('rhd', 'правий кермо');

  // Машина ще не в Польщі: під пригон / у дорозі / лот з аукціону
  if (has(text, KEYWORDS.notInPoland)) skip('notInPL', 'машина ще не в Польщі (під пригон / аукціон)');

  // Хитрість з пробігом: "842 km" замість 842 000 на машині кількарічної давності
  const age = l.year ? new Date().getFullYear() - l.year : null;
  if (l.mileage !== null && l.mileage !== undefined && age !== null && age >= 3) {
    if (l.mileage < 5000) {
      const real = l.mileage * 1000;
      skip('fakeMileage', `пробіг ${l.mileage} км на авто ${l.year} р. — найімовірніше ${real.toLocaleString('uk-UA')} км`);
    }
  }

  // Модель без нашої ринкової таблиці (Camry, RAV4, C-HR…): новий гібрид за ≤42 тис. — майже напевно
  // побитий/з США. Відсіюємо, щоб не засмічував сповіщення.
  if (group === 'hybrid' && !REFERENCE_PRICES[kind] && l.year && l.year >= 2018 && l.price && l.price <= BUDGET.maxPrice) {
    skip('tooCheap', `занадто дешево для ${l.year} р. — найімовірніше побитий або з США`);
  }
  if (skipReasons.length) return { verdict: 'SKIP', kind, skipReasons, skipCodes, pros, cons, score: 0 };

  let score = 0;
  let suspicious = false;

  // ---------- ціна відносно ринку: таблиця + живі дані ----------
  const ref = referencePrice(kind, l.year, l.mileage);
  const live = ctx.live || null;
  // Для оцінки беремо живу ціну, якщо вона є; інакше — таблицю
  const basis = live?.price || ref;
  let ratio = null;
  if (basis && l.price) {
    ratio = l.price / basis;
    const pct = Math.round((ratio - 1) * 100);
    const src = live?.price ? 'живий ринок' : 'ринок за таблицею';
    if (ratio <= 0.75) {
      suspicious = true;
      cons.push(`Ціна на ${-pct}% нижча за ${src} (~${fmt(basis)} zł) — можливе шахрайство або прихований дефект. Жодних передоплат!`);
    } else if (ratio <= 0.9) {
      score += 2;
      pros.push(`Ціна на ${-pct}% нижча за ${src}`);
    } else if (ratio <= 1.02) {
      score += 1;
      pros.push(`Ціна в ринку (${src})`);
    } else if (ratio > 1.1) {
      score -= 1;
      cons.push(`Дорожче за ${src} на ${pct}% — торгуйся`);
    }
  }

  // ---------- повна сума покупки ----------
  const cost = purchaseCost(l);
  if (group === 'hybrid') {
    if (cost && cost.over > 0) {
      cons.push(`Разом з усіма витратами ~${fmt(cost.total)} zł — на ${fmt(cost.over)} понад ${fmt(TOTAL_BUDGET)}. Торгуйся до ~${fmt(Math.floor((l.price - cost.over) / 100) * 100)} zł`);
    }
  } else if (l.price) {
    // Ціль — ціна самого авто; повну суму показуємо окремо
    const lpgExtra = group === 'v6_awd' && !hasLpg ? G.lpgInstall : 0;
    const total = (cost?.total || l.price) + lpgExtra;
    const totalText = `Разом з PCC, реєстрацією, OC, діагностикою, першим ТО${lpgExtra ? ' і ГБО' : ''}: ~${fmt(total)} zł`;
    if (l.price > G.targetPrice) cons.push(`Ціна вище цілі ${fmt(G.targetPrice)} zł — торгуйся. ${totalText}`);
    else pros.push(`Ціна в межах цілі ${fmt(G.targetPrice)} zł. ${totalText}`);
  }

  // ---------- рік і пробіг ----------
  if (l.year && l.year >= 2015) { score += 1; pros.push(`Свіжий рік: ${l.year}`); }
  if (l.mileage) {
    if (l.mileage <= 150000) { score += 1; pros.push(`Помірний пробіг: ${fmt(l.mileage)} км`); }
    else if (l.mileage > 200000) { score -= 1; cons.push(`Великий пробіг: ${fmt(l.mileage)} км`); }
    else if (G.preferMileage && l.mileage > G.preferMileage) cons.push(`Пробіг ${fmt(l.mileage)} км — понад бажані ${fmt(G.preferMileage)}`);
  }

  // ---------- тип кузова і сон у машині ----------
  const sleepNotes = {
    auris_ts: ['+', 'Touring Sports: понад 2 м рівної підлоги для сну', 2],
    prius_plus: ['+', 'Prius+: рівна підлога ~1,75 м, найкращий для ночівель', 2],
    prius: ['+', 'Prius III: сон удвох можливий (сидіння вперед + підставка)', 1],
    auris_hatch: ['-', 'Хетчбек: спати удвох тісно (~1,6 м)', -1],
    lexus_ct: ['-', 'Lexus CT: тісний багажник, для сну погано', -1],
    journey_v6: ['+', 'Мінівен: зі складеними 2-м і 3-м рядами — рівна підлога (перевір довжину для сну)', 1],
  };
  const sn = sleepNotes[kind];
  if (sn) {
    score += sn[2];
    (sn[0] === '+' ? pros : cons).push(sn[1]);
  }

  // ---------- марка / коробка / двигун ----------
  let goodMake;
  if (group === 'bmw_b47') {
    const t = `${l.title} ${l.model || ''} ${l.url || ''}`.toLowerCase();
    // Рік 2014 — часто ще N47 (проблемний ланцюг). З 2016 — практично завжди B47.
    goodMake = !l.year || l.year >= 2016;
    if (!l.year || l.year <= 2015) cons.push('2014–2015: може бути ще N47 — перевір код двигуна за VIN (потрібен B47)');
    else pros.push('2.0d 2016+: майже напевно B47 (підтверди за VIN)');
    if (/active[\s-]?tourer|gran[\s-]?tourer/.test(t) || (/\bx1\b|-x1-/.test(t) && /sdrive/.test(t))) {
      pros.push('Передній привід, коробка Aisin 8AT (класичний автомат)');
    } else if (/seria[\s-]?[134]|\b[134]\d{2}d\b|-[134]\d{2}d-/.test(t)) {
      pros.push('Задній привід, коробка ZF 8HP');
    } else {
      cons.push('Перевір привід і тип коробки за VIN/комплектацією');
    }
    if (/touring|kombi|combi|gran[\s-]?tourer/.test(`${t} ${l.body || ''}`)) pros.push('Універсал/мінівен — перевір довжину для сну');
    cons.push('Дизель: потрібні регулярні поїздки трасою (DPF). Перевір відклик EGR за VIN в ASO, пробіг у блоках і сервісну історію');
  } else if (group === 'v6_awd') {
    const awd = /\bawd\b|4x4|4wd|napęd 4|napęd na (4|cztery)|\bawd\b/.test(text) || /4x4|awd/.test(`${l.drive || ''}`);
    goodMake = awd;
    if (awd) pros.push('Повний привід (AWD) вказано');
    else { score -= 1; cons.push('Не вказано AWD — перепитай (бувають передньопривідні, особливо з США)'); }
    pros.push('Pentastar 3.6 (розподілений впорскування) + класичний автомат 62TE');
    if (hasLpg) pros.push('Є ГБО — перевір тип (послідовне), документи і систему змащування клапанів');
    else cons.push(`Лише бензин: + ~${fmt(G.lpgInstall)} zł на установку ГБО (у місті ~13–15 л/100 км)`);
    if (l.year && l.year <= 2013) cons.push('Ранній Pentastar (2011–2013): перевір ліву головку (стук, пропуски циліндра)');
  } else {
    goodMake = GOOD_HYBRID_MAKES.includes(make);
    if (goodMake) {
      pros.push('Гібрид Toyota/Lexus: надійна коробка e-CVT');
    } else {
      score -= 2;
      cons.push(GEARBOX_WARNINGS[make] || 'Не Toyota/Lexus — перевір тип коробки (уникаємо DCT і ремінних CVT)');
    }
    if (has(text, KEYWORDS.plugIn)) cons.push('Плагін-гібрид — перевір стан великої батареї');
  }

  // ---------- слова в описі ----------
  const descKnown = (l.description || '').length > 0;
  if (has(text, KEYWORDS.taxi)) { score -= 4; cons.push('Згадка про таксі/Uber/Bolt у тексті — перевір історію'); }
  const origin = `${l.origin || ''}`.toLowerCase();
  if (/usa|stany|kanad|canada|united states/.test(origin) || has(text, KEYWORDS.usa) || isNorthAmericanVin(l.vin)) {
    score -= 2;
    cons.push('Імпорт зі США/Канади — часто з аукціонів після ДТП: обовʼязково Carfax/AutoCheck за VIN і товщиномір');
  }
  // Чи машина фізично в Польщі
  if (l.registeredPL || l.hasPlate || has(text, KEYWORDS.inPoland)) {
    pros.push(l.registeredPL || l.hasPlate ? 'Зареєстрована в Польщі / польські номери' : 'Схоже, вже в Польщі (опис)');
  } else {
    score -= 1;
    cons.push('Не вказано, що зареєстрована в Польщі — перепитай, чи авто фізично тут');
  }
  if (has(text, KEYWORDS.service) || l.serviceRecord) { score += 1; pros.push('Згадано сервіс/ASO/книжку'); }
  if (group === 'hybrid' && has(text, KEYWORDS.battery)) { score += 1; pros.push('Згадано тест/стан гібридної батареї'); }
  if (has(text, KEYWORDS.polishSalon)) { score += 1; pros.push('Польський салон'); }
  if (has(text, KEYWORDS.firstOwner)) { score += 1; pros.push('Перший власник (заявлено)'); }
  if (l.noAccident) pros.push('Заявлено без ДТП (перевір товщиноміром)');
  if (group === 'hybrid' && hasLpg) {
    pros.push('Газ: для гібрида Toyota ок — перевір документи, систему й компресію');
  }
  if (descKnown && (l.description || '').length < 80) { score -= 1; cons.push('Порожній/дуже короткий опис'); }
  const isPrivate = /private|prywat/i.test(String(l.sellerType || ''));
  if (isPrivate && has(text, KEYWORDS.dealerHint)) {
    score -= 2;
    cons.push('Позначено «приватна особа», але в описі комісіонка/«zapraszamy» — схоже на перекупника під виглядом приватника');
  }
  if (isPrivate && has(text, KEYWORDS.invoiceNoPcc)) {
    cons.push('«Приватна особа», але фактура/без PCC — можливо, перекупник');
  }
  if (l.sellerType) {
    pros.push(isPrivate ? 'Продає приватна особа' : 'Продає фірма (права споживача, фактура)');
  }

  // ---------- вердикт ----------
  let verdict;
  if (suspicious) verdict = 'CAUTION';
  else if (goodMake && !has(text, KEYWORDS.taxi) && score >= 4 &&
    (group === 'hybrid' ? (!cost || cost.total <= TOTAL_BUDGET) : (!l.price || l.price <= G.targetPrice))) verdict = 'HOT';
  else verdict = 'LOOK';

  return { verdict, kind, group, score, pros, cons, ref, live, basis, ratio, cost, skipReasons, skipCodes };
}

export function fmt(n) {
  return n === null || n === undefined ? '?' : Number(n).toLocaleString('uk-UA').replace(/,/g, ' ');
}
