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
export function firstRegFromText(text) {
  const m = String(text ?? '').match(/pierwsz\w* rejestracj\w*[^0-9]{0,30}(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/i);
  return m ? m[1] : null;
}
