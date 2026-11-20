// Cliente simples da API de Marketing do Meta: paginação, novas tentativas e mensagens de erro em português.
const crypto = require('crypto');

class SourceError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function makeGraph(token, version, appSecret) {
  const proof = appSecret ? crypto.createHmac('sha256', appSecret).update(token).digest('hex') : null;

  async function getJson(url) {
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      let j;
      try {
        const r = await fetch(url);
        j = await r.json().catch(() => ({ error: { message: 'Resposta inválida do Meta (HTTP ' + r.status + ')' } }));
      } catch (e) {
        j = { error: { message: 'Não foi possível falar com o Meta.', is_transient: true } };
      }
      if (!j.error) return j;
      last = j.error;
      // Erro passageiro: tenta de novo. Limite de consultas (4, 17, 80004...): não insiste, para não piorar o bloqueio.
      const limite = [4, 17, 32, 613, 80004].includes(j.error.code);
      const temporario = !limite && (j.error.is_transient || [1, 2, 341].includes(j.error.code));
      if (!temporario) break;
      await new Promise((ok) => setTimeout(ok, 800 * (attempt + 1)));
    }
    let msg = last.error_user_msg || last.message || 'Erro do Meta';
    if (last.code === 190) msg = 'O token do Meta expirou ou é inválido. Gere um novo e atualize META_ACCESS_TOKEN na Vercel. (' + msg + ')';
    else if (last.code === 10 || last.code === 200 || (last.code === 100 && /permission|permiss/i.test(msg))) {
      msg = 'O token não tem acesso a esta conta de anúncios. No Gerenciador de Negócios, atribua a conta ao Usuário do Sistema com permissão de ver desempenho. (' + msg + ')';
    } else if ([4, 17, 32, 613, 80004].includes(last.code)) msg = 'O Meta pediu uma pausa nas consultas. Espere alguns minutos e recarregue a página.';
    throw new SourceError(msg, last.code || null, 502);
  }

  // Faz a chamada e segue a paginação. Uma resposta que não é lista volta como objeto.
  async function graph(path, params = {}, maxPages = 25) {
    const url = new URL(`https://graph.facebook.com/${version}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    url.searchParams.set('access_token', token);
    if (proof) url.searchParams.set('appsecret_proof', proof);
    const first = await getJson(url.toString());
    if (!Array.isArray(first.data)) return first;
    let out = first.data;
    let next = first.paging && first.paging.next;
    let pages = 1;
    while (next && pages < maxPages) {
      const j = await getJson(next);
      out = out.concat(j.data || []);
      next = j.paging && j.paging.next;
      pages += 1;
    }
    return out;
  }

  // Busca vários objetos pelo id, 50 por vez, e devolve um Map id → objeto
  async function byIds(ids, fields) {
    const lista = [...new Set(ids.filter(Boolean).map(String))];
    const lotes = [];
    for (let i = 0; i < lista.length; i += 50) lotes.push(lista.slice(i, i + 50));
    const res = await Promise.all(lotes.map((l) => graph('/', { ids: l.join(','), fields })));
    const out = new Map();
    for (const lote of res) for (const o of Object.values(lote || {})) if (o && o.id) out.set(String(o.id), o);
    return out;
  }

  return { graph, byIds };
}

module.exports = { makeGraph, SourceError };
