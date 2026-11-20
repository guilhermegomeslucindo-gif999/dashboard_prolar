// Função de servidor (Vercel) que entrega os dados do painel de criativos.
// O token fica só aqui no servidor, nas variáveis de ambiente da Vercel. Nunca vai para o navegador.
//
// Variáveis de ambiente:
//   META_ACCESS_TOKEN  (obrigatória) token de Usuário do Sistema com a permissão ads_read
//   META_APP_SECRET    (opcional)    chave secreta do app; deixa as chamadas ao Meta mais seguras
//   META_API_VERSION   (opcional)    padrão: v23.0
//
// As contas que podem ser consultadas ficam em lib/contas.js.
//
// Para poupar o limite de consultas do Meta:
//   - a Vercel guarda cada resposta por 5 minutos (todo mundo que abrir nesse tempo vê a mesma, sem nova consulta);
//   - o servidor também guarda na memória; "Atualizar" só consulta de novo se a última consulta tiver mais de 1 minuto;
//   - se o Meta limitar as consultas, o painel mostra os últimos dados bons (até 6 horas) com um aviso, em vez de erro.

const CONTAS = require('../lib/contas.js');
const criativos = require('../lib/criativos.js');

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5) + 1;
const todaySP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

const MEMORIA = new Map(); // chave → { em: timestamp, body }
const FRESCO_MS = 5 * 60e3;
const MIN_ATUALIZAR_MS = 60e3;
const RESERVA_MS = 6 * 3600e3;
const LIMITE = [4, 17, 32, 613, 80004];

function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  const env = process.env;
  const token = (env.META_ACCESS_TOKEN || '').trim();
  if (!token) {
    return send(res, 500, { error: 'Falta configurar META_ACCESS_TOKEN na Vercel (Settings → Environment Variables) e fazer o Redeploy. Veja o README.' });
  }

  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const conta = CONTAS.find((c) => c.slug === String(q.conta || '')) || CONTAS[0];
  let start = String(q.start || '');
  let end = String(q.end || '');
  if (!DAY.test(start) || !DAY.test(end)) {
    end = todaySP();
    start = end.slice(0, 8) + '01';
  }
  if (start > end) return send(res, 400, { error: 'A data inicial é depois da data final.' });
  if (daysBetween(start, end) > 400) return send(res, 400, { error: 'Escolha um período de até 400 dias.' });

  const chave = conta.slug + '|' + start + '|' + end;
  const guardado = MEMORIA.get(chave);
  const idade = guardado ? Date.now() - guardado.em : Infinity;
  const CACHE_OK = 's-maxage=300, stale-while-revalidate=60, stale-if-error=86400';

  // Memória ainda fresca: responde sem consultar o Meta ("Atualizar" só passa se tiver mais de 1 minuto)
  if (guardado && (q.fresh ? idade < MIN_ATUALIZAR_MS : idade < FRESCO_MS)) {
    return send(res, 200, guardado.body, q.fresh ? 'no-store' : CACHE_OK);
  }

  try {
    const body = await criativos({
      token,
      version: (env.META_API_VERSION || '').trim() || 'v23.0',
      appSecret: (env.META_APP_SECRET || '').trim(),
      conta,
      start,
      end,
    });
    body.periodo = { start, end };
    body.contas = CONTAS.map((c) => ({ slug: c.slug, nome: c.nome, tema: c.tema }));
    body.gerado_em = new Date().toISOString();
    MEMORIA.set(chave, { em: Date.now(), body });
    if (MEMORIA.size > 60) MEMORIA.delete(MEMORIA.keys().next().value);
    return send(res, 200, body, q.fresh ? 'no-store' : CACHE_OK);
  } catch (err) {
    // Meta limitou as consultas: mostra os últimos dados bons, se houver, com aviso
    if (LIMITE.includes(err.code) && guardado && idade < RESERVA_MS) {
      const body = { ...guardado.body, aviso: 'O Meta pediu uma pausa nas consultas. Mostrando os dados das ' +
        new Date(guardado.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) + '.' };
      return send(res, 200, body, 'no-store');
    }
    return send(res, err.status || 500, { error: err.message || 'Erro ao buscar os dados.', code: err.code || null });
  }
};
