# Busca de jogos do Palmeiras — discovery + verification

## Estratégia atual

A implementação deixou de iniciar com varreduras mensais independentes por fonte. O fluxo normal agora é:

```text
Calendário oficial Palmeiras (discovery)
  → jogos do mês, sem confirmação absoluta
  → CBF confirma confrontos de Brasileirão/Copa do Brasil
  → CONMEBOL confirma confrontos de Libertadores, se configurada
  → ESPN confere a data/confronto, sempre como fonte secundária
  → reconcileFixtures()
  → revisão humana e importação sem salvar automaticamente
```

O PR #1 continua em draft. Nesta etapa não houve merge, deploy, consulta real pelo Actions, alteração de RLS, autenticação ou Cron. Nenhum jogo foi hardcoded em produção.

O usuário informou validações reais via Supabase: CBF diário respondeu 200 com `jogos → campeonato → categoria → partidas`; ESPN respondeu 200 com data única e 400 com intervalo mensal, inclusive com `limit=1000`. Essas informações orientaram a correção. Não são novas execuções feitas neste ambiente, nem capturas brutas usadas nos testes.

## Responsabilidades

| Arquivo | Responsabilidade |
| --- | --- |
| `supabase/functions/_shared/palmeiras-calendar.ts` | Discovery semântico de calendário e contexto de temporada; não confirma jogos |
| `structured-events.ts` | Parser JSON-LD compartilhado, compartilhado, incluindo horário local de timestamps |
| `sources.ts` | Fetch, parsers CBF/ESPN, discovery Palmeiras e adapters de fallback |
| `verification.ts` | Verificação pontual por confronto, cache por data/competição e janela de ±3 dias |
| `sync.ts` | Discovery primeiro, autoridades em paralelo, ESPN depois e fallback explícito |
| `normalize.ts` / `reconcile.ts` | Normalização e regras de autoridade/confiança já existentes |
| `contracts.ts` | Contratos usados pela função e pelo frontend |

## Discovery Palmeiras

`discoverPalmeirasFixtures(query)` tenta, em ordem:

1. `https://www.palmeiras.com.br/calendario/`
2. `https://www.palmeiras.com.br/ingressos/`
3. `https://www.palmeiras.com.br/programacao-semanal/`
4. `https://www.palmeiras.com.br/dados-jogos/jogos/`

Para ao encontrar jogos relevantes em um bloco de calendário completo reconhecido (HTML ou JSON-LD nesse contexto). Escala para outras páginas quando não encontra o mês ou quando a cobertura é apenas próximas partidas/desconhecida. Caminho normal esperado: uma chamada. Não foi confirmado um endpoint JSON/XHR público estável dessas páginas; nenhum endpoint foi inventado.

O parser aceita JSON-LD e HTML semântico. No HTML, constrói uma árvore sem executar scripts, localiza blocos de calendário/próximas partidas e o menor elemento de confronto dentro deles; sobe até o card que contém sua data/competição e mantém os limites do cartão ao associar confronto, competição e data. Notícias, navegação, rodapé e blocos relacionados são excluídos. Não procura confrontos/datas em texto arbitrário do site.

Links são metadados auxiliares: confronto, data e link podem estar em elementos diferentes do mesmo card. Aceita `/jogo/?idjogo=...` e `/ingressos/?idjogo=...`, sem exigir texto do confronto no anchor. Sem ID oficial, usa data + horário + times + competição como identificador estável. Cards vizinhos não são unidos.

Extrai, quando disponíveis: data, mandante, visitante, competição, horário, rodada/fase e estádio. Datas DD/MM usam somente um ano explícito no cartão ou contexto inequívoco de temporada; não recebem automaticamente o ano solicitado. Cartões sem ano verificável são ignorados com aviso, para não transformar próximas partidas atuais em suposto histórico.

`A DEFINIR` no **horário** produz `kickoffTime: null` e nota de data-base. Isso não transforma o jogo em condicional. Participante “a definir/vencedor/classificado” continua sendo condicional.

`discoveryCoverage` distingue `calendar`, `upcoming_only` e `unknown`. Próximas partidas não são tratadas como calendário mensal completo. Dados estruturados com cobertura desconhecida recebem aviso e ativam fallback se nenhuma página confirmar o contexto de calendário completo; não comprovam histórico completo.

Limitação ainda real: os testes de HTML são representações sintéticas dos campos observados pelo usuário, não uma captura validada do DOM atual. Seletores/estrutura precisam de conferência no próximo teste real. JSON-LD também permanece suportado.

## Verification

### CBF

- Apenas jogos descobertos de Brasileirão/Copa do Brasil no caminho normal.
- `verifyWithCBF()` consulta `/api/cbf/calendario/jogos/YYYY/MM/DD` na data conhecida.
- Filtra o confronto por competição, nomes canônicos, mandante/visitante e rodada/perna quando conhecidas.
- Se a resposta é válida, mas o confronto não foi encontrado, tenta -1/+1, -2/+2 e -3/+3 dias; para na primeira localização. Pode atravessar mês/ano.
- Se a data conhecida falha por rede/HTTP, registra a falha sem multiplicá-la em uma varredura de datas vizinhas.
- Cache por dia dentro da verificação: confrontos diferentes na mesma data reutilizam a consulta CBF.
- Horário oficial detalhado permite `confirmed/high` se não houver divergência. Sem horário, permanece data-base.

### ESPN

A estratégia de intervalo mensal foi **removida**, inclusive do fallback. Toda requisição usa:

```text
/apis/site/v2/sports/soccer/{liga}/scoreboard?dates=YYYYMMDD
```

Não há `dates=início-fim` nem `limit=1000`.

`verifyWithESPN()` consulta somente a liga do confronto descoberto, primeiro na data encontrada pela autoridade quando disponível, ou na data Palmeiras. Se necessário, usa a mesma janela diária de ±3 dias. Reutiliza consulta por liga+data. Nunca promove ESPN para autoridade.

### CONMEBOL

`verifyWithConmebol()` só faz request quando o discovery encontra Libertadores. Sem URL oficial configurada, retorna erro parcial sanitizado; o jogo pode permanecer `base_date/medium` por acordo Palmeiras+ESPN, mas não ganha confirmação CONMEBOL.

Com `CONMEBOL_FIXTURES_URL`, faz uma consulta oficial estruturada e filtra confrontos relevantes. Continua pendente identificar/validar um endpoint oficial confiável; não foi introduzido endpoint especulativo. URL restrita a HTTPS em `conmebol.com`/subdomínios, sem credenciais/porta, sem seguir redirects.

## Conciliação preservada

- CBF é autoridade em Brasileirão/Copa do Brasil; CONMEBOL em Libertadores.
- Autoridade detalhada + datas concordantes: `confirmed/high`.
- Palmeiras + ESPN concordantes, sem autoridade detalhada: `base_date/medium`.
- Fonte única: `base_date/low`.
- Datas diferentes: `conflict/low`, preservando datas por fonte. A data exibida prioriza a autoridade, mas o conflito não é ocultado.
- Jogo dependente de classificação: `conditional/low`, desmarcado.

A conciliação mantém tolerância máxima de sete dias para observações sem rodada comum; a **busca pontual** usa janela menor de três dias. Não confundir tolerância de associação com número de dias consultados.

O resultado final considera apenas grupos com alguma observação no mês solicitado. Um conflito cuja data prioritária caia fora dele é preservado para revisão; o importador já impede inseri-lo silenciosamente no mês errado.

## Fallback — somente discovery falho, vazio, restrito a próximas partidas ou sem cobertura inequívoca

Retorno explícito:

```json
{
  "discoverySource": "fallback",
  "discoveryFallback": true,
  "discoveryCount": 0,
  "discoveryCoverage": "unknown"
}
```

Sem fallback, `discoverySource` é `Palmeiras` e `discoveryFallback` é `false`. Esses metadados complementam `sourceErrors`/contagens sem alterar o fluxo de revisão do frontend.

No fallback:

1. CBF consulta os dias do mês, como descoberta excepcional, e CONMEBOL é tentada quando configurada.
2. ESPN verifica os confrontos recuperados, sem consultar novamente competições que entrarão no fallback diário.
3. Só as competições sem cobertura mensal oficial completa recebem descoberta ESPN por datas únicas: se CBF cobriu todos os dias, não se faz ESPN mensal nas duas competições domésticas; Libertadores continua necessitando fallback se CONMEBOL não cobrir o período.
4. Se todas as autoridades falharem, a descoberta diária ESPN pode consultar as três ligas. Essa é uma exceção explícita, não o caminho normal. Histórico ausente no Palmeiras usa esse mesmo caminho, com cobertura e falhas visíveis.

Zero resultados não comprova ausência de jogos. Cada falha permanece isolada; `sourceErrors` informa discovery incompleto e cobertura parcial.

## Custo e concorrência

Sem alteração de datas, para N jogos:

```text
P + D + E + C
P: normalmente 1 página Palmeiras (máximo 4 na escalada)
D: datas distintas CBF dos jogos domésticos
E: pares distintos liga/data ESPN dos jogos encontrados
C: 0 ou 1 página CONMEBOL, apenas se houver Libertadores
```

Exemplo genérico, sem dados reais hardcoded: seis jogos domésticos em seis datas → aproximadamente **13 requests**, em vez de varrer mês × fontes. Cada confronto não encontrado pode acrescentar até seis consultas diárias por verificador, reduzidas pelos caches e interrupção ao encontrar o jogo. Uma falha de rede na data conhecida não aciona essa ampliação.

Pools de até quatro tarefas em CBF/ESPN. CBF e uma chamada CONMEBOL podem coexistir; ESPN roda depois das autoridades. Pico esperado até cinco requests externos concorrentes, sem fanout mensal por fonte no fluxo normal.

Fallback pode custar mais: até 31 CBF + consultas ESPN pontuais e/ou até 31 por competição sem cobertura. No caso extremo de todas as autoridades falharem, pode chegar a 93 consultas ESPN em um mês de 31 dias. Esse custo/latência é uma limitação do fallback diário explicitamente documentada; não é apresentado como caminho de poucos requests. A próxima validação real deve medir esse caso antes de publicar a função.

Timeout de 5 s por request e resposta limitada a 3 MB permanecem. Não há cache persistente, nova tabela, cron ou secret privilegiado.

## Validador e testes

O workflow manual continua somente no PR. Não foi copiado para `main` nem executado nesta etapa.

`scripts/fixture-live-validation.ts` usa `makeLoaders()` e `syncFixtures()` reais: não mantém uma orquestração mensal paralela. Relata discovery, fallback, cobertura, total de requests, datas, contagens e incompatibilidades. A camada de observação reconhece calendário vazio com estrutura válida sem inventar jogos e distingue verificador não aplicável de falha.

```sh
pnpm run check
pnpm run test:fixtures
pnpm run build:client
deno check scripts/validate-fixture-sources.ts supabase/functions/sync-palmeiras-fixtures/index.ts
```

Os 32 casos anteriores foram preservados; expectativas de contagem/ordem e a amostra CONMEBOL foram atualizadas para discovery-first. Há 16 novos casos em `tests/discovery-verification.test.ts`, incluindo HTML sem JSON-LD, horário a definir, confirmação, acordo secundário, conflito, fallback vazio/HTTP, histórico, data única ESPN, cache, concorrência e virada de mês. Além desses 48 casos, `tests/kickoff-time.test.ts` acrescenta 18 casos de parser com elementos separados, horários, autoridade, fuso, importação, deduplicação e JSON salvo/recarregado. Total: 66 testes automatizados, com respostas injetadas — não consultas reais. O smoke test de navegador também verifica horário/A definir no modal e importação com horário.

## Deploy futuro (não executado nesta etapa)

Projeto existente: `pltfxvrmxonlaaykvfxv`.

```sh
supabase login
supabase functions deploy sync-palmeiras-fixtures --project-ref pltfxvrmxonlaaykvfxv --no-verify-jwt
```

Nenhuma `service_role` é necessária. A função só lê fontes públicas. CORS, ausência de autenticação nesta versão e políticas existentes permanecem como no PR. `CONMEBOL_FIXTURES_URL` é opcional e só deve ser configurada após validação da fonte oficial.

Antes de retirar o draft: conferir o HTML real do discovery, executar o workflow de validação acordado e revisar os relatórios reais de setembro/outubro/novembro. Não corrigir resultados para coincidir com gabaritos e não realizar merge automaticamente.

## Horário até a persistência

`kickoffTime` é `HH:mm | null` no consolidado; em MatchDay/JSON persistido também é opcional para compatibilidade. `16H00` e `19h30` são normalizados; `A DEFINIR` e valores inválidos viram null. CBF fornece horário local; ESPN e JSON-LD usam timestamps com fuso explícito convertidos para America/Sao_Paulo, inclusive a data na virada do dia. ESPN com timeValid=false não fornece horário.

CBF prevalece para competições domésticas; CONMEBOL para Libertadores. Somente horários da data consolidada participam da escolha. Sem horário da autoridade, um horário disponível sem discordância é provisório; horários discordantes ficam null. Divergências de horário aparecem em note e nas alternativas do modal, sem transformar sozinhas o status em conflito de data. Horário provisório nunca confirma a partida.

O formato textual é `05 19:30 - Palmeiras x Remo`; o antigo `05 - Palmeiras x Remo` permanece válido. FixtureSearchModal → importFixturesText → parseMatchesInput → MatchDay → toCalendarProjectMatches preserva kickoffTime no JSON calendar_projects.matches. A leitura existente prioriza esse JSON e serializeMatchesText preserva o horário ao reconstruir o editor. Nenhuma migração é necessária. Registros antigos sem campo carregam com null. Append identifica duplicatas por data/confronto, independentemente do horário, preservando a edição existente; substituir usa os horários revisados da busca.

Os cards visuais e a exportação de imagem mantêm o desenho atual; exportar não modifica os dados nem remove horários do editor/JSON. O horário aparece no modal de busca e no texto editável. A persistência foi testada por round-trip JSON local, sem gravação no Supabase real.
