# Supabase no build

Use o projeto Supabase existente. Em GitHub → repositório → Settings → Secrets and variables → Actions → Variables, cadastre duas Repository variables:

- `VITE_SUPABASE_URL`: Project URL do projeto existente, em Supabase Dashboard → Project Settings → API (ou Data API).
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave publishable do mesmo projeto, em Project Settings → API Keys. Use a chave pública já usada localmente; nunca uma secret key ou `service_role`.

Se os valores estiverem no `.env` da máquina local que já funciona, reutilize-os. Para desenvolvimento neste ambiente, configure as mesmas variáveis nas configurações do ambiente ou em `.env.local` ignorado pelo Git. `.env.example` contém somente os nomes vazios. Nunca versione valores reais.

O workflow `.github/workflows/build.yml` mantém a validação de CI. O `.github/workflows/deploy-pages.yml` executa em push na `main` ou manualmente, instala com o pnpm de `packageManager` e lockfile congelado, verifica TypeScript e publica somente `dist/public` usando as actions oficiais do GitHub Pages. Ambos recebem as Repository variables por `env`. O deploy usa o environment `github-pages`. As variáveis `VITE_*` são incorporadas ao frontend durante o build; reinicie o Vite ou refaça o build após alterá-las. Não use `SUPABASE_SERVICE_ROLE_KEY` no frontend.

Após configurar os valores e permitir o hostname exato do projeto na rede deste ambiente, valide contra a infraestrutura existente:

1. Instale com `corepack pnpm install --frozen-lockfile`. Execute `corepack pnpm run check` e `corepack pnpm run dev`. Para reproduzir o build de Pages, execute `VITE_BASE_PATH=/calendar-creator/ corepack pnpm exec vite build`.
2. Abra Calendar Creator e confirme que o último calendário salvo carrega sem erros do Supabase.
3. Abra `/escudos` e confirme os registros da Biblioteca de Escudos.
4. Confirme que as imagens de uploads existentes carregam sem erros de Storage.

Não execute migrações, recrie buckets ou altere políticas para esta configuração. Sem os valores existentes, a conexão, os dados salvos e os uploads não podem ser validados. O workflow de build não substitui essas verificações funcionais.


## GitHub Pages

Em Settings → Pages → Build and deployment → Source, selecione **GitHub Actions**. Após os arquivos chegarem à `main`, o workflow de deploy executa automaticamente; para repetir, use Actions → Deploy Calendar Creator to GitHub Pages → Run workflow.

URL esperada: `https://iamfelipes.github.io/calendar-creator/`. A URL efetiva é fornecida pelo step `actions/deploy-pages` e pelo environment `github-pages`; só considere publicada após sucesso do deploy.

O Vite usa `/` por padrão e recebe `/calendar-creator/` via `VITE_BASE_PATH` no deploy. Em produção, Wouter usa hash routing: Home em `/calendar-creator/#/` e Biblioteca em `/calendar-creator/#/escudos`. Os links Wouter existentes geram os hashes automaticamente. O fragmento não é enviado ao servidor, então abrir ou atualizar a Biblioteca funciona em hospedagem estática. Em desenvolvimento, as rotas continuam `/` e `/escudos`. O caminho antigo sem hash `/calendar-creator/escudos` não é uma URL publicada válida no Pages.

Após publicar, o job `smoke` usa Chromium e consultas somente de leitura para verificar o calendário mais recente, os escudos persistidos, imagens existentes, navegação, refresh e respostas HTTP de assets. Ele exige que existam ao menos um calendário salvo e um escudo persistido; falhas não alteram dados nem desfazem automaticamente o deploy. O resultado só é confirmado quando esse job termina com sucesso. Nenhum teste cadastra jogos ou modifica o Supabase.

Para repositórios privados, GitHub Pages exige um plano compatível (como GitHub Pro/Team/Enterprise). Repositório privado não implica site privado: o Pages normalmente publica o site para acesso público; os dados acessíveis pela chave pública continuam sujeitos às políticas existentes do Supabase. Este deploy não altera essas políticas. Se a opção Pages não estiver disponível, será necessário um plano compatível para manter o repositório privado.
