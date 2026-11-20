// Testa api/dados.js com respostas simuladas da API do Meta (sem rede). Rode com: npm test
const assert = require('assert');
process.env.META_ACCESS_TOKEN = 'TOKEN_DE_TESTE';

const a = (type, value) => ({ action_type: type, value: String(value) });
let pedidos = [];

const ADSETS = {
  S1: { id: 'S1', name: 'Contato BH', optimization_goal: 'OFFSITE_CONVERSIONS', promoted_object: { pixel_id: '1', custom_event_type: 'CONTACT' } },
  S2: { id: 'S2', name: 'Agendar visita', optimization_goal: 'OFFSITE_CONVERSIONS', promoted_object: { pixel_id: '1', custom_event_type: 'OTHER', custom_event_str: 'Lead Agendar' } },
  S3: { id: 'S3', name: 'Form', optimization_goal: 'LEAD_GENERATION', promoted_object: { page_id: '1' } },
  S9: { id: 'S9', name: 'Form novo', optimization_goal: 'LEAD_GENERATION', promoted_object: { page_id: '1' } },
};
const CAMPS = {
  C1: { id: 'C1', name: '🟧 [QH4] [VENDA] [SITE] [LEAD CONTATO] Venda BH', objective: 'OUTCOME_LEADS', effective_status: 'ACTIVE' },
  C2: { id: 'C2', name: '[FORM] Leads', objective: 'OUTCOME_LEADS', effective_status: 'PAUSED' },
  C9: { id: 'C9', name: 'Campanha nova', objective: 'OUTCOME_LEADS', effective_status: 'ACTIVE' },
};
const ad = (id, name, st, c, s, creative, preview) => ({ id, name, effective_status: st, campaign_id: c, adset_id: s, adset: ADSETS[s], campaign: CAMPS[c], creative, preview_shareable_link: preview });
const ADS = {
  A1: ad('A1', 'Vídeo apto 2q', 'ACTIVE', 'C1', 'S1', { thumbnail_url: 'https://scontent.xx.fbcdn.net/a1.jpg', object_type: 'VIDEO', video_id: '9' }, 'https://fb.me/a1'),
  A2: ad('A2', 'Carrossel cobertura', 'PAUSED', 'C1', 'S2', { image_url: 'https://scontent.xx.fbcdn.net/a2.jpg', object_type: 'SHARE' }, 'https://fb.me/a2'),
  A3: ad('A3', 'Form lançamento', 'CAMPAIGN_PAUSED', 'C2', 'S3', { image_url: 'https://scontent.xx.fbcdn.net/a3.jpg' }, 'https://fb.me/a3'),
  A4: ad('A4', 'Agendar sem resultado', 'PAUSED', 'C1', 'S2', {}, ''),
  A9: ad('A9', 'Anúncio novo', 'ACTIVE', 'C9', 'S9', { image_url: 'https://scontent.xx.fbcdn.net/a9.jpg', object_type: 'SHARE' }, 'https://fb.me/a9'),
};

let modo = 'ok';
function respond(u) {
  const url = new URL(u);
  const p = url.pathname.replace(/^\/v[\d.]+/, '');
  const fields = url.searchParams.get('fields') || '';
  pedidos.push(p + (url.searchParams.get('ids') ? '?ids=' + url.searchParams.get('ids') : '') + (fields.includes('results') ? '?results' : ''));
  if (p !== '/' && !p.startsWith('/act_2323497894507847') && !p.startsWith('/act_1991972537945170')) throw new Error('consultou conta não permitida: ' + p);
  if (modo === 'limite') return { error: { message: 'User request limit reached', code: 17 } };

  if (p.endsWith('/insights') && fields.includes('results')) {
    if (modo === 'semresults') return { error: { message: '(#100) results is not a valid field', code: 100 } };
    assert.ok(url.searchParams.get('filtering').includes('campaign.id'), 'coluna Resultados só das campanhas de evento');
    return { data: [{ ad_id: 'A2', results: [{ indicator: 'actions:offsite_conversion.fb_pixel_custom', values: [{ value: '1' }] }] }, { ad_id: 'A4' }] };
  }
  if (p.endsWith('/insights')) {
    assert.strictEqual(url.searchParams.get('level'), 'ad');
    return { data: [
      { ad_id: 'A1', adset_id: 'S1', campaign_id: 'C1', spend: '200', impressions: '12000', reach: '6000', inline_link_clicks: '250',
        actions: [a('video_view', 3000)], conversions: [a('contact_total', 20)], video_thruplay_watched_actions: [a('video_view', 900)] },
      { ad_id: 'A2', adset_id: 'S2', campaign_id: 'C1', spend: '100', impressions: '8000', reach: '4000', inline_link_clicks: '150',
        actions: [a('offsite_conversion.fb_pixel_custom', 6), a('offsite_conversion.fb_pixel_lead', 1), a('offsite_conversion.fb_pixel_view_content', 50)],
        conversions: [a('contact_total', 10)] },
      { ad_id: 'A4', adset_id: 'S2', campaign_id: 'C1', spend: '30', impressions: '900', inline_link_clicks: '10', actions: [a('offsite_conversion.fb_pixel_custom', 2)] },
      { ad_id: 'A3', adset_id: 'S3', campaign_id: 'C2', spend: '200', impressions: '15000', reach: '7000', inline_link_clicks: '90', actions: [a('onsite_conversion.lead_grouped', 25), a('lead', 25)] },
      { ad_id: 'A_OLD', adset_id: 'S_OLD', campaign_id: 'C_OLD', spend: '0', impressions: '0' },
    ] };
  }
  if (p.endsWith('/ads')) return { data: [ADS.A1, ADS.A9] };
  if (p.endsWith('/customconversions')) return { data: [] };
  if (p === '/' && url.searchParams.get('ids')) {
    const out = {};
    for (const id of url.searchParams.get('ids').split(',')) if (ADS[id]) out[id] = ADS[id];
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
  assert.strictEqual(headers['cache-control'], 's-maxage=300, stale-while-revalidate=60, stale-if-error=86400');
  assert.strictEqual(body.conta.slug, 'net');
  assert.deepStrictEqual(body.contas.map((c) => c.slug), ['net', 'class']);

  // Poucas consultas: métricas + ativos + detalhes dos não ativos + coluna Resultados das campanhas de evento
  assert.strictEqual(pedidos.length, 4, 'consultas: ' + pedidos.join(' ; '));
  assert.ok(!pedidos.some((p) => /A_OLD|C_OLD|S_OLD/.test(p)), 'não busca detalhes de quem não rodou');

  const ad_ = (id) => body.anuncios.find((x) => x.id === id);
  assert.strictEqual(ad_('A1').chave, 'contato');
  assert.strictEqual(ad_('A1').conv.contato, 20);
  assert.strictEqual(ad_('A1').m.video_3s, 3000);
  assert.strictEqual(ad_('A1').m.thruplay, 900);
  assert.strictEqual(ad_('A1').formato, 'video');
  assert.strictEqual(ad_('A1').campanha, CAMPS.C1.name);
  assert.strictEqual(ad_('A1').conjunto, 'Contato BH');
  // Evento personalizado: usa a coluna Resultados (1), não o total de eventos personalizados (6)
  assert.strictEqual(ad_('A2').chave, 'evento:Lead Agendar');
  assert.strictEqual(ad_('A2').conv['evento:Lead Agendar'], 1);
  assert.strictEqual(ad_('A2').conv.evento_custom, 6);
  assert.strictEqual(ad_('A2').conv['evento:VIEW_CONTENT'], 50);
  assert.strictEqual(ad_('A2').conv['evento:LEAD'], undefined);
  assert.strictEqual(ad_('A2').status, 'PAUSED');
  assert.strictEqual(ad_('A4').conv['evento:Lead Agendar'], 0, 'sem resultado na coluna = zero, como no Gerenciador');
  assert.strictEqual(ad_('A3').chave, 'formulario');
  assert.strictEqual(ad_('A3').conv.formulario, 25);
  assert.strictEqual(ad_('A9').chave, 'formulario', 'anúncio ativo sem gasto aparece');
  assert.strictEqual(ad_('A9').m.spend, 0);
  assert.ok(!body.anuncios.some((x) => x.id === 'A_OLD'));

  const camp = (id) => body.campanhas.find((x) => x.id === id);
  assert.strictEqual(camp('C1').chave, 'contato');
  assert.strictEqual(camp('C1').m.spend, 330);
  assert.strictEqual(camp('C1').conv.contato, 30);
  assert.strictEqual(camp('C2').chave, 'formulario');
  assert.strictEqual(camp('C2').status, 'PAUSED');
  assert.strictEqual(camp('C9').chave, 'formulario');
  assert.ok(!body.campanhas.some((x) => x.id === 'C_OLD'));
  assert.strictEqual(body.rotulos['evento:Lead Agendar'], 'Lead Agendar');
  assert.ok(!JSON.stringify(body).includes('TOKEN_DE_TESTE'));

  // Mesma consulta de novo: vem da memória, sem consultar o Meta
  pedidos = [];
  await run({ conta: 'net', start: '2026-11-01', end: '2026-11-19' });
  assert.strictEqual(pedidos.length, 0, 'memória do servidor');
  // "Atualizar" logo em seguida também não consulta (menos de 1 minuto)
  await run({ conta: 'net', start: '2026-11-01', end: '2026-11-19', fresh: '1' });
  assert.strictEqual(pedidos.length, 0, 'Atualizar repetido não consulta');

  // Meta limitando: com dados guardados, mostra os últimos dados com aviso
  modo = 'limite';
  const realNow = Date.now;
  Date.now = () => realNow() + 10 * 60e3; // 10 minutos depois
  const lim = await run({ conta: 'net', start: '2026-11-01', end: '2026-11-19' });
  assert.strictEqual(lim.status, 200);
  assert.ok(/pausa/.test(lim.body.aviso));
  assert.strictEqual(lim.body.anuncios.length, body.anuncios.length);
  assert.strictEqual(pedidos.length, 2, 'no limite, não insiste: ' + pedidos.join(' ; '));
  // Sem dados guardados: erro amigável
  const lim2 = await run({ conta: 'class', start: '2026-11-01', end: '2026-11-19' });
  assert.strictEqual(lim2.status, 502);
  assert.ok(/pausa/.test(lim2.body.error));
  Date.now = realNow;

  // API que não aceita o campo results: usa o total de eventos personalizados
  modo = 'semresults';
  const sem = await run({ conta: 'net', start: '2026-10-01', end: '2026-10-19' });
  assert.strictEqual(sem.status, 200, JSON.stringify(sem.body));
  assert.strictEqual(sem.body.anuncios.find((x) => x.id === 'A2').conv['evento:Lead Agendar'], 6);
  modo = 'ok';

  // Conta fora da lista cai na primeira permitida; datas inválidas
  assert.strictEqual((await run({ conta: '../act_999', start: '2026-09-01', end: '2026-09-19' })).body.conta.slug, 'net');
  assert.strictEqual((await run({ conta: 'net', start: '2026-11-19', end: '2026-11-01' })).status, 400);

  global.fetch = async () => ({ status: 400, json: async () => ({ error: { message: 'Error validating access token', code: 190 } }) });
  const bad = await run({ conta: 'net', start: '2026-08-01', end: '2026-08-02' });
  assert.strictEqual(bad.status, 502);
  assert.ok(/expirou ou é inválido/.test(bad.body.error));

  delete process.env.META_ACCESS_TOKEN;
  assert.strictEqual((await run({})).status, 500);
  console.log('OK: todos os testes passaram');
})().catch((e) => { console.error(e); process.exit(1); });
