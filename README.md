# Painel de criativos · Prolar Netimóveis e Prolar Class

Painel de **performance dos criativos** no Meta Ads, feito pela QH4.

- No topo você escolhe a conta, **Netimóveis** ou **Class**. O layout e a fonte são os mesmos; o painel troca o logo e as cores de cada marca.
- Os nomes longos das campanhas viram um título curto com etiquetas (ex.: "Mangabeiras", com "Gestão Premium" e "Lead Contato"). O nome completo aparece passando o mouse e na faixa da campanha selecionada.
- Escolha uma campanha para ver os criativos dela com capa, formato, status, resultados, custo por resultado, CTR, CPC, CPM e, nos vídeos, retenção de 3s e ThruPlay.
- **Resultado** = o evento que o conjunto de anúncios otimiza no Meta: Entre em contato, Agendar, lead de formulário, lead no site, conversa no WhatsApp, clique etc. Cada campanha usa o próprio objetivo. No seletor “Resultado” dá para trocar a métrica para comparar por outra.
- Destaques automáticos: melhor custo por resultado, mais resultados e o criativo que gastou sem resultado.
- Clicar na capa abre a prévia do anúncio em outra guia. **Gerenciador** abre o anúncio no Gerenciador de Anúncios.
- Campanhas e anúncios novos aparecem sozinhos, inclusive os ativos que ainda não gastaram.

Os dados vêm **direto da API de Marketing do Meta**, que é gratuita, a cada abertura da página (no máximo 5 minutos de atraso; o botão “Atualizar” busca de novo, no máximo 1 vez por minuto). Não depende de Windsor nem de outro serviço pago.

---

## Páginas

- `/` · painel principal: capa com os números, grade com todos os criativos da campanha escolhida, matriz de decisão e o que fazer com cada criativo.
- `/anterior` · versão anterior do painel, guardada por segurança.

Os dois usam `nucleo.js` (só o principal) e a mesma API, com o mesmo cache de 5 minutos.

## Configuração (uma vez só)

### 1. Dar acesso às contas no Meta
O mesmo **Usuário do Sistema** usado no painel da Occhio Blu serve aqui, com o mesmo token.

No **Gerenciador de Negócios** da QH4: **Configurações → Usuários do sistema →** escolha o usuário **→ Atribuir ativos → Contas de anúncios →** marque **Prolar Netimóveis** e **Prolar Class →** permissão de **ver desempenho → Salvar**.

### 2. Subir no GitHub
Crie um repositório **privado**, por exemplo `prolar-criativos`, e envie todos os arquivos desta pasta, incluindo as pastas `api`, `lib` e `img`.

### 3. Publicar na Vercel
1. **Add New → Project** e importe o repositório. Em **Framework Preset**, deixe **Other**.
2. Em **Environment Variables**, cadastre:
   - **Key:** `META_ACCESS_TOKEN`
   - **Value:** o token "EAA…", como **Secret**
3. Clique em **Deploy**.

Se cadastrar a variável depois do primeiro deploy: **Deployments → ⋯ → Redeploy**.

---

## Limite de consultas do Meta

O Meta limita quantas consultas cada app pode fazer por hora. O painel foi feito para gastar pouco:

- cada abertura faz de 2 a 4 consultas leves (métricas por anúncio, anúncios ativos e, quando preciso, detalhes e a coluna Resultados);
- a Vercel e o servidor guardam a resposta por 5 minutos, então várias pessoas abrindo ao mesmo tempo não geram consultas novas;
- o botão **Atualizar** só busca de novo depois de 1 minuto do último clique;
- se o Meta pedir uma pausa, o painel continua mostrando os últimos dados, com um aviso, em vez de dar erro.

Se mesmo assim o aviso de pausa aparecer com frequência, o app usado no token provavelmente está no nível de acesso básico do Meta. Para aumentar o limite, peça o **Acesso Padrão (Standard Access) de Gerenciamento de Anúncios** para esse app em developers.facebook.com → app → **Análise do app → Permissões e recursos**. É gratuito.

## Como os números são calculados

| Métrica | Conta |
|---|---|
| Custo por resultado | investimento ÷ resultados |
| CTR (link) | cliques no link ÷ impressões |
| CPC | investimento ÷ cliques no link |
| CPM | investimento ÷ impressões × 1000 |
| Ret. 3s (vídeo) | visualizações de 3 segundos ÷ impressões |
| ThruPlay (vídeo) | ThruPlays ÷ visualizações de 3 segundos |

- **Atribuição:** a mesma configurada em cada conjunto, igual ao Gerenciador.
- **Comparação:** a barra do custo por resultado mostra o criativo contra a média da seleção (o traço) para o mesmo tipo de resultado. Fica **verde** quando é 10% ou mais mais barato e **vermelha** quando é 15% ou mais mais caro.
- **Entre em contato e Agendar:** esses eventos vêm do campo `conversions` do Meta. Os outros vêm de `actions`.

## Contas
As contas ficam em `lib/contas.js`. Só elas podem ser consultadas, mesmo que o token tenha acesso a outras contas da QH4. Para incluir uma conta nova, copie um bloco desse arquivo, troque o `slug`, o `id` e o `nome`, e dê acesso a ela ao Usuário do Sistema.

## Problemas comuns

| Mensagem no painel | O que fazer |
|---|---|
| “Falta configurar META_ACCESS_TOKEN” | Cadastre o token na Vercel e faça o Redeploy |
| “O token do Meta expirou ou é inválido” | Gere um novo token e atualize na Vercel |
| “O token não tem acesso a esta conta” | Atribua a conta ao Usuário do Sistema (passo 1) |
| “O Meta limitou as consultas” | Espere alguns minutos |
| Capa “indisponível” | O link da imagem venceu: clique em “Atualizar” |

## Testes
```bash
npm test   # testa o servidor com respostas simuladas do Meta, sem acessar a internet
```
