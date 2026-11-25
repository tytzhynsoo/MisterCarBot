// Повна сума покупки "під ключ"
import { PURCHASE_COSTS as C, TOTAL_BUDGET, FULL_BUDGET } from './config.js';

export function sellerKind(sellerType) {
  const s = String(sellerType || '').toLowerCase();
  if (!s) return 'unknown';
  if (/professional|business|dealer|firma|company/.test(s)) return 'business';
  return 'private';
}

export function purchaseCost(l) {
  if (!l.price) return null;
  const seller = sellerKind(l.sellerType);
  // PCC 2% платить покупець, якщо продає приватна особа. Невідомо — рахуємо (гірший випадок).
  const pcc = seller === 'business' ? 0 : Math.round(l.price * C.pccRate);
  // У день купівлі
  const items = [
    ['PCC 2%', pcc],
    ['реєстрація', C.registration],
    ['OC', C.oc],
    ['діагностика', C.inspection],
  ];
  // Можна відкласти на кілька місяців
  const deferred = [
    ['перше ТО', C.firstService],
    ['резерв', C.reserve],
  ];
  const sum = (arr) => arr.reduce((s, [, v]) => s + v, 0);
  const total = l.price + sum(items);
  const full = total + sum(deferred);
  const over = Math.max(total - TOTAL_BUDGET, full - FULL_BUDGET);
  return { price: l.price, seller, pcc, items, deferred, total, full, over, budget: TOTAL_BUDGET, fullBudget: FULL_BUDGET };
}
