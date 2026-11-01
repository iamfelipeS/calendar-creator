# Validação real pelo GitHub Actions

Workflow: **Validate live fixture sources** (`.github/workflows/fixtures-live-validation.yml`).

Só possui `workflow_dispatch`: nenhuma consulta real é executada por push, pull request ou cron. Não faz deploy, merge, gravação no Supabase ou mudança no frontend. Permissão GitHub: somente `contents: read`; checkout sem persistir credenciais. Não usa secrets Supabase.

## Execução

1. Abrir **Actions → Validate live fixture sources**:
   https://github.com/iamfelipeS/calendar-creator/actions/workflows/fixtures-live-validation.yml
2. Clicar **Run workflow**.
3. No seletor **Branch**, escolher `feat/palmeiras-fixtures-v1`.
4. Clicar **Run workflow** novamente.
5. Ler o Summary e baixar o artifact **fixture-live-validation**, com Markdown e JSON.

**Pré-requisito do GitHub:** um workflow inédito com `workflow_dispatch` precisa existir na branch padrão para aparecer no botão Run workflow. Enquanto este arquivo existir apenas na branch do PR, a interface pode mostrar 404/ausência do workflow. Não é um erro do validador. [Documentação oficial](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

Esta entrega não faz merge nem escreve na `main`. Para habilitar o botão sem integrar a implementação, é possível cadastrar **somente o arquivo de workflow** na `main`, e então escolher a branch do PR ao executar. A execução deve usar a branch do PR porque os scripts e adapters ainda não existem na `main`. Isso é uma alteração separada de infraestrutura a ser feita pelo mantenedor; nenhum merge do PR #1 é necessário.

Uma vez cadastrado na branch padrão, também pode ser disparado por uma CLI autenticada:

```sh
gh workflow run fixtures-live-validation.yml \
  --repo iamfelipeS/calendar-creator \
  --ref feat/palmeiras-fixtures-v1
```

A ferramenta GitHub conectada nesta sessão não oferece dispatch de workflows. A CLI disponível não tem autenticação válida. Logo, a criação/checagem do código não deve ser apresentada como execução real das fontes.

## Configuração opcional CONMEBOL

Repository Actions Variable `CONMEBOL_FIXTURES_URL`: URL oficial validada, opcional. Não colocar tokens ou credenciais nessa URL. Sem ela, registra exatamente:

> CONMEBOL: integração oficial ainda não configurada

Essa pendência não falha a execução por si só. Com URL configurada, o mesmo adapter existente aplica sua restrição a HTTPS em `conmebol.com`/subdomínios e recusa redirects. Nenhum endpoint é descoberto/inventado pelo script. Presença de JSON-LD e quantidade de eventos compatíveis são registradas sem logar o conteúdo da página ou a URL configurada.

## O que é executado

`scripts/validate-fixture-sources.ts` executa os meses 9, 10 e 11 de 2026. O módulo auxiliar `scripts/fixture-live-validation.ts` injeta um fetcher de observação nos adapters reais de `supabase/functions/_shared/sources.ts` e usa `syncFixtures()` para normalização/conciliação de produção.

Não há parser alternativo nem adaptação silenciosa de payload. As checagens estruturais adicionais só detectam incompatibilidades que o parser atual poderia ignorar. As referências de setembro/outubro são usadas exclusivamente depois da consulta para comparação. Mês a mês, mantém-se o teto de seis chamadas concorrentes CBF.

O observador preserva a resposta original entregue ao adapter, respeita o timeout do request e limita a leitura auxiliar a 3 MB. Não imprime HTML, JSON bruto, cabeçalhos, erros de rede completos, tokens ou stack traces. O relatório projeta fixtures para campos públicos (data, confronto, competição, status, confidence e fontes/datas), omitindo URLs configuradas e payloads de origem.

## Relatório e resultado

- CBF: HTTP por dia, dias consultados/sucesso, estrutura básica, fixtures extraídas e jogos do Palmeiras.
- ESPN: três ligas, HTTP, quantidade de eventos, fixtures/datas, sempre fonte secundária.
- Palmeiras: HTTP, presença de JSON-LD, eventos compatíveis, uso de fallback HTML e partidas no mês.
- CONMEBOL: skip explícito sem configuração; com configuração, resultado do adapter e JSON-LD.
- Cada mês: observações por fonte, consolidação, divergências, warnings e sourceErrors.
- Setembro/outubro: confronto encontrado, coincidência de data, datas efetivas por fonte, status e confiança; jogos adicionais também ficam visíveis.
- Novembro: todas as fixtures consolidadas e suas fontes.

Artefatos gerados mesmo quando a validação encontra erros de fonte:

- `artifacts/fixture-live-validation.md`
- `artifacts/fixture-live-validation.json`

O upload usa `if: always()` e retenção de 14 dias. Interrupção/timeout do runner ou erro anterior à execução do script podem impedir a criação dos arquivos; isso não conta como relatório concluído.

Falhas críticas (exit 1): formato HTTP 2xx incompatível com adapter, erro de código/configuração ou nenhuma fonte oficial principal acessível com estrutura reconhecida. ESPN sozinha não satisfaz o último critério. Falhas de HTTP/rede isoladas, divergências com gabarito, jogos extras, fonte parcial e CONMEBOL não configurada ficam no relatório sem reprovar sozinhos. Assim, verde significa **execução sem erros críticos**, não validação completa de todas as fontes ou autorização para merge.

## Testes locais sem rede

```sh
pnpm run test:fixtures
deno check scripts/validate-fixture-sources.ts
```

`tests/fixture-live-validation.test.ts` testa o validador com respostas sintéticas injetadas; esses testes não são consultas reais. O workflow existente Check fixture search executa os testes junto da suíte anterior, sem acionar a consulta real.

## Estado desta entrega

Workflow/script criados e testados, sem consulta real realizada nesta sessão. CBF, ESPN e Palmeiras continuam não validadas ao vivo; CONMEBOL continua pendente de URL oficial. O PR #1 deve permanecer em draft até o relatório de uma execução real ser analisado. Nenhum adapter foi corrigido com base em dados simulados.
