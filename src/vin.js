// VIN: перевірка формату і пошук у тексті оголошення.

// Повертає VIN у верхньому регістрі або null, якщо це не схоже на справжній VIN
// (продавці часто пишуть "12345678901234567" або "xxxxxxxxxxxxxxxxx").
export function cleanVin(v) {
  const s = String(v ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(s)) return null;
  if (/^(.)\1+$/.test(s) || /12345678|ABCDEFG/.test(s)) return null;
  if (!/[A-Z]/.test(s) || !/[0-9]/.test(s)) return null;
  return s;
}

export function vinFromText(text) {
  const matches = String(text ?? '').toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) || [];
  for (const m of matches) {
    const v = cleanVin(m);
    if (v) return v;
  }
  return null;
}

// Перша цифра VIN: 1, 4, 5 — США; 2 — Канада; 3 — Мексика
export function isNorthAmericanVin(vin) {
  return !!vin && /^[1-5]/.test(vin);
}

// Дата першої реєстрації з тексту: "data pierwszej rejestracji: 12.05.2014"
const DATE_RE = '(\\d{1,2}[./-]\\d{1,2}[./-]\\d{4}|\\d{4}[./-]\\d{1,2}[./-]\\d{1,2})';
export function firstRegFromText(text) {
  const re = new RegExp(`(?:pierwsz\\w*|1\\.?)\\s*rejestracj\\w*[^0-9]{0,40}${DATE_RE}`, 'i');
  const m = String(text ?? '').match(re);
  return m ? m[1] : null;
}

// Дата у форматі сайту historiapojazdu: dd.mm.rrrr
export function toPlDate(d) {
  if (!d) return null;
  let m = String(d).match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (m) return `${m[3].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[1]}`;
  m = String(d).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[3]}`;
  return null;
}

// Польський номерний знак, лише якщо поруч є слово "nr rej", "numer rejestracyjny", "tablice"
export function plateFromText(text) {
  const re = /(?:nr\.?\s*rej\w*\.?|numer\s+rejestracyjn\w*|tablic\w*\s*rejestracyjn\w*|tablic\w*)\s*[:\-–]?\s*([A-Z]{1,3}\s?[A-Z0-9]{3,5})\b/gi;
  for (const m of String(text ?? '').matchAll(re)) {
    const p = m[1].toUpperCase().replace(/\s/g, '');
    if (p.length >= 4 && p.length <= 8 && /^[A-Z]{1,3}/.test(p) && /\d/.test(p)) return p;
  }
  return null;
}
