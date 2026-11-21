const { chromium } = require('playwright');
const BASE = process.env.RPW_BASE || 'http://localhost:8000';
async function start(opts = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, ...(opts.ctx || {}) });
  const p = await ctx.newPage();
  const log = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.push('[' + m.type() + '] ' + m.text().slice(0, 300)); });
  p.on('pageerror', e => log.push('[PAGEERROR] ' + e.message));
  p.on('dialog', d => { log.push('[DIALOG ' + d.type() + '] ' + d.message().slice(0, 200)); (opts.onDialog ? opts.onDialog(d) : d.accept()); });
  p.on('response', async r => {
    const u = r.url();
    if (!u.includes('/rest/v1/rpc/') && !u.includes('/functions/v1/') && !u.includes('/storage/v1/') && !u.includes('.netlify')) return;
    let body = '';
    try { body = await r.text(); } catch (e) {}
    const fn = u.split('/').slice(-1)[0].split('?')[0];
    const bad = r.status() >= 400 || /"ok":false/.test(body);
    log.push((bad ? '  ✗ ' : '  · ') + r.status() + ' ' + (u.includes('/rpc/') ? fn : u.replace(BASE, '').slice(0, 80)) + (bad ? '  ' + body.slice(0, 220) : ''));
  });
  return { b, ctx, p, log };
}
async function login(p, who, pin) {
  await p.goto(BASE + '/rpw-login.html', { waitUntil: 'networkidle' });
  const val = await p.$$eval('#who option', (os, w) => (os.find(o => o.textContent.startsWith(w)) || {}).value, who);
  await p.selectOption('#who', val);
  await p.fill('#pin', pin);
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}), p.click('#go')]);
  await p.waitForTimeout(1200);
  await closeOverlays(p);
}
async function closeOverlays(p) {
  for (let i = 0; i < 3; i++) {
    const x = await p.$('.az-x:visible');
    if (!x) break;
    await x.click().catch(() => {});
    await p.waitForTimeout(300);
  }
}
module.exports = { start, login, closeOverlays, BASE };
