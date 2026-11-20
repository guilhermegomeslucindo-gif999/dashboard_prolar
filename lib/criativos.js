// Busca no Meta os anúncios de uma conta (com campanha e conjunto) e o resultado que cada um persegue.
//
// Feito para gastar o mínimo do limite de consultas do Meta. Por abertura do painel:
//   1. uma consulta de métricas, só dos anúncios que tiveram entrega no período;
//   2. uma consulta dos anúncios ativos agora, já com campanha, conjunto e capa;
//   3. só se preciso: detalhes dos anúncios que rodaram e não estão mais ativos (50 por consulta);
//   4. só se houver campanha de evento personalizado (ex.: "Lead Agendar"): a coluna Resultados dessas campanhas;
//   5. só se houver campanha otimizando conversão personalizada: o nome dela.
const { makeGraph } = require('./graph.js');
const { chaveDoConjunto, contaResultados, metricas, rotulos, completaEvento } = require('./resultados.js');

const INSIGHTS = 'ad_id,adset_id,campaign_id,spend,impressions,reach,clicks,inline_link_clicks,actions,conversions,video_thruplay_watched_actions';
const AD_FIELDS = 'id,name,effective_status,campaign_id,adset_id,preview_shareable_link,'
  + 'creative.thumbnail_width(480).thumbnail_height(600){thumbnail_url,image_url,object_type,video_id},'
  + 'adset{id,name,optimization_goal,promoted_object},campaign{id,name,objective,effective_status}';

// Para que o conjunto está otimizando, como está no Meta (mostrado no painel)
function resumoOtimizacao(adset) {
  if (!adset) return null;
  const po = adset.promoted_object || {};
  return {
    objetivo: adset.optimization_goal || null,
    evento: po.custom_event_type || null,
    evento_nome: po.custom_event_str || null,
    conversao_id: po.custom_conversion_id ? String(po.custom_conversion_id) : null,
  };
}

// A chave que mais pesou no investimento vira o resultado da campanha
function chaveDominante(itens) {
  const peso = new Map();
  for (const it of itens) if (it.chave) peso.set(it.chave, (peso.get(it.chave) || 0) + it.spend + 1e-6);
  let melhor = null;
  for (const [k, v] of peso) if (!melhor || v > peso.get(melhor)) melhor = k;
  return melhor;
}

const somaObj = (alvo, fonte) => {
  for (const [k, v] of Object.entries(fonte)) alvo[k] = (alvo[k] || 0) + (Number(v) || 0);
  return alvo;
};

module.exports = async function criativos({ token, version, appSecret, conta, start, end }) {
  const { graph, byIds } = makeGraph(token, version || 'v23.0', appSecret);
  const act = `/act_${conta.id}`;
  const periodo = { time_range: { since: start, until: end }, use_unified_attribution_setting: true };

  // 1 e 2: métricas por anúncio + anúncios ativos (em paralelo)
  const [adRowsAll, adsAtivos] = await Promise.all([
    graph(`${act}/insights`, { level: 'ad', fields: INSIGHTS, limit: 500, ...periodo }),
    graph(`${act}/ads`, { fields: AD_FIELDS, filtering: [{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }], limit: 100 }),
  ]);
  const adRows = adRowsAll.filter((r) => Number(r.spend) > 0 || Number(r.impressions) > 0);

  // 3: detalhes dos que rodaram no período e não estão ativos
  const adInfo = new Map(adsAtivos.map((a) => [String(a.id), a]));
  const extra = await byIds(adRows.map((r) => r.ad_id).filter((id) => !adInfo.has(String(id))), AD_FIELDS);
  for (const [k, v] of extra) adInfo.set(k, v);

  const adCur = new Map(adRows.map((r) => [String(r.ad_id), r]));
  const adIds = new Set([...adCur.keys(), ...adsAtivos.map((a) => String(a.id))]);
  const anuncios = [...adIds].map((id) => {
    const e = adInfo.get(id) || {};
    const r = adCur.get(id) || {};
    const cr = e.creative || {};
    const adset = e.adset || null;
    const camp = e.campaign || {};
    const chave = chaveDoConjunto(adset);
    return {
      id,
      nome: e.name || id,
      status: e.effective_status || '',
      campanha_id: String(camp.id || e.campaign_id || r.campaign_id || ''),
      campanha: camp.name || '',
      campanha_status: camp.effective_status || '',
      campanha_objetivo: camp.objective || '',
      conjunto_id: String((adset && adset.id) || e.adset_id || r.adset_id || ''),
      conjunto: (adset && adset.name) || '',
      formato: cr.video_id || cr.object_type === 'VIDEO' ? 'video' : 'imagem',
      capa: cr.thumbnail_url || cr.image_url || '',
      preview: e.preview_shareable_link || '',
      chave,
      otimizacao: resumoOtimizacao(adset),
      m: metricas(r),
      conv: contaResultados(r),
    };
  });

  // 4: eventos personalizados (ex.: "Lead Agendar"). O Meta soma todos os eventos personalizados num número só,
  // então pedimos a coluna Resultados do Gerenciador, só para as campanhas que precisam, numa consulta pequena.
  const campsEvento = [...new Set(anuncios.filter((a) => a.chave && a.chave.startsWith('evento:') && adCur.has(a.id)).map((a) => a.campanha_id))];
  let porResultado = null;
  if (campsEvento.length) {
    try {
      const rows = await graph(`${act}/insights`, {
        level: 'ad', fields: 'ad_id,results', limit: 500, ...periodo,
        filtering: [{ field: 'campaign.id', operator: 'IN', value: campsEvento }],
      });
      porResultado = new Map(rows.map((r) => [String(r.ad_id), contaResultados(r).resultado_meta]));
    } catch (e) {
      if (e.code === 17 || e.code === 4 || e.code === 80004) throw e; // limite do Meta: não insiste
      porResultado = null; // a API não aceitou o campo: usa o total de eventos personalizados
    }
  }
  for (const a of anuncios) {
    if (porResultado && porResultado.has(a.id) && porResultado.get(a.id) != null) a.conv.resultado_meta = porResultado.get(a.id);
    completaEvento(a.conv, a.chave, porResultado != null);
  }

  // Campanhas: montadas a partir dos anúncios (não gasta consulta extra)
  const porCamp = new Map();
  for (const a of anuncios) {
    if (!a.campanha_id) continue;
    const c = porCamp.get(a.campanha_id) || {
      id: a.campanha_id, nome: a.campanha || a.campanha_id, status: a.campanha_status, objetivo: a.campanha_objetivo,
      m: {}, conv: {}, itens: [], otimizacoes: [],
    };
    somaObj(c.m, a.m);
    somaObj(c.conv, a.conv);
    c.itens.push({ chave: a.chave, spend: a.m.spend });
    if (a.otimizacao) c.otimizacoes.push({ chave: a.chave, o: a.otimizacao });
    porCamp.set(a.campanha_id, c);
  }
  const campanhas = [...porCamp.values()].map((c) => {
    const chave = chaveDominante(c.itens);
    const ot = c.otimizacoes.find((x) => x.chave === chave);
    return { id: c.id, nome: c.nome, status: c.status, objetivo: c.objetivo, chave, otimizacao: ot ? ot.o : null, m: c.m, conv: c.conv };
  });

  // 5: nomes das conversões personalizadas, só se alguma campanha otimiza uma delas
  let nomesCustom = new Map();
  if (anuncios.some((a) => a.chave && a.chave.startsWith('custom:'))) {
    const lista = await graph(`${act}/customconversions`, { fields: 'id,name', limit: 200 }).catch(() => []);
    nomesCustom = new Map((Array.isArray(lista) ? lista : []).map((c) => [String(c.id), c.name]));
  }
  const eventos = new Set();
  for (const x of anuncios) {
    if (x.chave && x.chave.startsWith('evento:')) eventos.add(x.chave);
    for (const k of Object.keys(x.conv)) if (k.startsWith('evento:')) eventos.add(k);
  }

  return {
    conta: { slug: conta.slug, id: conta.id, nome: conta.nome, moeda: 'BRL', tema: conta.tema },
    campanhas,
    anuncios,
    rotulos: rotulos(nomesCustom, [...eventos]),
  };
};
