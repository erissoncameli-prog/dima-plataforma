# DIMA — Plataforma de Gestão UNESCO
## Projeto 218BRA2001 · SEMA/AC

---

## Estrutura de arquivos

```
dima-platform/
├── index.html              ← Tela de login
├── css/
│   └── global.css          ← Estilos globais
├── js/
│   ├── config.js           ← Supabase + i18n + helpers
│   └── layout.js           ← Sidebar/topbar compartilhados
├── pages/
│   └── dashboard.html      ← Dashboard principal
├── 02_criar_admin.sql      ← SQL para criar usuário admin
└── README.md               ← Este arquivo
```

---

## Como publicar no GitHub Pages

### 1. Criar repositório no GitHub
1. Acesse github.com e clique em **New repository**
2. Nome: `dima-plataforma` (ou similar)
3. Visibilidade: **Private** (recomendado) ou Public
4. Clique em **Create repository**

### 2. Fazer upload dos arquivos
1. Na página do repositório, clique em **uploading an existing file**
2. Arraste TODA a pasta `dima-platform` (ou os arquivos individualmente)
3. Clique em **Commit changes**

### 3. Ativar GitHub Pages
1. No repositório → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** · Folder: **/ (root)**
4. Clique em **Save**
5. Aguarde ~2 minutos e acesse: `https://SEU_USUARIO.github.io/dima-plataforma/`

---

## Como criar o usuário administrador

### Passo 1 — Criar conta no Supabase Auth
1. No Supabase → **Authentication** → **Users**
2. Clique em **Add user** → **Create new user**
3. Preencha e-mail e senha forte
4. Clique em **Create user**
5. Copie o **UUID** do usuário criado (coluna User UID)

### Passo 2 — Registrar na tabela de usuários
1. Abra o arquivo `02_criar_admin.sql`
2. Substitua `COLE-O-UUID-AQUI` pelo UUID copiado
3. Substitua o nome e e-mail pelos dados reais
4. Cole no **SQL Editor** do Supabase e execute

### Passo 3 — Acessar o sistema
1. Acesse a URL do GitHub Pages
2. Faça login com o e-mail e senha criados
3. Você terá acesso de **Super Admin** a todos os módulos

---

## Tecnologias
- **Frontend**: HTML5 + CSS3 + JavaScript puro
- **Backend/Banco**: Supabase (PostgreSQL + Auth + RLS)
- **Hospedagem**: GitHub Pages (gratuito)
- **Fontes**: DM Sans + DM Mono + Fraunces (Google Fonts)

---

## Suporte
Sistema desenvolvido no âmbito do TDR 218BRA2001-TDR-PLATAFORMA-001.
Manutenção e novos módulos conforme contrato vigente.
