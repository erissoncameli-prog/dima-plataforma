# Site público — documentação técnica

Programa de Resiliência Socioambiental nas APAs Igarapé São Francisco e Lago do Amapá
(Projeto UNESCO 218BRA2002). Este documento é para a equipe técnica da SEMA/UNESCO que
faz a manutenção do site: como ele é organizado, de onde vêm os dados, como atualizar o
conteúdo e como publicar uma nova versão.

**Resumo em uma frase:** são páginas HTML, CSS e JavaScript puro, sem etapa de compilação,
que leem os dados da plataforma de gestão por funções públicas do banco — só números
agregados ou itens liberados um a um. Editar um arquivo e publicá-lo é tudo o que uma
mudança exige.

---

## 1. Arquitetura

### 1.1 Páginas

| Página | Arquivo | O que mostra |
|---|---|---|
| Início | `index.html` | Apresentação, fotos e vídeos, números gerais do Programa, convite à API de dados |
| Mapa Interativo | `mapa.html` | Entregas no mapa (pontos, trilhas e áreas), camadas das APAs, filtros |
| Resultados | `resultados.html` | Indicadores e metas da matriz de resultados |
| Transparência Financeira | `transparencia-financeira.html` | Orçamento, pago, a pagar, reservado e livre, no total e por resultado |
| Linha do Tempo | `linha-do-tempo.html` | Marcos e produtos aprovados, desde a assinatura do acordo |
| Produtos | `produtos.html` | Galeria dos produtos técnicos liberados, com capa e leitura do documento |
| Sobre o Projeto | `sobre.html` | Narrativa do Programa guiada pela rolagem e a apresentação "Assistir apresentação" |

`sobre-antigo.html` é a versão anterior da página Sobre, guardada como cópia de segurança.
Não aparece no menu.

### 1.2 Arquivos compartilhados

| Arquivo | Função |
|---|---|
| `css/tokens.css` | Cores, fontes, espaçamentos e temas claro/escuro (*design tokens*). Toda cor nova entra aqui |
| `css/layout.css` | Cabeçalho, menu, rodapé e estrutura comum das páginas |
| `css/cinema.css`, `css/apresentacao.css` | Efeitos da página Sobre e da apresentação |
| `js/supabase.js` | **Único módulo de acesso a dados**: endereço do banco e chave pública |
| `js/layout.js` | Monta cabeçalho, menu e rodapé em todas as páginas |
| `js/i18n.js`, `js/i18n-en.js`, `js/i18n-es.js` | Idiomas (ver 3.6) |
| `js/cinema.js`, `js/apresentacao.js` | Animações da página Sobre |

Cada página carrega, nesta ordem: `vendor/supabase-js…`, `js/supabase.js`, `js/i18n.js`,
`js/i18n-en.js`, `js/i18n-es.js`, `js/layout.js` e o script próprio da página (no fim do HTML).

### 1.3 Conteúdo no HTML

Os textos institucionais (títulos, apresentações, explicações) estão escritos no próprio
HTML, em português. Mecanismos de busca e leitores de tela os encontram sem depender de
JavaScript. Os números e listas que vêm do banco ocupam espaços já reservados na página e
são preenchidos quando chegam; se o banco não responder, a página mostra uma mensagem clara
no lugar.

### 1.4 Bibliotecas e fonte

Tudo é servido pelo próprio site, na pasta `vendor/` — nenhuma página depende de CDN de
terceiros. Versões, licenças, origem e conferência (SHA-256) de cada arquivo estão em
`vendor/LEIA-ME.md`.

| Biblioteca | Uso |
|---|---|
| supabase-js 2.119.0 | Acesso aos dados (todas as páginas com dado) |
| Leaflet 1.9.4, MarkerCluster 1.5.3, MiniMap 3.6.1 | Mapa Interativo |
| Turf 6.5.0 | Área da camada clicada no mapa (carregada depois que a página abre) |
| GSAP 3.15.0 | Animações da página Sobre |
| pdf.js 4.7.76 | Leitura dos documentos na página Produtos |
| Montserrat v31 (fonte) | Todas as páginas |

O que ainda vem de fora, por ser conteúdo e não biblioteca: os blocos de imagem de satélite
do mapa (servidor de mosaico) e as fotos/vídeos/logos cadastrados na plataforma.

### 1.5 Desempenho, acessibilidade e privacidade — regras que o código segue

- Espaço reservado para o que vem do banco (a página não "pula" quando os dados chegam).
- A página inicial baixa só a foto/vídeo exibido e o próximo.
- Movimento automático pode ser pausado; quem configura o aparelho para reduzir movimento
  recebe as páginas sem animação.
- Contraste mínimo de 4,5:1 nos textos; todo controle tem nome lido pelo leitor de tela.
- Nenhum dado pessoal, valor de contrato individual ou nome de fornecedor (além da autoria
  dos produtos liberados) sai do banco para o site.

---

## 2. Funções de dados consumidas

O site usa a **chave pública** do banco (em `js/supabase.js`). Com ela, o visitante **não
lê nenhuma tabela da plataforma** — só executa as funções públicas abaixo, que devolvem
apenas o que a política de privacidade permite, e lê três tabelas de identidade visual e
de mídia do mapa.

| Função | Página | O que devolve | Regra de privacidade |
|---|---|---|---|
| `fn_publico_resumo_home` | Início | Números gerais (atividades, TDRs, produtos, pontos, indicadores, execução) | Só contagens e percentuais |
| `fn_publico_operacional` | Início, Transparência | Atividades e TDRs por fase, indicadores e produtos (contagens) | Só contagens |
| `fn_publico_mapa` | Mapa | Pontos e geometrias das entregas (local, tipo, data, fotos, vídeo) | Sem responsável, valor ou fornecedor |
| `fn_publico_camadas` | Mapa | Camadas das APAs e temáticas (geometrias com 6 casas decimais) | Só dados geográficos |
| `fn_publico_tipos_mapa` | Mapa | Cor e ícone de cada tipo de entrega | — |
| `fn_publico_resultados` | Resultados, Transparência | Indicadores, metas e realizado da matriz | Só números da matriz |
| `fn_publico_financeiro_agregado` | Transparência | Orçamento, pago, a pagar, reservado e livre, em US$ e R$, no total e por resultado; cotação PTAX | Nunca por contrato ou fornecedor; atividade só em percentual |
| `fn_publico_linha_tempo` | Linha do Tempo | Data do acordo e eventos publicados | Só texto publicado pelo responsável; sem nome de fornecedor |
| `fn_publico_galeria_produtos` | Produtos | Produtos liberados: título, objeto, resultado, atividade, autoria, data, capa e documentos | Só o que foi liberado no Acervo; nunca valor, contrato, nota técnica ou nome do arquivo |

**Serviços (Edge Functions) usados pelo site:**

| Serviço | Página | O que entrega |
|---|---|---|
| `publico-capa` | Produtos | Imagem da capa de um produto liberado |
| `publico-produto` | Produtos | O documento (PDF) de um produto liberado, para leitura na página |

Os dois buscam o arquivo na área privada de armazenamento e só entregam o que está liberado
e válido; qualquer outro pedido recebe "não encontrado".

**Tabelas lidas diretamente** (só leitura, sem dado pessoal): `configuracoes_sistema`
(identidade visual, fotos e vídeos da página inicial, data do acordo), `geometria_fotos`
(fotos das geometrias do mapa) e `trilha_metadata` (vídeos das trilhas).

As funções estão versionadas em `../supabase/migrations/` (arquivos `*_publico_*.sql`).

---

## 3. Atualização de conteúdo

A maior parte do conteúdo **se atualiza sozinha**: números, mapa, indicadores, valores e
produtos vêm da plataforma de gestão no momento em que a página abre. O que exige ação:

### 3.1 Liberar um produto na página Produtos

Na plataforma: **Acervo Digital → abrir o produto → no arquivo, botão "Marcar como público"** → confirmar em **Liberar**.
Só o administrador do sistema (super_admin) libera, arquivo a arquivo. Antes de liberar,
confira se o documento não traz CPF, dados bancários ou outro dado pessoal além da autoria:
um PDF liberado pode ser **lido inteiro** no site. Só entra arquivo da versão vigente de
produto aprovado. Para retirar, clique em **Público** no mesmo arquivo (ele sai da lista na hora; capa e documento podem levar até 10 minutos para deixar de abrir, pelo cache).

### 3.2 Publicar um evento na Linha do Tempo

Na plataforma: **Acervo Digital → abrir o produto aprovado → seção "Linha do Tempo do site
público"** → escrever título e texto → **Publicar na Linha do Tempo** (ou **Salvar rascunho** para terminar depois). Pode publicar o responsável ou o
substituto da atividade (ou o super_admin). A data do evento é a da aprovação do produto.
O marco inicial vem de **Configurações → Dados do sistema → Data de assinatura do acordo**.

### 3.3 Fotos e vídeos da página inicial, logos

Na plataforma: **Configurações → Dados do sistema → Fotos e vídeos** (com legenda) e
**Logos**. Valem também para a tela de entrada da plataforma. Prefira fotos de até ~500 KB
(a página inicial baixa uma de cada vez, mas foto grande atrasa a primeira).

### 3.4 Pontos e camadas do mapa

Os pontos vêm das entregas e do **Mapa Interativo** da plataforma (**Adicionar ponto** e **Importar .xlsx**, por super_admin e coordenação). As camadas das APAs e temáticas também são
cadastradas lá; a versão leve usada no site é gerada automaticamente quando a camada é
gravada.

### 3.5 Textos institucionais (português)

Os textos fixos estão no HTML de cada página. Para mudar: abra o arquivo, localize o texto
e altere. Se o elemento tiver `data-i18n="chave"`, mude também a tradução da mesma chave
em `js/i18n-en.js` e `js/i18n-es.js`.

### 3.6 Idiomas (português, inglês e espanhol)

- **Português**: é o texto do próprio HTML (`data-i18n="chave"` marca o que é traduzível);
  textos montados por JavaScript ficam em `TEXTOS_PT`, em `js/i18n.js`.
- **Inglês e espanhol**: dicionários `js/i18n-en.js` e `js/i18n-es.js`, com as mesmas chaves.
- Texto novo: crie a chave nos três lugares. Chave sem tradução aparece em português.
- O conteúdo que vem do banco (nomes de indicadores, locais, legendas) não é traduzido.
- A escolha de idioma do visitante fica guardada no navegador dele.

---

## 4. Publicação

### 4.1 Ambiente atual (Vercel)

O site é publicado automaticamente a partir do repositório da plataforma: uma mudança
aprovada (merge) na branch `main` vira uma nova versão no ar em cerca de 1 minuto.

1. Faça a mudança numa branch e abra um Pull Request para `main`.
2. Revise o diff e faça o merge.
3. Confira a publicação (status "Ready"/"success" no Pull Request) e abra as páginas
   alteradas.

**Voltar à versão anterior:** no painel do Vercel, **Deployments → versão anterior →
Instant Rollback** (ou **Promote**; instantâneo); depois desfaça o commit no repositório (`git revert`).

### 4.2 Servidor próprio (self-hosted)

O mesmo código é servido pelo container `web` (nginx) de `docker-compose.local.yml`:

```bash
cd dima-app
git pull
# só se a mudança mexeu em docker/ (configuração do servidor):
docker compose -f docker-compose.local.yml up -d --force-recreate web
```

Arquivos de página, CSS e JS valem na hora (não há compilação). O nginx comprime as
respostas e guarda as bibliotecas de `vendor/` por 30 dias — por isso **uma biblioteca nova
entra sempre numa pasta nova com a versão no nome** (ex.: `leaflet-1.9.5/`), nunca
sobrescrevendo a pasta antiga.

**Voltar à versão anterior:** `git log` para achar o commit e `git checkout <commit> -- site-publico/`
(ou `git revert`).

### 4.3 Mudança no banco (funções públicas)

Funções novas ou alteradas entram como arquivo novo em `supabase/migrations/`
(`AAAAMMDD_descricao.sql`), nunca editando o banco "na mão":

- **Supabase (produção atual):** colar o arquivo no **SQL Editor** e executar.
- **Servidor próprio:** `PGOPTIONS='-c search_path=public,extensions' psql … -f arquivo.sql`
  e depois `NOTIFY pgrst, 'reload schema';` (sem isso a API não enxerga a função nova).

**Regras de privacidade obrigatórias** para qualquer dado novo no site:

- Nunca dar acesso direto (`GRANT`) de tabela ao papel `anon`. Dado público sai por função
  `fn_publico_*` com `SECURITY DEFINER`, que devolve só o necessário.
- Toda função nova: `revoke execute … from public, anon;` e `grant execute … to anon` só se
  for para o site.
- Dado pessoal novo no site exige registro no inventário de tratamentos (ROPA, tela
  Configurações → Privacidade).

### 4.4 Conferência depois de publicar

1. Abrir as páginas alteradas no computador e no celular, nos três idiomas.
2. Medir com o Lighthouse (DevTools do Chrome/Edge → Lighthouse, perfis "Mobile" e
   "Desktop"): meta de 90 ou mais em Desempenho, Acessibilidade, Boas Práticas e SEO.
3. Se mexeu em dado: conferir que a página mostra os números e que nada além do previsto
   aparece.

### 4.5 Domínio e buscadores

- **`robots.txt`** e **`sitemap.xml`** ficam na **raiz do repositório** (não em `site-publico/`),
  porque os buscadores só os procuram na raiz do domínio. O `robots.txt` libera só
  `/site-publico/` (e a raiz, que redireciona para lá); a plataforma de gestão fica de fora.
  `sobre-antigo.html` (cópia de segurança) também fica de fora e tem `noindex`.
- Cada página traz no `<head>` o endereço completo dela em `og:url` e `<link rel="canonical">`,
  e a imagem de compartilhamento em `og:image` (`assets/og-imagem.jpg`, 1200 × 630, usada
  por WhatsApp e redes sociais).
- **Página nova:** acrescentar no `sitemap.xml` e copiar o bloco de `<meta>` de outra página,
  trocando título, descrição, `og:url` e `canonical`.
- **Troca de domínio** (ex.: saída do Vercel para o endereço definitivo): o endereço aparece
  em `robots.txt`, `sitemap.xml` e no `<head>` das 7 páginas. Trocar de uma vez:

  ```bash
  cd dima-app
  grep -rl 'https://fundobrasilonu-plataforma.vercel.app' robots.txt sitemap.xml site-publico/*.html \
    | xargs sed -i 's#https://fundobrasilonu-plataforma.vercel.app#https://NOVO-ENDERECO#g'
  ```

  Depois, cadastrar o domínio no Google Search Console e enviar o `sitemap.xml`.

---

## 5. Onde mais procurar

| Assunto | Onde |
|---|---|
| Bibliotecas, versões, licenças | `vendor/LEIA-ME.md` |
| Narração da apresentação da página Sobre | `../docs/site-publico/roteiro-narracao-apresentacao.md` |
| API de dados para outras plataformas | `../docs/api/README.md` |
| Instalação do servidor próprio | repositório `dima-db`, `DEPLOY.md` |
| Funções do banco | `../supabase/migrations/` |
