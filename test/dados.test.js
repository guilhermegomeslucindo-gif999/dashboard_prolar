// Testa api/dados.js com respostas simuladas da API do Meta (sem rede). Rode com: npm test
const assert = require('assert');
process.env.META_ACCESS_TOKEN = 'TOKEN_DE_TESTE';

const a = (type, value) => ({ action_type: type, value: String(value) });
const pedidos = [];

function respond(u) {
  const url = new URL(u);
  const p = url.pathname.replace(/^\/v[\d.]+/, '');
  const level = url.searchParams.get('level');
  pedidos.push(p + (level ? '?' + level : '') + (url.searchParams.get('ids') ? '?ids=' + url.searchParams.get('ids') : ''));
  if (p !== '/' && !p.startsWith('/act_2323497894507847')) throw new Error('consultou conta não permitida: ' + p);

  if (p === '/act_2323497894507847') return { name: 'Prolar Netimóveis', currency: 'BRL' };
  if (p.endsWith('/insights') && level === 'campaign') {
    return { data: [
      { campaign_id: 'C1', campaign_name: '[SITE] Contato', spend: '300', impressions: '20000', reach: '9000', inline_link_clicks: '400',
        actions: [a('link_click', 410), a('lead', 2)], conversions: [a('contact_total', 30), a('contact_website', 30)] },
      { campaign_id: 'C2', campaign_name: '[FORM] Leads', spend: '200', impressions: '15000', reach: '7000', inline_link_clicks: '90',
        actions: [a('onsite_conversion.lead_grouped', 25), a('lead', 25)] },
    ] };
  }
  if (p.endsWith('/insights') && level === 'ad') {
    return { data: [
      { ad_id: 'A1', ad_name: 'Vídeo apto 2q', adset_id: 'S1', adset_name: 'Contato BH', campaign_id: 'C1', campaign_name: '[SITE] Contato',
        spend: '200', impressions: '12000', reach: '6000', inline_link_clicks: '250',
        actions: [a('video_view', 3000)], conversions: [a('contact_total', 20)], video_thruplay_watched_actions: [a('video_view', 900)] },
      { ad_id: 'A2', ad_name: 'Carrossel cobertura', adset_id: 'S2', adset_name: 'Agendar visita', campaign_id: 'C1', campaign_name: '[SITE] Contato',
        spend: '100', impressions: '8000', reach: '4000', inline_link_clicks: '150',
        actions: [a('offsite_conversion.fb_pixel_custom', 6), a('offsite_conversion.fb_pixel_lead', 1), a('offsite_conversion.fb_pixel_view_content', 50)],
        conversions: [a('contact_total', 10), a('schedule_total', 4)] },
      { ad_id: 'A3', ad_name: 'Form lançamento', adset_id: 'S3', adset_name: 'Form', campaign_id: 'C2', campaign_name: '[FORM] Leads',
        spend: '200', impressions: '15000', reach: '7000', inline_link_clicks: '90', actions: [a('onsite_conversion.lead_grouped', 25), a('lead', 25)] },
    ] };
  }
  if (p.endsWith('/campaigns')) return { data: [{ id: 'C1', name: '[SITE] Contato', objective: 'OUTCOME_LEADS', effective_status: 'ACTIVE' },
    { id: 'C9', name: 'Campanha nova', objective: 'OUTCOME_LEADS', effective_status: 'ACTIVE' }] };
  if (p.endsWith('/adsets')) return { data: [
    { id: 'S1', campaign_id: 'C1', optimization_goal: 'OFFSITE_CONVERSIONS', promoted_object: { pixel_id: '1', custom_event_type: 'CONTACT' } },
    { id: 'S2', campaign_id: 'C1', optimization_goal: 'OFFSITE_CONVERSIONS', promoted_object: { pixel_id: '1', custom_event_type: 'OTHER', custom_event_str: 'Agendar' } },
    { id: 'S9', campaign_id: 'C9', optimization_goal: 'LEAD_GENERATION', promoted_object: { page_id: '1' } },
  ] };
  if (p.endsWith('/ads')) return { data: [
    { id: 'A1', name: 'Vídeo apto 2q', effective_status: 'ACTIVE', campaign_id: 'C1', adset_id: 'S1', adset: { id: 'S1', name: 'Contato BH' },
      preview_shareable_link: 'https://fb.me/a1', creative: { thumbnail_url: 'https://scontent.xx.fbcdn.net/a1.jpg', object_type: 'VIDEO', video_id: '9' } },
    { id: 'A9', name: 'Anúncio novo', effective_status: 'ACTIVE', campaign_id: 'C9', adset_id: 'S9', adset: { id: 'S9', name: 'Form novo' },
      preview_shareable_link: 'https://fb.me/a9', creative: { image_url: 'https://scontent.xx.fbcdn.net/a9.jpg', object_type: 'SHARE' } },
  ] };
  if (p.endsWith('/customconversions')) return { data: [] };
  if (p === '/' && url.searchParams.get('ids')) {
    const ids = url.searchParams.get('ids').split(',');
    const db = {
      C2: { id: 'C2', name: '[FORM] Leads', objective: 'OUTCOME_LEADS', effective_status: 'PAUSED' },
      S3: { id: 'S3', campaign_id: 'C2', optimization_goal: 'LEAD_GENERATION', promoted_object: { page_id: '1' } },
      A2: { id: 'A2', name: 'Carrossel cobertura', effective_status: 'PAUSED', campaign_id: 'C1', adset_id: 'S2', adset: { id: 'S2', name: 'Agendar visita' },
        preview_shareable_link: 'https://fb.me/a2', creative: { image_url: 'https://scontent.xx.fbcdn.net/a2.jpg', object_type: 'SHARE' } },
      A3: { id: 'A3', name: 'Form lançamento', effective_status: 'CAMPAIGN_PAUSED', campaign_id: 'C2', adset_id: 'S3', adset: { id: 'S3', name: 'Form' },
        preview_shareable_link: 'https://fb.me/a3', creative: { image_url: 'https://scontent.xx.fbcdn.net/a3.jpg' } },
    };
    const out = {};
    for (const id of ids) if (db[id]) out[id] = db[id];
    return out;
  }
  throw new Error('URL inesperada: ' + u);
}

global.fetch = async (u) => ({ status: 200, json: async () => respond(u) });
const handler = require('../api/dados.js');
const run = (query) => new Promise((resolve) => {
  const headers = {};
  const res = { statusCode: 0, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, end: (b) => resolve({ status: res.statusCode, headers, body: JSON.parse(b) }) };
  handler({ query, url: '/api/dados' }, res);
});

(async () => {
  const { status, body, headers } = await run({ conta: 'net', start: '2026-11-01', end: '2026-11-19' });
  assert.strictEqual(status, 200, JSON.stringify(body));
  assert.strictEqual(headers['cache-control'], 's-maxage=900, stale-while-revalidate=86400');
  assert.strictEqual(body.conta.slug, 'net');
  assert.strictEqual(body.conta.tema, 'net');
  assert.deepStrictEqual(body.contas.map((c) => c.slug), ['net', 'class']);

  // Resultado de cada anúncio = o evento que o conjunto dele otimiza
  const ad = (id) => body.anuncios.find((x) => x.id === id);
  assert.strictEqual(ad('A1').chave, 'contato');
  assert.strictEqual(ad('A1').conv.contato, 20);
  assert.strictEqual(ad('A1').m.video_3s, 3000);
  assert.strictEqual(ad('A1').m.thruplay, 900);
  assert.strictEqual(ad('A1').formato, 'video');
  assert.strictEqual(ad('A2').chave, 'evento:Agendar', 'evento personalizado do pixel');
  assert.strictEqual(ad('A2').conv['evento:Agendar'], 6);
  assert.strictEqual(ad('A2').conv.agendar, 4);
  assert.strictEqual(ad('A2').conv['evento:VIEW_CONTENT'], 50, 'evento padrão fora da lista');
  assert.strictEqual(ad('A2').conv['evento:LEAD'], undefined, 'lead já é contado em lead_site');
  assert.deepStrictEqual(ad('A2').otimizacao, { objetivo: 'OFFSITE_CONVERSIONS', evento: 'OTHER', evento_nome: 'Agendar', conversao_id: null });
  assert.strictEqual(body.rotulos['evento:Agendar'], 'Evento: Agendar');
  assert.strictEqual(body.rotulos['evento:VIEW_CONTENT'], 'Evento: View content');
  assert.strictEqual(ad('A2').conv.contato, 10);
  assert.strictEqual(ad('A2').status, 'PAUSED');
  assert.strictEqual(ad('A2').capa, 'https://scontent.xx.fbcdn.net/a2.jpg');
  assert.strictEqual(ad('A3').chave, 'formulario');
  assert.strictEqual(ad('A3').conv.formulario, 25);
  // Anúncio ativo sem gasto aparece
  assert.strictEqual(ad('A9').chave, 'formulario');
  assert.strictEqual(ad('A9').m.spend, 0);

  // Resultado da campanha = o que mais pesou no investimento
  const camp = (id) => body.campanhas.find((x) => x.id === id);
  assert.strictEqual(camp('C1').chave, 'contato');
  assert.strictEqual(camp('C1').conv.contato, 30, 'contact_total sem somar contact_website');
  assert.strictEqual(camp('C2').chave, 'formulario');
  assert.strictEqual(camp('C2').status, 'PAUSED');
  assert.strictEqual(camp('C9').chave, 'formulario', 'campanha nova sem gasto usa o objetivo do conjunto');
  assert.strictEqual(body.rotulos.contato, 'Entre em contato');
  assert.ok(!JSON.stringify(body).includes('TOKEN_DE_TESTE'));

  // Conta fora da lista nunca é consultada: cai na primeira permitida
  const outra = await run({ conta: '../act_999', start: '2026-11-01', end: '2026-11-19' });
  assert.strictEqual(outra.body.conta.slug, 'net');

  assert.strictEqual((await run({ conta: 'net', start: '2026-11-19', end: '2026-11-01' })).status, 400);

  global.fetch = async () => ({ status: 400, json: async () => ({ error: { message: 'Error validating access token', code: 190 } }) });
  const bad = await run({ conta: 'net' });
  assert.strictEqual(bad.status, 502);
  assert.ok(/expirou ou é inválido/.test(bad.body.error));

  delete process.env.META_ACCESS_TOKEN;
  assert.strictEqual((await run({})).status, 500);
  console.log('OK: todos os testes passaram');
})().catch((e) => { console.error(e); process.exit(1); });
