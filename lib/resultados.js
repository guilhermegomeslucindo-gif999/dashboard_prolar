// Como cada tipo de resultado é contado, e qual resultado cada conjunto de anúncios persegue no Meta.
//
// O Meta guarda os eventos em dois lugares: `actions` (lead, conversa, clique, compra...) e
// `conversions` (eventos mais novos como Entre em contato e Agendar). Procuramos nos dois.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// chave → { rótulo, tipos de evento (o primeiro que existir é usado, para não contar em dobro) }
const TIPOS = {
  contato: { rotulo: 'Entre em contato', eventos: ['contact_total', 'contact_website', 'offsite_conversion.fb_pixel_contact', 'onsite_web_contact'] },
  agendar: { rotulo: 'Agendamentos', eventos: ['schedule_total', 'schedule_website', 'offsite_conversion.fb_pixel_schedule', 'onsite_web_schedule'] },
  lead_site: { rotulo: 'Leads no site', eventos: ['offsite_conversion.fb_pixel_lead'] },
  formulario: { rotulo: 'Leads de formulário', eventos: ['onsite_conversion.lead_grouped', 'leadgen_grouped'] },
  lead: { rotulo: 'Leads (todos)', eventos: ['lead'] },
  conversa: { rotulo: 'Conversas iniciadas', eventos: ['onsite_conversion.messaging_conversation_started_7d'] },
  cadastro: { rotulo: 'Cadastros', eventos: ['complete_registration', 'offsite_conversion.fb_pixel_complete_registration'] },
  envio: { rotulo: 'Envios de cadastro', eventos: ['submit_application_total', 'submit_application_website', 'offsite_conversion.fb_pixel_submit_application'] },
  compra: { rotulo: 'Compras', eventos: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'] },
  lpv: { rotulo: 'Visualizações da página', eventos: ['landing_page_view'] },
  clique: { rotulo: 'Cliques no link', campo: 'inline_link_clicks' },
  thruplay: { rotulo: 'ThruPlays', campo: 'thruplay' },
  engajamento: { rotulo: 'Engajamentos', eventos: ['post_engagement'] },
  alcance: { rotulo: 'Alcance', campo: 'reach' },
};

const CONHECIDOS = new Set(Object.values(TIPOS).flatMap((t) => t.eventos || []));

const EVENTO_PADRAO = {
  LEAD: 'lead_site', CONTACT: 'contato', SCHEDULE: 'agendar', COMPLETE_REGISTRATION: 'cadastro',
  SUBMIT_APPLICATION: 'envio', PURCHASE: 'compra',
};

// Qual resultado um conjunto de anúncios persegue (objetivo de otimização + evento escolhido)
function chaveDoConjunto(adset) {
  if (!adset) return null;
  const g = adset.optimization_goal || '';
  const po = adset.promoted_object || {};
  if (g === 'LEAD_GENERATION' || g === 'QUALITY_LEAD') return 'formulario';
  if (g === 'OFFSITE_CONVERSIONS' || g === 'VALUE' || g === 'QUALITY_CALL') {
    if (po.custom_conversion_id) return 'custom:' + po.custom_conversion_id;
    if (EVENTO_PADRAO[po.custom_event_type]) return EVENTO_PADRAO[po.custom_event_type];
    // Evento personalizado do pixel (ex.: "Agendar" criado no site) ou evento padrão que não está na lista
    if (po.custom_event_str) return 'evento:' + po.custom_event_str;
    if (po.custom_event_type) return 'evento:' + po.custom_event_type;
    return 'lead_site';
  }
  if (g === 'CONVERSATIONS' || g === 'REPLIES' || g === 'MESSAGING_PURCHASE_CONVERSION') return 'conversa';
  if (g === 'LINK_CLICKS' || g === 'PROFILE_VISIT') return 'clique';
  if (g === 'LANDING_PAGE_VIEWS') return 'lpv';
  if (g === 'THRUPLAY' || g === 'VIDEO_VIEWS') return 'thruplay';
  if (g === 'POST_ENGAGEMENT' || g === 'PAGE_LIKES' || g === 'EVENT_RESPONSES') return 'engajamento';
  if (g === 'REACH' || g === 'IMPRESSIONS' || g === 'AD_RECALL_LIFT') return 'alcance';
  return null;
}

// Conta todos os tipos de resultado de uma linha de insights do Meta
function contaResultados(row) {
  const r = row || {};
  const todos = [...(r.actions || []), ...(r.conversions || [])];
  const porTipo = new Map();
  for (const a of todos) {
    if (!porTipo.has(a.action_type)) porTipo.set(a.action_type, num(a.value));
  }
  const out = {};
  for (const [k, t] of Object.entries(TIPOS)) {
    if (t.campo === 'inline_link_clicks') out[k] = num(r.inline_link_clicks);
    else if (t.campo === 'reach') out[k] = num(r.reach);
    else if (t.campo === 'thruplay') out[k] = (r.video_thruplay_watched_actions || []).reduce((s, a) => s + num(a.value), 0);
    else {
      const ev = t.eventos.find((e) => porTipo.has(e));
      out[k] = ev ? porTipo.get(ev) : 0;
    }
  }
  // Conversões personalizadas: offsite_conversion.custom.<id>
  for (const [tipo, v] of porTipo) {
    const m = /^offsite_conversion\.custom\.(\d+)$/.exec(tipo);
    if (m) out['custom:' + m[1]] = v;
  }
  // Total de eventos personalizados do pixel (o Meta não separa por nome)
  out.evento_custom = porTipo.get('offsite_conversion.fb_pixel_custom') || 0;
  // Coluna "Resultados" do Gerenciador, quando o Meta envia (campo results)
  const rm = resultadoMeta(r.results);
  if (rm != null) out.resultado_meta = rm;
  // Eventos padrão fora da lista: offsite_conversion.fb_pixel_<nome>
  for (const [tipo, v] of porTipo) {
    const m = /^offsite_conversion\.fb_pixel_([a-z_]+)$/.exec(tipo);
    if (m && m[1] !== 'custom' && !CONHECIDOS.has(tipo)) out['evento:' + m[1].toUpperCase()] = v;
  }
  return out;
}

function metricas(row) {
  const r = row || {};
  const tresSeg = (r.actions || []).find((a) => a.action_type === 'video_view');
  return {
    spend: num(r.spend),
    impressions: num(r.impressions),
    reach: num(r.reach),
    clicks: num(r.clicks),
    link_clicks: num(r.inline_link_clicks),
    video_3s: tresSeg ? num(tresSeg.value) : 0,
    thruplay: (r.video_thruplay_watched_actions || []).reduce((s, a) => s + num(a.value), 0),
  };
}

// Preenche o resultado de chaves "evento:..." (eventos personalizados) a partir do total de eventos personalizados
// Lê o campo "results" do Meta: [{indicator, values: [{value}]}] → número
function resultadoMeta(results) {
  if (!Array.isArray(results) || !results.length) return null;
  let total = 0;
  let achou = false;
  for (const r of results) {
    const vals = Array.isArray(r.values) ? r.values : [r];
    for (const v of vals) {
      if (v && v.value != null && Number.isFinite(Number(v.value))) { total += Number(v.value); achou = true; }
    }
  }
  return achou ? total : null;
}

// Eventos personalizados (ex.: "Lead Agendar"): o Meta soma todos no mesmo tipo de ação.
// Por isso usamos a coluna Resultados do Gerenciador quando ela vem; senão, o total de eventos personalizados.
function completaEvento(conv, chave) {
  if (chave && chave.startsWith('evento:') && conv[chave] == null) {
    conv[chave] = conv.resultado_meta != null ? conv.resultado_meta : conv.evento_custom || 0;
  }
  return conv;
}

function rotulos(customNames, eventos) {
  const out = {};
  for (const k of eventos || []) {
    const nome = k.slice(7);
    // Evento com nome dado pela equipe (ex.: "Lead Agendar") aparece como está; evento padrão do Meta (ex.: VIEW_CONTENT) é traduzido para leitura
    out[k] = /[a-z]/.test(nome) ? nome : 'Evento: ' + nome.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  }
  for (const [k, t] of Object.entries(TIPOS)) out[k] = t.rotulo;
  for (const [id, nome] of customNames) out['custom:' + id] = 'Conversão: ' + nome;
  out.evento_custom = 'Eventos personalizados (todos)';
  out.resultado_meta = 'Resultados (como no Gerenciador)';
  return out;
}

module.exports = { TIPOS, chaveDoConjunto, contaResultados, metricas, rotulos, completaEvento };
