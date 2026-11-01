# Busca e revisão de jogos do Palmeiras — v1 parcial

## Estado desta entrega

A implementação entrega o motor de busca, normalização, conciliação e revisão humana. Não deve ser apresentada como pesquisa completa das quatro fontes: a integração CONMEBOL continua pendente de um endpoint oficial validado, e os adapters CBF/Palmeiras/ESPN precisam de teste ao vivo a partir do Supabase. Os testes automatizados de parser usam respostas sintéticas e não comprovam cobertura real.

Não há cron, autenticação, publicação automática, gravação no banco pela função ou alteração de RLS. Nenhum jogo do gabarito foi colocado na lógica de produção. A busca não grava calendários; só o botão existente “Salvar calendário” persiste a importação.

## Arquitetura e fontes

`supabase/functions/sync-palmeiras-fixtures` expõe POST `{ "month": 11, "year": 2026 }`. Retorna `fixtures`, `sourceErrors`, `sourceCounts`, período, `fetchedAt` e fuso `America/Sao_Paulo`. Respostas parciais também usam HTTP 200; zero resultados com erros não significa ausência de partidas. O frontend chama exclusivamente a Edge Function.

Responsabilidades em `supabase/functions/_shared`:

- `contracts.ts`: contrato compartilhado com frontend.
- `sources.ts`: requisição e parser separado para cada fonte.
- `normalize.ts`: nomes canônicos, competições e datas locais.
- `reconcile.ts`: agrupamento e regras de autoridade.
- `sync.ts`: execução independente com `Promise.allSettled`, contagens, erros sanitizados e logs.

| Fonte | Estratégia | Limitação/estado |
| --- | --- | --- |
| CBF | JSON público diário `/api/cbf/calendario/jogos/YYYY/MM/DD`, com até seis requisições simultâneas; parser de `jogos → campeonato → categoria → jogos` | Endpoint identificado no cliente público `cbf_calendario` 0.4.1; acesso direto não validado neste ambiente. Só considera detalhado se houver horário. Dias indisponíveis geram aviso de cobertura parcial. |
| ESPN | Scoreboard JSON de `bra.1`, `bra.copa_do_brasil` e `conmebol.libertadores`, com intervalo do mês e limite de 1000 | Fonte secundária; não vira autoridade mesmo se o status disser scheduled. Formato testado com amostras sintéticas; falta validação ao vivo. |
| Palmeiras | Primeiro JSON-LD `SportsEvent`; fallback de cartões semânticos da página oficial `/dados-jogos/jogos/`, com competição/ano, data, horário e confronto | Sem endpoint JSON/XHR confirmado; o fallback HTML precisa de validação com a página real. A página pode não trazer histórico completo. Nunca usa notícias aleatórias como tabela de jogos. |
| CONMEBOL | Parser isolado de JSON-LD `SportsEvent`, ativado apenas por `CONMEBOL_FIXTURES_URL` oficial e validada | **Pendente**: portal usa conteúdo dinâmico/Opta, sem endpoint acessível confirmado. Sem configuração, retorna aviso explícito. Não usa ESPN sob o nome CONMEBOL. Uma página sem SportsEvent não passa a contar como consulta bem-sucedida. |

Não há endpoint arbitrário fornecido pelo cliente. A URL opcional CONMEBOL fica no servidor, só aceita HTTPS em `conmebol.com` ou subdomínios, sem credenciais/porta; redirects são recusados. Cada request tem timeout de 5 s e resposta limitada a 3 MB. HTML bruto, stack traces e detalhes de erro do fetch não saem da função. Logs têm evento, período, fonte, contagens e falhas, sem payloads ou chaves.

Fontes consultadas na investigação:
- CBF: https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026
- Cliente público CBF (formato e rota, precisa ser revalidado na CBF): https://rubydoc.info/gems/cbf_calendario/CbfCalendario/Client
- Palmeiras: https://www.palmeiras.com.br/dados-jogos/jogos/
- Portal CONMEBOL: https://gol.conmebol.com/libertadores/es/fixture
- ESPN: `https://site.api.espn.com/apis/site/v2/sports/soccer/{liga}/scoreboard`

## Conciliação e confiança

CBF é autoridade para Brasileirão e Copa do Brasil; CONMEBOL para Libertadores. Palmeiras é apoio e ESPN é secundária. Nomes conhecidos têm aliases (LDU, Athletico-PR, RB Bragantino etc.); nomes desconhecidos não são adivinhados.

Partidas são agrupadas por competição, mandante e visitante; rodadas/pernas conhecidas diferentes ficam separadas. Sem rodada comum, a tolerância entre fontes é sete dias e apenas um candidato compatível pode ser conciliado. Partidas repetidas na mesma fonte ficam separadas. Adiamentos maiores/identidade ambígua podem aparecer como linhas distintas: revisar manualmente. Comparações próximas à fronteira de mês dependem da cobertura recebida das fontes; não há busca ampliada para meses vizinhos nesta versão.

- Datas diferentes nas fontes agrupadas: `conflict`, confiança `low`. Exibe a data da autoridade quando disponível, sem ocultar alternativas e sem marcar por padrão.
- Participação explicitamente dependente de classificação: `conditional`, confiança `low`, desmarcada.
- Autoridade da competição com data detalhada e sem divergência: `confirmed`, confiança `high`, marcada.
- Sem confirmação oficial detalhada: `base_date`, marcada com alerta; confiança `medium` se Palmeiras e ESPN concordarem, `low` com fonte única.

Possíveis mata-matas só são incluídos quando existe evidência de um participante condicional ligado ao Palmeiras na fonte. A função não inventa jogos de semifinal/final a partir de um calendário genérico. O preenchimento de brackets futuros ainda depende da fonte oficial; cobertura condicional não é completa enquanto CONMEBOL estiver pendente.

Datas ISO com timezone são convertidas para Brasília. Datas sem horário ficam como data civil; timestamps sem timezone são rejeitados. Um conflito com data prioritária fora do mês é exibido, mas não pode ser importado nesse mês.

## Interface e importação

Botão “Buscar jogos automaticamente” na home abre modal acessível com mês/ano inicialmente iguais ao calendário. Cada linha mostra confronto, competição, status, confiança, todas as datas/fontes e nota. Condicionais e conflitos vêm desmarcados. Erros parciais e ausência de dados ficam visíveis.

“Importar selecionados” pede substituir/adicionar/cancelar se houver texto atual. Adicionar só é permitido no mesmo mês/ano; preserva linhas manuais e evita duplicatas por data + mandante + visitante usando `normalizeTeamSlug()`. A importação procura o nome associado aos escudos existentes, inclusive aliases conhecidos, e atualiza lista, preview e estado “Alteracoes nao salvas”. Substituir por outro período atualiza também mês e ano. Nenhum POST/PATCH de calendário é feito pela importação.

## Executar verificações

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:fixtures
pnpm run build:client
# Deno 2 instalado:
deno check --config supabase/functions/deno.json supabase/functions/sync-palmeiras-fixtures/index.ts
# Teste de integração da UI com backend simulado, sem gravações reais:
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node tests/fixtures-ui.mjs
```

O workflow `Check fixture search` executa unitários e `deno check`. O smoke publicado existente continua validando home, calendário salvo, escudos, imagens, navegação, refresh e console; não depende de a nova Edge Function já estar implantada.

## Deploy no projeto existente

Projeto: `pltfxvrmxonlaaykvfxv`. O ambiente desta entrega só tem URL e chave pública, sem `SUPABASE_ACCESS_TOKEN`/sessão administrativa ou ferramenta de deploy Supabase. A função **não foi implantada**. Não criar outro projeto.

Com CLI Supabase instalado e credencial administrativa no terminal de quem já administra o projeto:

```sh
supabase login
supabase functions deploy sync-palmeiras-fixtures --project-ref pltfxvrmxonlaaykvfxv --no-verify-jwt
```

Não há secret adicional obrigatório para a busca atual; ela só lê fontes públicas e não precisa de `service_role`. O deploy necessita autenticação administrativa na CLI, que não deve ser versionada nem enviada ao frontend.

**Somente depois de validar uma página oficial que realmente exponha JSON-LD de partidas**, configurar opcionalmente:

```sh
supabase secrets set CONMEBOL_FIXTURES_URL='URL_HTTPS_OFICIAL_VALIDADA' --project-ref pltfxvrmxonlaaykvfxv
```

Não configurar uma URL por tentativa só para eliminar o aviso. O parser não suporta automaticamente qualquer formato de Opta/Drupal.

Para desenvolvimento local (Docker/Supabase local disponíveis):

```sh
supabase start
supabase functions serve sync-palmeiras-fixtures --no-verify-jwt
```

Apontar as variáveis Vite para o Supabase local em `.env.local`, ignorado pelo Git, usando URL/chave pública locais. Não usar a chave do projeto remoto contra a instância local.

CORS aceita `https://iamfelipes.github.io` (origem não contém `/calendar-creator/`) e localhost/127.0.0.1/IPv6 local com portas de desenvolvimento. `verify_jwt=false` é intencional: esta versão sem login é um endpoint público de leitura, sem operação privilegiada. CORS não é controle de autenticação.

## Validação real de setembro, outubro e novembro

Após deploy, chamar pelo painel nos meses 9, 10 e 11 de 2026 ou usar terminal, com as variáveis públicas do projeto já configuradas:

```sh
for month in 9 10 11; do
  curl --fail-with-body "$VITE_SUPABASE_URL/functions/v1/sync-palmeiras-fixtures" \
    -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" \
    -H 'Origin: https://iamfelipes.github.io' \
    -H 'Content-Type: application/json' \
    --data "{\"year\":2026,\"month\":$month}"
done
```

Não use `curl -v` em logs compartilhados, nem publique as configurações locais. Compare `sources`, datas e erros, sem tomar o gabarito como fonte oficial. As listas fornecidas para setembro/outubro aparecem **apenas em testes de formato de importação**, explicitamente rotulados como sintéticos; os testes não simulam aprovação histórica.

Resultado desta entrega:
- Setembro: formato do gabarito testado (6 jogos); consulta histórica real **pendente**.
- Outubro: formato do gabarito testado (7 jogos); consulta histórica real **pendente**.
- Novembro: regras/seleção/importação testadas com amostras sintéticas; busca real **pendente**.
- Acesso direto às fontes não está liberado na política de rede deste ambiente. A pesquisa web encontrou páginas, mas não fornece prova de execução dos parsers.
- Critério para concluir a validação real: CBF retorna jogos detalhados, ESPN e Palmeiras são comparadas, falhas de fonte são identificadas, divergências são revisadas e CONMEBOL é integrada com dados oficiais verificáveis. Até lá a busca deve ser tratada como prévia parcial.

Deploy do frontend continua pelo workflow existente de Pages, quando esta implementação for integrada à branch `main`. Implantar a Edge Function e fazer a validação real antes de disponibilizar a funcionalidade como pronta para uso regular.
