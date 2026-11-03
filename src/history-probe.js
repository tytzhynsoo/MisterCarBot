// Перевірка: чи відкривається historiapojazdu.gov.pl з GitHub і як виглядає форма
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ locale: 'pl-PL' });
const resp = await p.goto('https://historiapojazdu.gov.pl/', { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => console.log('GOTO ERR', e.message));
console.log('STATUS', resp?.status(), 'URL', p.url(), 'TITLE', await p.title());
const html = await p.content();
console.log('CAPTCHA?', /recaptcha|hcaptcha|captcha|turnstile/i.test(html), (html.match(/.{0,120}captcha.{0,120}/i) || [''])[0]);
const inputs = await p.$$eval('input,button,select,label', (els) => els.map((e) => `${e.tagName} id=${e.id} name=${e.getAttribute('name')} type=${e.type} ph=${e.getAttribute('placeholder')} aria=${e.getAttribute('aria-label')} text=${(e.innerText || '').trim().slice(0, 60)}`));
console.log('FIELDS\n' + inputs.slice(0, 60).join('\n'));
const text = (await p.innerText('body')).replace(/\s+/g, ' ');
console.log('BODY', text.slice(0, 1500));
// пробуємо заповнити вигаданими даними
try {
  const byLabel = async (re, v) => { const l = p.getByLabel(re).first(); await l.fill(v, { timeout: 5000 }); return true; };
  console.log('fill reg', await byLabel(/rejestracyjn/i, 'KR12345').catch((e) => e.message.slice(0, 120)));
  console.log('fill vin', await byLabel(/VIN/i, 'JTDKN3DU5A0123456').catch((e) => e.message.slice(0, 120)));
  console.log('fill date', await byLabel(/pierwszej rejestracji/i, '01.01.2012').catch((e) => e.message.slice(0, 120)));
  const btn = p.getByRole('button', { name: /sprawdź/i }).first();
  await btn.click({ timeout: 5000 });
  await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(3000);
  console.log('AFTER URL', p.url());
  console.log('AFTER BODY', (await p.innerText('body')).replace(/\s+/g, ' ').slice(0, 1500));
} catch (e) { console.log('FORM ERR', e.message.slice(0, 300)); }
await b.close();
