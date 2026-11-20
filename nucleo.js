/* Núcleo comum das variações do painel de criativos (Prolar · QH4).
   Busca de dados, cálculos, nomes legíveis e sinais de decisão. Cada variação cuida só do visual. */
(function () {
  'use strict';
  var PR = {};

  // ---------- Formatos ----------
  var brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  var int = new Intl.NumberFormat('pt-BR');
  var comp = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  var pct = function (v) { return (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; };
  var F = {
    spend: brl.format, cpr: brl.format, cpc: brl.format, cpm: brl.format, spend0: brl0.format,
    res: function (v) { return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }); },
    impressions: int.format, ativos: int.format, link_clicks: int.format, compacto: comp.format,
    ctr: pct, hook: pct, hold: pct, share: pct
  };
  PR.fmt = function (k, v) { return v == null || !isFinite(v) ? '—' : (F[k] || String)(v); };
  PR.fmtData = function (iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; };
  PR.fmtDataCurta = function (iso) {
    if (!iso) return '—';
    var m = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+iso.slice(5, 7) - 1];
    return +iso.slice(8, 10) + ' ' + m;
  };

  // ---------- Datas (São Paulo) ----------
  var hoje = function () { return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); };
  var soma = function (iso, d) { return new Date(Date.parse(iso + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10); };
  PR.PRESETS = {
    hoje: { rotulo: 'Hoje', f: function () { return { start: hoje(), end: hoje() }; } },
    '7': { rotulo: '7 dias', f: function () { return { start: soma(hoje(), -6), end: hoje() }; } },
    '14': { rotulo: '14 dias', f: function () { return { start: soma(hoje(), -13), end: hoje() }; } },
    '30': { rotulo: '30 dias', f: function () { return { start: soma(hoje(), -29), end: hoje() }; } },
    mes: { rotulo: 'Este mês', f: function () { return { start: hoje().slice(0, 8) + '01', end: hoje() }; } },
    anterior: { rotulo: 'Mês passado', f: function () { var f = soma(hoje().slice(0, 8) + '01', -1); return { start: f.slice(0, 8) + '01', end: f }; } }
  };
  PR.PRESET_ORDEM = ['hoje', '7', '14', '30', 'mes', 'anterior'];
  PR.presetAtual = function (S) {
    return Object.keys(PR.PRESETS).find(function (k) { var r = PR.PRESETS[k].f(); return r.start === S.start && r.end === S.end; }) || null;
  };
  var DAY = /^\d{4}-\d{2}-\d{2}$/;

  // ---------- Estado (URL + preferências do navegador) ----------
  PR.lePref = function (nome, padrao) { try { var v = localStorage.getItem('prolar-' + nome); return v == null ? padrao : v; } catch (e) { return padrao; } };
  PR.salvaPref = function (nome, v) { try { localStorage.setItem('prolar-' + nome, v); } catch (e) { /* sem armazenamento */ } };
  PR.estado = function (padraoPreset) {
    var u = new URLSearchParams(location.search), def = PR.PRESETS[padraoPreset || '7'].f();
    return {
      conta: u.get('conta') === 'class' ? 'class' : 'net',
      start: DAY.test(u.get('inicio') || '') ? u.get('inicio') : def.start,
      end: DAY.test(u.get('fim') || '') ? u.get('fim') : def.end,
      campanha: u.get('campanha') || null,
      modo: PR.lePref('modo', 'claro'),
      res: 'auto', busca: '', status: 'ativos',
      data: null, error: null, aviso: null, carregando: false, req: 0
    };
  };
  PR.salvaUrl = function (S) {
    var p = new URLSearchParams();
    p.set('conta', S.conta); p.set('inicio', S.start); p.set('fim', S.end);
    if (S.campanha) p.set('campanha', S.campanha);
    try { history.replaceState(null, '', location.pathname + '?' + p.toString()); } catch (e) { /* ignora */ }
  };

  // ---------- Dados ----------
  var CACHE = {};
  var ultimaAtualizacao = 0;
  function busca(conta, start, end, fresh) {
    var q = '/api/dados?conta=' + conta + '&start=' + start + '&end=' + end + (fresh ? '&fresh=' + Date.now() : '');
    return fetch(q, { cache: fresh ? 'no-store' : 'default' })
      .then(function (r) { return r.json().catch(function () { return { error: 'Resposta inválida do servidor (HTTP ' + r.status + ').' }; }); })
      .catch(function () { return { error: 'Não foi possível falar com o servidor. Confira a internet e tente de novo.' }; });
  }
  // Carrega a conta/período do estado e chama pronto() a cada mudança (início e fim da busca)
  PR.carregar = function (S, fresh, pronto) {
    var id = ++S.req, k = S.conta + '|' + S.start + '|' + S.end;
    S.error = null; S.aviso = null;
    if (fresh) ultimaAtualizacao = Date.now();
    if (!fresh && CACHE[k]) { S.data = CACHE[k]; S.carregando = false; pronto(); return; }
    if (S.data && S.data.conta && S.data.conta.slug !== S.conta) S.data = null;
    S.carregando = true; pronto();
    busca(S.conta, S.start, S.end, fresh).then(function (j) {
      if (!j.error && !j.aviso) CACHE[k] = j;
      if (id !== S.req) return;
      if (j.error) { if (S.data) S.aviso = j.error; else S.error = j.error; }
      else { S.data = j; S.aviso = j.aviso || null; }
      S.carregando = false; pronto();
    });
  };
  // "Atualizar" volta a ficar disponível 1 minuto depois do último clique (poupa o limite do Meta)
  PR.podeAtualizar = function () { return Date.now() - ultimaAtualizacao > 60000; };
  PR.esperaAtualizar = function () { return Math.max(0, 60000 - (Date.now() - ultimaAtualizacao)); };

  // ---------- Nomes legíveis ----------
  var SIGLAS = { BH: 1, IG: 1, WPP: 1, CJ: 1, AD: 1, ABO: 1, CBO: 1, LP: 1, CPA: 1, VID: 1, IMG: 1, QH4: 1, RMKT: 1, FB: 1, MG: 1, SP: 1, RJ: 1, CTA: 1, UGC: 1, VV: 1 };
  var semEmoji = function (t) { return String(t || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim(); };
  function caixa(t) {
    var letras = t.replace(/[^A-Za-zÀ-ÿ]/g, ''), maius = letras.replace(/[^A-ZÀ-Þ]/g, '');
    if (!letras || maius.length / letras.length < 0.6) return t;
    return t.toLocaleLowerCase('pt-BR')
      .replace(/(^|[\s\/(·-])([a-zà-ÿ])/g, function (m, a, b) { return a + b.toLocaleUpperCase('pt-BR'); })
      .replace(/\b([A-Za-z]{1,4})(\d*)\b/g, function (w, l, n) { return SIGLAS[l.toUpperCase()] ? l.toUpperCase() + n : w; });
  }
  var GENERICO = /^(QH4|ABO|CBO|ASC|ADV\+?|ADVANTAGE\+?)$/i;
  function partes(raw) {
    var t = semEmoji(raw), tokens = [], m, re = /\[([^\]]*)\]/g;
    while ((m = re.exec(t))) { var x = m[1].trim(); if (x && !GENERICO.test(x)) tokens.push(x); }
    var resto = t.replace(/\[[^\]]*\]/g, ' ').replace(/[–—|]/g, '-').replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '')
      .split(/\s+-\s+|\s+-|-\s+/).map(function (x) { return x.trim(); }).filter(function (x) { return x && !GENERICO.test(x); }).join(' · ');
    return { tokens: tokens, resto: resto };
  }
  PR.nomeCampanha = function (raw) {
    var p = partes(raw), titulo, tags;
    if (p.resto) { titulo = p.resto; tags = p.tokens; }
    else if (p.tokens.length >= 2) { titulo = p.tokens.slice(-2).join(' · '); tags = p.tokens.slice(0, -2); }
    else { titulo = p.tokens[0] || semEmoji(raw) || '—'; tags = []; }
    return { titulo: caixa(titulo), tags: tags.slice(-2).map(caixa), completo: semEmoji(raw) };
  };
  PR.nomeCurto = function (raw) {
    var p = partes(raw), lista = (p.resto ? [p.resto] : []).concat(p.tokens);
    return caixa(lista.join(' · ') || semEmoji(raw) || '—');
  };
  var titulos = {};
  PR.camp = function (id, raw) { var k = id + '|' + raw; if (!titulos[k]) titulos[k] = PR.nomeCampanha(raw); return titulos[k]; };

  // ---------- Resultados e métricas ----------
  var NAO_CONV = { engajamento: 1, alcance: 1, thruplay: 1, clique: 1, lpv: 1 };
  PR.ehConv = function (k) { return !!k && !NAO_CONV[k]; };
  PR.chaveRes = function (S, item) { return S.res === 'auto' ? item.chave : S.res; };
  PR.rotulo = function (S, k) { return !k ? 'Sem resultado definido' : ((S.data && S.data.rotulos[k]) || k); };
  // Em "todas as campanhas", só resultados de conversão entram em somas, rankings e sinais
  PR.comparavel = function (S, item) { return !!S.campanha || S.res !== 'auto' || PR.ehConv(PR.chaveRes(S, item)); };
  PR.deriva = function (S, item) {
    var m = item.m, k = PR.chaveRes(S, item), r = k ? (item.conv[k] || 0) : 0;
    return {
      spend: m.spend, res: r, cpr: r > 0 ? m.spend / r : null, impressions: m.impressions, link_clicks: m.link_clicks,
      ctr: m.impressions ? m.link_clicks / m.impressions : null, cpc: m.link_clicks ? m.spend / m.link_clicks : null,
      cpm: m.impressions ? m.spend / m.impressions * 1000 : null,
      hook: item.formato === 'video' && m.impressions ? m.video_3s / m.impressions : null,
      hold: item.formato === 'video' && m.video_3s ? m.thruplay / m.video_3s : null
    };
  };

  PR.STATUS_A = { ACTIVE: 'Ativo', PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campanha pausada', ADSET_PAUSED: 'Conjunto pausado', ARCHIVED: 'Arquivado',
    DELETED: 'Excluído', IN_PROCESS: 'Em análise', WITH_ISSUES: 'Com problemas', DISAPPROVED: 'Reprovado', PENDING_REVIEW: 'Em revisão',
    PREAPPROVED: 'Pré-aprovado', PENDING_BILLING_INFO: 'Aguardando pagamento' };
  PR.STATUS_C = { ACTIVE: 'Ativa', PAUSED: 'Pausada', ARCHIVED: 'Arquivada', IN_PROCESS: 'Em análise', WITH_ISSUES: 'Com problemas' };

  // ---------- Sinais de decisão ----------
  PR.SINAIS = {
    escalar: { rotulo: 'Escalar', ordem: 0, desc: 'Custo por resultado pelo menos 20% abaixo da média, com investimento suficiente para confiar.' },
    manter: { rotulo: 'Manter', ordem: 1, desc: 'Custo por resultado perto da média da seleção.' },
    otimizar: { rotulo: 'Otimizar', ordem: 2, desc: 'Custo por resultado de 20% a 60% acima da média, ou investimento sem resultado ainda dentro do esperado.' },
    pausar: { rotulo: 'Pausar', ordem: 3, desc: 'Custo por resultado mais de 60% acima da média, ou gastou 1,5× o custo médio sem nenhum resultado.' },
    aprendendo: { rotulo: 'Pouco dado', ordem: 4, desc: 'Investimento ainda baixo para julgar.' }
  };
  function mediana(v) { if (!v.length) return 0; var s = v.slice().sort(function (a, b) { return a - b; }); var i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; }
  function sinalDe(x, media, limiar) {
    var d = x.d;
    if (!(d.spend > 0)) return null;
    if (media == null) return d.spend >= limiar ? 'otimizar' : 'aprendendo';
    if (d.res === 0) {
      if (d.spend >= Math.max(media * 1.5, limiar)) return 'pausar';
      return d.spend >= limiar ? 'otimizar' : 'aprendendo';
    }
    var rel = d.cpr / media;
    if (rel <= 0.8) return d.spend >= limiar || d.res >= 2 ? 'escalar' : 'manter';
    if (rel < 1.2) return 'manter';
    if (rel < 1.6) return 'otimizar';
    return 'pausar';
  }

  PR.anunciosDaSelecao = function (S) {
    if (!S.data) return [];
    return S.data.anuncios.filter(function (a) { return !S.campanha || a.campanha_id === S.campanha; });
  };
  // Análise completa da seleção: itens com métricas, média de cada tipo de resultado, sinais, resumo e destaques
  PR.analisa = function (S) {
    var lista = PR.anunciosDaSelecao(S).map(function (a) {
      return { a: a, d: PR.deriva(S, a), k: PR.chaveRes(S, a), comp: PR.comparavel(S, a) };
    });
    var porK = {};
    lista.forEach(function (x) { if (!x.comp || !x.k) return; var o = porK[x.k] || (porK[x.k] = { spend: 0, res: 0 }); o.spend += x.d.spend; o.res += x.d.res; });
    var medias = {};
    Object.keys(porK).forEach(function (k) { medias[k] = porK[k].res > 0 ? porK[k].spend / porK[k].res : null; });
    var gastos = lista.filter(function (x) { return x.d.spend > 0; }).map(function (x) { return x.d.spend; });
    var med = mediana(gastos);
    lista.forEach(function (x) {
      x.media = x.k ? medias[x.k] : null;
      x.rel = x.d.cpr != null && x.media ? x.d.cpr / x.media : null;
      var limiar = Math.max((x.media || 0) * 0.5, med * 0.25);
      x.sinal = x.comp ? sinalDe(x, x.media, limiar) : null;
    });
    var t = { spend: 0, res: 0, spendConv: 0, imp: 0, link: 0, ativos: 0 };
    lista.forEach(function (x) {
      t.spend += x.d.spend; t.imp += x.d.impressions; t.link += x.d.link_clicks;
      if (x.a.status === 'ACTIVE') t.ativos += 1;
      if (x.comp) { t.res += x.d.res; t.spendConv += x.d.spend; }
    });
    var resumo = {
      spend: t.spend, res: t.res, cpr: t.res ? t.spendConv / t.res : null, ctr: t.imp ? t.link / t.imp : null,
      cpm: t.imp ? t.spend / t.imp * 1000 : null, impressions: t.imp, link_clicks: t.link, ativos: t.ativos, criativos: lista.length
    };
    var comGasto = lista.filter(function (x) { return x.comp && x.d.spend > 0; });
    var comRes = comGasto.filter(function (x) { return x.d.res > 0 && x.d.spend >= med * 0.15; });
    var porCpr = comRes.slice().sort(PR.ORD.cpr);
    var semRes = comGasto.filter(function (x) { return x.d.res === 0; }).sort(PR.ORD.spend);
    var contagem = { escalar: 0, manter: 0, otimizar: 0, pausar: 0, aprendendo: 0 };
    var emRisco = 0;
    lista.forEach(function (x) { if (x.sinal) contagem[x.sinal] += 1; if (x.sinal === 'pausar') emRisco += x.d.spend; });
    return {
      itens: lista, medias: medias, resumo: resumo, contagem: contagem, emRisco: emRisco,
      destaques: {
        melhor: porCpr[0] || null,
        mais: comGasto.slice().sort(PR.ORD.res)[0] || null,
        pior: semRes[0] || porCpr[porCpr.length - 1] || null,
        piorSemRes: !!semRes[0]
      }
    };
  };
  function nn(v, d) { return v == null || !isFinite(v) ? d : v; }
  PR.ORD = {
    cpr: function (x, y) { return (y.comp - x.comp) || nn(x.d.cpr, Infinity) - nn(y.d.cpr, Infinity) || y.d.spend - x.d.spend; },
    res: function (x, y) { return (y.comp - x.comp) || y.d.res - x.d.res || nn(x.d.cpr, Infinity) - nn(y.d.cpr, Infinity); },
    spend: function (x, y) { return y.d.spend - x.d.spend; },
    ctr: function (x, y) { return nn(y.d.ctr, -1) - nn(x.d.ctr, -1); },
    hook: function (x, y) { return nn(y.d.hook, -1) - nn(x.d.hook, -1); },
    cpm: function (x, y) { return nn(x.d.cpm, Infinity) - nn(y.d.cpm, Infinity); },
    sinal: function (x, y) {
      var o = function (z) { return z.sinal ? PR.SINAIS[z.sinal].ordem : 9; };
      return o(x) - o(y) || nn(x.d.cpr, Infinity) - nn(y.d.cpr, Infinity) || y.d.spend - x.d.spend;
    }
  };
  PR.ORD_ROTULOS = { cpr: 'Menor custo por resultado', res: 'Mais resultados', spend: 'Maior investimento', ctr: 'Maior CTR', hook: 'Maior retenção 3s', cpm: 'Menor CPM', sinal: 'Sinal de decisão' };
  // Opções do seletor de resultado presentes na seleção
  PR.opcoesResultado = function (S) {
    var ch = {};
    PR.anunciosDaSelecao(S).forEach(function (a) { Object.keys(a.conv).forEach(function (k) { if (a.conv[k] > 0) ch[k] = 1; }); if (a.chave) ch[a.chave] = 1; });
    delete ch.alcance; delete ch.engajamento; delete ch.evento_custom; delete ch.resultado_meta;
    return Object.keys(ch).sort(function (a, b) { return PR.rotulo(S, a).localeCompare(PR.rotulo(S, b)); });
  };
  PR.campanhas = function (S) {
    if (!S.data) return [];
    return S.data.campanhas.slice().sort(function (a, b) { return ((b.status === 'ACTIVE') - (a.status === 'ACTIVE')) || b.m.spend - a.m.spend; });
  };
  PR.campanhaAtual = function (S) { return S.data && S.campanha ? S.data.campanhas.find(function (c) { return c.id === S.campanha; }) || null : null; };

  // ---------- Elementos ----------
  PR.el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  PR.okPreview = function (u) { return /^https:\/\/fb\.me\/[A-Za-z0-9_-]+$/.test(u || ''); };
  PR.okImg = function (u) { return /^https:\/\/[a-z0-9.-]+\.(fbcdn\.net|facebook\.com|cdninstagram\.com)\//i.test(u || ''); };
  PR.okId = function (id) { return /^\d{5,25}$/.test(id || ''); };
  PR.link = function (href, text, cls) { var a = PR.el('a', cls || '', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  PR.gerenciador = function (S, adId) { return 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=' + S.data.conta.id + '&selected_ad_ids=' + adId; };
  PR.imagem = function (a, cls) {
    if (!PR.okImg(a.capa)) return PR.el('div', 'pr-noimg ' + (cls || ''), 'Sem capa');
    var i = PR.el('img', cls || ''); i.loading = 'lazy'; i.alt = ''; i.referrerPolicy = 'no-referrer'; i.src = a.capa;
    i.onerror = function () { var n = PR.el('div', 'pr-noimg ' + (cls || ''), 'Capa indisponível'); if (i.parentNode) i.parentNode.replaceChild(n, i); };
    return i;
  };
  // Logo da conta: imagem para a Netimóveis, letreiro para a Class
  PR.logo = function (conta, cor) {
    if (conta === 'class') {
      var c = PR.el('span', 'pr-logo-class'); c.setAttribute('aria-label', 'Prolar Class');
      c.append(PR.el('b', '', 'PROLAR CLASS'), PR.el('i', '', 'netimóveis'));
      return c;
    }
    var img = PR.el('img', 'pr-logo-net'); img.alt = 'Prolar Netimóveis'; img.width = 280; img.height = 80;
    img.src = cor === 'laranja' ? 'img/logo-net-laranja.png' : 'img/logo-net-branco.png';
    return img;
  };
  PR.horaAtualizacao = function (S) {
    return S.data ? new Date(S.data.gerado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
  };

  window.PR = PR;
})();
