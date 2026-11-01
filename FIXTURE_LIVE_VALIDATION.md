# Registro histórico — validação bloqueada antes de discovery-first

> Este relatório descreve a rodada anterior. A arquitetura atual está em `FIXTURE_SEARCH.md`: discovery Palmeiras + verification. Posteriormente o usuário reportou HTTP 200/estrutura válida na CBF e na ESPN por data única, e HTTP 400 para intervalo mensal ESPN. As limitações/decisões de varredura abaixo são históricas, não a estratégia normal atual.

## Decisão

PR #1 permanece em **draft**. **Não recomendar merge nem retirar o draft** até cumprir os critérios de validação real. A arquitetura e os adapters não foram alterados nesta rodada. Não foram criados projeto Supabase, credenciais, cron ou policies.

## Evidência de acesso — 31/10/2026, 22:48 de Brasília

A inspeção atual do ambiente confirmou política de rede restrita e aplicada, sem hosts adicionais liberados. Só as variáveis públicas Vite do Supabase estão configuradas. Não há identidade administrativa Supabase vinculada, `SUPABASE_ACCESS_TOKEN` disponível nem CLI Supabase instalada no PATH.

As seis tentativas diretas abaixo falharam com:

```text
curl exit: 56
HTTP da origem: 000 (nenhuma resposta recebida da origem)
CONNECT tunnel failed, response 403
```

O 403 é do **proxy do ambiente**, não das fontes. Não constitui evidência de indisponibilidade dos sites, de HTTP 403 na origem, de mês sem partidas ou de parser correto/incorreto.

| Fonte | URL tentada | Resultado |
| --- | --- | --- |
| CBF | https://www.cbf.com.br/api/cbf/calendario/jogos/2026/11/05 | Bloqueada antes de receber JSON |
| ESPN bra.1 | https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=20261101-20261130&limit=1000 | Bloqueada |
| ESPN bra.copa_do_brasil | https://site.api.espn.com/apis/site/v2/sports/soccer/bra.copa_do_brasil/scoreboard?dates=20261101-20261130&limit=1000 | Bloqueada |
| ESPN conmebol.libertadores | https://site.api.espn.com/apis/site/v2/sports/soccer/conmebol.libertadores/scoreboard?dates=20261101-20261130&limit=1000 | Bloqueada |
| Palmeiras | https://www.palmeiras.com.br/dados-jogos/jogos/ | Bloqueada para obtenção de HTML bruto |
| CONMEBOL | https://gol.conmebol.com/libertadores/es/fixture | Bloqueada |

Não foram repetidas consultas diárias de meses inteiros depois de comprovado o bloqueio de destino. Não houve tentativa de contornar a política de rede.

## Deploy

A função **não foi implantada nesta rodada**. Não há sessão administrativa disponível para executar o deploy.

Com CLI Supabase instalada, na branch do PR, em terminal autorizado e autenticado:

```sh
supabase login
supabase functions deploy sync-palmeiras-fixtures \
  --project-ref pltfxvrmxonlaaykvfxv \
  --no-verify-jwt
```

Se a sessão já estiver autenticada, executar somente o segundo comando. Não é necessário criar outro projeto. URL e chave pública Vite não concedem permissão administrativa para publicar funções. Não enviar tokens pelo chat ou versioná-los.

Para concluir daqui, o ambiente precisa de autenticação administrativa Supabase por mecanismo seguro e acesso de rede aos hosts das fontes e ao projeto/management API Supabase. A liberação de hosts depende da configuração suportada do ambiente; editar o arquivo local de política não libera acesso.

## Resultado por fonte

### CBF

- Funcionando em produção: **não verificado**, e não “não funciona”.
- Endpoint atual: `/api/cbf/calendario/jogos/YYYY/MM/DD`.
- Nenhum payload real foi recebido; campos, datas/horas, competição, rodada, dias vazios e status HTTP da origem permanecem pendentes.
- Não foi confirmado endpoint oficial de período/tabela completa mais eficiente. A investigação pública não demonstrou uma alternativa utilizável.
- Manter o fluxo diário com concorrência máxima de seis. Não substituir por endpoint especulativo.
- Alterações no adapter e fixtures reais adicionadas: nenhuma, por falta de evidência verificável.

### ESPN

- Funcionando em produção: **não verificado** nas três ligas.
- Não foi possível validar `events/competitions/competitors`, status, timezone, times, cobertura histórica ou futura com o payload real.
- Continua exclusivamente secundária; nenhuma promoção de autoridade.
- Alterações no adapter: nenhuma.

### Palmeiras

- Funcionando como adapter de produção: **não verificado**.
- A ferramenta de leitura web conseguiu obter uma representação textual da [página atualmente usada](https://www.palmeiras.com.br/dados-jogos/jogos/), separadamente do acesso bruto bloqueado.
- A representação mistura navegação, próximos jogos e conteúdo histórico (“Savoia x Palestra Italia 1915 – 1º jogo”). O link “CALENDÁRIO COMPLETO” aponta para `https://palmeiras.com.br/calendario`.
- O destaque textual de Copa do Brasil aparece sem ano no nome da competição, enquanto os próximos cartões usam dia/mês sem ano. Isso não comprova compatibilidade com o fallback atual, que espera competição/ano e data completa.
- A tentativa de leitura do destino `/calendario` pela ferramenta web falhou com 502; isso é um erro da ferramenta, não status HTTP da origem comprovado.
- Não foi obtido HTML bruto nem confirmado JSON-LD/XHR. Não se deve construir um parser de produção a partir da representação textual da ferramenta.
- Próximo passo: inspecionar o HTML e as requisições de `/calendario` e da página atual em ambiente liberado, restringir extração aos cartões/tabela reais e criar fixture reduzida da estrutura recebida. Não varrer notícias.

### CONMEBOL

- Integração funcional: **não**; permanece explicitamente indisponível.
- A pesquisa pública identificou a página oficial [Fixtures & Results](https://gol.conmebol.com/libertadores/en/tournament/15).
- A leitura web aberta nessa página retornou apenas navegação e o título da página, sem expor a estrutura de partidas ou chamadas XHR.
- Resultados indexados da página e comunicados editoriais oficiais contêm informações de confrontos. Eles não são prova de contrato JSON, JSON-LD presente ou execução do parser.
- Um [comunicado oficial das semifinais](https://gol.conmebol.com/libertadores/pt-br/news/datas-confirmadas-confira-como-serao-disputadas-semifinais-da-conmebol-libertadores) informa as datas de 14 e 21/10/2026 para o confronto Fluminense–Palmeiras. É evidência editorial complementar para futura comparação, **não resultado da Edge Function**.
- Endpoint JSON/XHR oficial: ainda não confirmado.
- Não configurar uma URL só para suprimir o aviso, nem atribuir a CONMEBOL resultados da ESPN.

## Comparações mensais

Todas as linhas abaixo estão **não consultadas pelo motor real**. “Não consultado” não significa “não encontrado”. Fontes retornadas, datas por fonte, status, confidence e divergências permanecem **não apurados**.

### Setembro/2026 — 6 jogos esperados

| Referência fornecida | Resultado real |
| --- | --- |
| 02 — Santos x Palmeiras | Não consultado |
| 06 — Botafogo x Palmeiras | Não consultado |
| 09 — Palmeiras x LDU Quito | Não consultado |
| 12 — Palmeiras x São Paulo | Não consultado |
| 16 — LDU Quito x Palmeiras | Não consultado |
| 19 — Grêmio x Palmeiras | Não consultado |

Jogos encontrados: **não apurado**, não zero. Comparação de datas/divergências: pendente.

### Outubro/2026 — 7 jogos esperados

| Referência fornecida | Resultado real |
| --- | --- |
| 08 — Palmeiras x Bahia | Não consultado |
| 11 — Palmeiras x Corinthians | Não consultado |
| 14 — Fluminense x Palmeiras | Não consultado |
| 17 — Athletico-PR x Palmeiras | Não consultado |
| 21 — Palmeiras x Fluminense | Não consultado |
| 24 — Palmeiras x Red Bull Bragantino | Não consultado |
| 28 — Santos x Palmeiras | Não consultado |

Jogos encontrados: **não apurado**, não zero. O comunicado CONMEBOL é uma pista documental para dois confrontos, não substitui a comparação exigida entre fontes retornadas pelo motor.

### Novembro/2026

Consulta consolidada real: **não executada**. Não há lista validada de jogos, status ou confidence nesta rodada. Não foram atribuídos jogos confirmados, datas-base, condicionais ou conflitos com base em plausibilidade ou testes sintéticos.

## Margem de mês e volume CBF

A margem de sete dias em cada lado pode preservar evidência de divergência na virada do mês. Porém, no endpoint diário atual, adicionaria **14 requisições CBF** por consulta — aproximadamente **45% a 50%** sobre um mês de 28 a 31 dias, mesmo com a concorrência limitada.

Sem validar latência, cobertura e eventual endpoint oficial mais eficiente, não é possível comprovar o custo prático. A margem não foi implementada nesta rodada. Mantida a limitação documentada, sem alterar arquitetura ou tolerância. Após acesso real: avaliar endpoint oficial por período/tabela antes de ampliar o fluxo diário; se a margem for adotada, testar fronteiras de mês/ano, saída do mês solicitado e preservação de conflitos cross-month.

## Verificações de código

Executadas novamente nesta rodada:
- `pnpm run check`: passou.
- `pnpm run test:fixtures`: **23 testes passaram**.
- `deno check --config supabase/functions/deno.json supabase/functions/sync-palmeiras-fixtures/index.ts`: passou.
- Novos testes de payload real: **nenhum**, pois não houve payload recebido.
- Adapters, regras, frontend e banco: sem alterações nesta rodada.

Os workflows do commit anterior `8c9b61c` foram consultados e estão verdes:
- [Check fixture search](https://github.com/iamfelipeS/calendar-creator/actions/runs/41261905534)
- [Build Calendar Creator](https://github.com/iamfelipeS/calendar-creator/actions/runs/41261905397)

Este relatório é uma evidência de bloqueio, não conclusão da validação real. Não retirar o PR de draft nem fazer merge enquanto deploy, validação real dos adapters e consultas dos três meses não forem comprovados.
