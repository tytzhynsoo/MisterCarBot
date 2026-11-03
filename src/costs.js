// Повна сума покупки "під ключ"
import { PURCHASE_COSTS as C, TOTAL_BUDGET } from './config.js';

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
  const items = [
    ['PCC 2%', pcc],
    ['реєстрація', C.registration],
    ['OC', C.oc],
    ['діагностика', C.inspection],
    ['перше ТО', C.firstService],
    ['резерв', C.reserve],
  ];
  const total = l.price + items.reduce((s, [, v]) => s + v, 0);
  return { price: l.price, seller, pcc, items, total, over: total - TOTAL_BUDGET, budget: TOTAL_BUDGET };
}
