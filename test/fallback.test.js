
const assert = require('assert');
process.env.META_ACCESS_TOKEN = 'T';
let comResults = 0, semResults = 0;
global.fetch = async (u) => ({ status: 200, json: async () => {
  const url = new URL(u); const p = url.pathname.replace(/^\/v[\d.]+/, '');
  if (p.endsWith('/insights')) {
    if ((url.searchParams.get('fields') || '').includes('results')) { comResults++; return { error: { message: '(#100) results is not valid for fields param', code: 100 } }; }
    semResults++;
    return { data: [] };
  }
  if (p === '/act_2323497894507847') return { name: 'X' };
  return { data: [] };
} });
const h = require('/home/claude/prolar-dashboard/api/dados.js');
h({ query: { conta: 'net', start: '2026-11-01', end: '2026-11-02' } }, { setHeader() {}, end(b) {
  const j = JSON.parse(b); assert.ok(!j.error, b); assert.ok(comResults >= 1 && semResults >= 2, comResults + ' ' + semResults);
  console.log('OK: sem o campo results, cai na leitura antiga'); } });
