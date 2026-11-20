// Busca no Meta as campanhas e os anúncios de uma conta, com o resultado que cada campanha persegue.
const { makeGraph } = require('./graph.js');
const { chaveDoConjunto, contaResultados, metricas, rotulos, completaEvento } = require('./resultados.js');

const INSIGHTS = 'spend,impressions,reach,clicks,inline_link_clicks,actions,conversions,action_values,video_thruplay_watched_actions';
const AD_FIELDS = 'id,name,effective_status,campaign_id,adset_id,adset{id,name},preview_shareable_link,'
  + 'creative.thumbnail_width(480).thumbnail_height(600){thumbnail_url,image_url,object_type,video_id}';
const ADSET_FIELDS = 'id,name,campaign_id,effective_status,optimization_goal,promoted_object';
const CAMP_FIELDS = 'id,name,objective,effective_status';

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

module.exports = async function criativos({ token, version, appSecret, conta, start, end }) {
  const { graph, byIds } = makeGraph(token, version || 'v23.0', appSecret);
  const act = `/act_${conta.id}`;
  // Pede também o campo "results" (o mesmo número da coluna Resultados do Gerenciador).
  // Se a versão da API não aceitar esse campo, busca de novo sem ele.
  let semResults = false;
  const insightsBase = (level, fields) => graph(`${act}/insights`, {
    level, fields, time_range: { since: start, until: end }, use_unified_attribution_setting: true, limit: 500,
  });
  const insights = async (level, fields) => {
    if (semResults) return insightsBase(level, fields);
    try {
      return await insightsBase(level, fields + ',results');
    } catch (e) {
      if (e.code === 100 || /results/i.test(e.message || '')) {
        semResults = true;
        return insightsBase(level, fields);
      }
      throw e;
    }
  };
  const ativos = (edge, fields) => graph(`${act}/${edge}`, {
    fields, filtering: [{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }], limit: 200,
  });

  const [info, campRows, adRows, campAtivas, conjAtivos, adsAtivos, custom] = await Promise.all([
    graph(act, { fields: 'name,currency' }),
    insights('campaign', 'campaign_id,campaign_name,' + INSIGHTS),
    insights('ad', 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,' + INSIGHTS),
    ativos('campaigns', CAMP_FIELDS),
    ativos('adsets', ADSET_FIELDS),
    ativos('ads', AD_FIELDS),
    graph(`${act}/customconversions`, { fields: 'id,name', limit: 200 }).catch(() => []),
  ]);

  // Completa os detalhes de campanhas, conjuntos e anúncios que rodaram no período mas não estão ativos
  const campInfo = new Map(campAtivas.map((c) => [String(c.id), c]));
  const conjInfo = new Map(conjAtivos.map((c) => [String(c.id), c]));
  const adInfo = new Map(adsAtivos.map((a) => [String(a.id), a]));
  const [campExtra, conjExtra, adExtra] = await Promise.all([
    byIds(campRows.map((r) => r.campaign_id).filter((id) => !campInfo.has(String(id))), CAMP_FIELDS),
    byIds([...adRows.map((r) => r.adset_id), ...adsAtivos.map((a) => a.adset_id)].filter((id) => id && !conjInfo.has(String(id))), ADSET_FIELDS),
    byIds(adRows.map((r) => r.ad_id).filter((id) => !adInfo.has(String(id))), AD_FIELDS),
  ]);
  for (const [k, v] of campExtra) campInfo.set(k, v);
  for (const [k, v] of conjExtra) conjInfo.set(k, v);
  for (const [k, v] of adExtra) adInfo.set(k, v);

  // Anúncios: os que rodaram no período + os ativos agora (mesmo sem gasto ainda)
  const adCur = new Map(adRows.map((r) => [String(r.ad_id), r]));
  const adIds = new Set([...adCur.keys(), ...adsAtivos.map((a) => String(a.id))]);
  const anuncios = [...adIds].map((id) => {
    const e = adInfo.get(id) || {};
    const r = adCur.get(id) || {};
    const cr = e.creative || {};
    const conjuntoId = String(e.adset_id || (e.adset && e.adset.id) || r.adset_id || '');
    const campanhaId = String(e.campaign_id || r.campaign_id || '');
    const m = metricas(r);
    const chave = chaveDoConjunto(conjInfo.get(conjuntoId));
    return {
      id,
      nome: e.name || r.ad_name || id,
      status: e.effective_status || '',
      campanha_id: campanhaId,
      campanha: (campInfo.get(campanhaId) || {}).name || r.campaign_name || '',
      conjunto_id: conjuntoId,
      conjunto: (e.adset && e.adset.name) || (conjInfo.get(conjuntoId) || {}).name || r.adset_name || '',
      formato: cr.video_id || cr.object_type === 'VIDEO' ? 'video' : 'imagem',
      capa: cr.thumbnail_url || cr.image_url || '',
      preview: e.preview_shareable_link || '',
      chave,
      otimizacao: resumoOtimizacao(conjInfo.get(conjuntoId)),
      m,
      conv: completaEvento(contaResultados(r), chave),
    };
  });

  // Campanhas: as que rodaram no período + as ativas agora
  const campCur = new Map(campRows.map((r) => [String(r.campaign_id), r]));
  const campIds = new Set([...campCur.keys(), ...campAtivas.map((c) => String(c.id))]);
  const campanhas = [...campIds].map((id) => {
    const e = campInfo.get(id) || {};
    const r = campCur.get(id);
    const seus = anuncios.filter((a) => a.campanha_id === id);
    const conjs = [...conjInfo.values()].filter((c) => String(c.campaign_id) === id);
    const chave = chaveDominante(seus.map((a) => ({ chave: a.chave, spend: a.m.spend })))
      || chaveDominante(conjs.map((c) => ({ chave: chaveDoConjunto(c), spend: 0 })));
    const conj = conjs.find((c) => chaveDoConjunto(c) === chave) || conjs[0];
    const anuncioRef = seus.find((a) => a.chave === chave);
    return {
      id,
      nome: e.name || (r && r.campaign_name) || id,
      status: e.effective_status || '',
      objetivo: e.objective || '',
      chave,
      otimizacao: conj ? resumoOtimizacao(conj) : anuncioRef ? anuncioRef.otimizacao : null,
      m: metricas(r),
      conv: completaEvento(contaResultados(r), chave),
    };
  });

  const nomesCustom = new Map((Array.isArray(custom) ? custom : []).map((c) => [String(c.id), c.name]));
  const eventos = new Set();
  for (const x of [...anuncios, ...campanhas]) {
    if (x.chave && x.chave.startsWith('evento:')) eventos.add(x.chave);
    for (const k of Object.keys(x.conv)) if (k.startsWith('evento:')) eventos.add(k);
  }
  return {
    conta: { slug: conta.slug, id: conta.id, nome: info.name || conta.nome, moeda: info.currency || 'BRL', tema: conta.tema },
    campanhas,
    anuncios,
    rotulos: rotulos(nomesCustom, [...eventos]),
  };
};
