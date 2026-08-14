# NCC Shield

Sistema web de **retenção e comissionamento** para telemarketing, integrado ao **Supabase** (Autenticação + PostgreSQL + RLS).

## Estrutura

```
ncc-shield/
├── login.html          # Tela de login (sem cadastro público)
├── dashboard.html      # Painel do operador (form, cards, tabela)
├── ranking.html        # Ranking geral (leaderboard)
├── css/
│   ├── styles.css          # Design system (tipografia, efeitos, acessibilidade)
│   ├── tailwind.css        # CSS compilado (gerado, não editar)
│   └── input.css           # Entrada do Tailwind (para rebuild)
├── js/
│   ├── config.example.js   # ← Modelo de configuração (commitável)
│   ├── config.js           # ← Suas chaves reais (NUNCA commitado — está no .gitignore)
│   ├── supabaseClient.js   # Cliente Supabase
│   ├── utils.js            # Períodos, taxa, comissão, escapeHtml e paginação
│   ├── auth.js             # Sessão, login, logout
│   ├── login.js            # Lógica da tela de login
│   ├── dashboard.js        # Lógica do painel do operador
│   ├── ranking.js          # Lógica do ranking
│   ├── theme.js            # Alternância claro/escuro (localStorage)
│   └── vendor/             # Bibliotecas baixadas (funcionam offline e sem CDN)
│       ├── supabase.min.js     # supabase-js v2
│       └── chart.umd.min.js    # Chart.js
├── tailwind.config.js  # Config do Tailwind (darkMode: class)
├── package.json        # Tailwind como devDependency (rebuild do CSS)
└── sql/schema.sql      # Script do banco (executar no SQL Editor)
```

## Passo a passo de configuração

### 1. Criar o projeto no Supabase
Acesse [supabase.com](https://supabase.com), crie um projeto e anote a **URL do projeto** e a **chave pública** (`anon` / `sb_publishable_*` — Project Settings → API).

### 2. Criar o banco de dados
Abra **SQL Editor**, cole todo o conteúdo de `sql/schema.sql` e clique em **Run**. O script cria:
- Tabelas `profiles` e `atendimentos` com RLS habilitado;
- Políticas: cada operador vê/registra apenas os próprios atendimentos;
- Trigger que cria o perfil automaticamente ao criar um usuário no Auth;
- Função `get_ranking` (RPC `SECURITY DEFINER`) que retorna apenas agregados para o leaderboard;
- Permissões de acesso (nada de leitura pública).

### 3. Criar os operadores (sem cadastro público)
No Supabase: **Authentication → Users → Add user** e informe:
- **Email** e **Password** do operador;
- Em **Custom User Metadata (JSON)**:
  ```json
  { "nome": "Maria Silva" }
  ```
  `"nome"` é obrigatório — a senha é resetada pelo admin caso o operador esqueça.
- ⚠️ **`role` NÃO deve ser colocado no User Metadata**: o operador pode alterar
  o próprio metadata via API. Para criar um **admin**, use o campo **App User
  Metadata** do dashboard (ou uma edição posterior pelo admin):
  ```json
  { "role": "admin" }
  ```
  O trigger lê `role` de `raw_app_meta_data` (não editável pelo usuário) e o
  perfil é criado automaticamente. Usuários criados antes do trigger ganham
  perfil automaticamente ao reexecutar `sql/schema.sql` (migração embutida).

### 4. Configurar as chaves (local)
```bash
# 1. Copie o modelo:
cp js/config.example.js js/config.js
```
```js
// 2. Em js/config.js, cole suas chaves:
const SUPABASE_URL = 'https://seu-projeto.supabase.co';       // Project URL
const SUPABASE_ANON_KEY = 'sua-chave-publica-aqui';           // anon / publishable key
```

> ⚠️ `js/config.js` está no `.gitignore` e **nunca** deve ser enviado ao GitHub. Use apenas a chave **pública** (`anon`/`publishable`) no frontend — chaves secretas (`sb_secret_*`/`service_role`) dão acesso total ao banco e **nunca** devem ir para arquivos de frontend.

### 5. Abrir o painel
Basta abrir `login.html` no navegador, ou servir a pasta (recomendado para uso em rede):

```bash
npx serve .
```

> As bibliotecas do frontend (Tailwind compilado, supabase-js, Chart.js) já estão
> em `css/tailwind.css` e `js/vendor/` — **não dependem de CDN**. Após alterar
> classes nos HTML/JS, regenere o CSS:
> ```bash
> npm install        # 1ª vez apenas
> npx tailwindcss -i css/input.css -o css/tailwind.css --minify
> ```

### 6. Atualizar o servidor (opcional — removendo a comissão do ranking)
Se você já rodou uma versão anterior do `sql/schema.sql`, cole no **SQL Editor** (o script abaixo é seguro para rodar de novo):

```sql
CREATE OR REPLACE FUNCTION public.get_ranking(
  p_inicio TIMESTAMPTZ DEFAULT now() - interval '7 days',
  p_fim TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  posicao BIGINT,
  operador TEXT,
  total_atendimentos BIGINT,
  total_retidos BIGINT,
  total_cancelados BIGINT,
  taxa_retencao NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH agg AS (
    SELECT
      p.id,
      p.nome AS nome_operador,
      COUNT(a.id)::BIGINT AS total,
      COUNT(a.id) FILTER (WHERE a.status = 'retido')::BIGINT AS retidos,
      COUNT(a.id) FILTER (WHERE a.status = 'cancelado')::BIGINT AS cancelados
    FROM public.profiles p
    LEFT JOIN public.atendimentos a
      ON a.user_id = p.id
      AND a.created_at >= p_inicio
      AND a.created_at < p_fim
    GROUP BY p.id, p.nome
  )
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY agg.retidos DESC,
        CASE WHEN agg.total = 0 THEN 0
             ELSE (agg.retidos::NUMERIC / agg.total) * 100 END DESC,
        agg.nome_operador ASC
    )::BIGINT AS posicao,
    agg.nome_operador,
    agg.total,
    agg.retidos,
    agg.cancelados,
    CASE WHEN agg.total = 0 THEN 0
         ELSE ROUND((agg.retidos::NUMERIC / agg.total) * 100, 1) END AS taxa_retencao
  FROM agg
  ORDER BY agg.retidos DESC,
    CASE WHEN agg.total = 0 THEN 0
         ELSE (agg.retidos::NUMERIC / agg.total) * 100 END DESC,
    agg.nome_operador ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ranking(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ranking(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
```

## Funcionalidades

- **Login restrito**: apenas e-mail e senha; sem opção de criar conta.
- **Painel do operador** (`dashboard.html`):
  - Formulário de atendimento com botões rápidos **Retido** (verde) / **Cancelado** (vermelho);
  - Período flexível: seleção **De / Até** (qualquer intervalo de datas) + botão **Hoje** — aplicado a cards, tabela e gráficos;
  - Cards: Total de Atendimentos, Retidos, Cancelados, **Taxa de Retenção** (indicador vermelho < 50%, âmbar 50–54,9%, verde ≥ 55%) e **Comissão Acumulada**;
  - Tabela com **todos os atendimentos** do operador no período (sem limite de 50), com badges coloridos e atualização em tempo real via Realtime do Supabase;
  - **Meu Desempenho:** gráficos Chart.js (barras diárias retidos × cancelados, linha da taxa de retenção e donut da distribuição) nos períodos curtos (diário) ou longos (agregado por semana);
  - **Modo escuro**: toggle ☀️/🌙 no topo (padrão sempre claro, escolha persistida em `localStorage`).
- **Ranking geral** (`ranking.html`): posições com medalhas SVG (ouro/prata/bronze), período **De/Até** flexível e ordenação por retidos/taxa; mostra a linha do próprio operador destacada. **Sem valores de comissão** — o quanto cada operador ganha é particular e só aparece no dashboard do próprio operador.

## Regras de comissão

| Taxa de Retenção      | Valor por cliente retido |
| --------------------- | ------------------------ |
| Abaixo de 50,0%       | R$ 0,00 (meta não atingida) |
| 50,0% a 54,9%         | R$ 5,00                  |
| 55,0% a 100,0%        | R$ 8,00                  |

- Taxa = (Retidos ÷ Total de Atendimentos) × 100
- Comissão = Retidos × valor da faixa

## Design system

Baseado nas recomendações do skill de design **UI UX Pro Max** (estilo Flat + Real-Time Monitoring para dashboards):

- **Tipografia:** Inter (Minimal Swiss) — ideal para dashboards e painéis administrativos; números em `tabular-nums` (`tnum`) para métricas alinhadas.
- **Paleta:** fundo `#F8FAFC`, sucesso `#22C55E`, alerta âmbar, perigo `red-600` e marca indigo.
- **Componentes em `css/styles.css`:** indicador de tempo real pulsante (`.status-dot`), skeleton de loading (`.skeleton`), spinner de botão (`.spinner`), headers de tabela fixos (`.tabela-sticky`) e suporte a `prefers-reduced-motion`.
- **Regras UX aplicadas:** feedback de submit (loading → sucesso/erro), `role="alert"` em mensagens de erro, empty states com orientação, alvos de toque mínimos, estados de foco visíveis e `cursor-pointer` em elementos clicáveis.
- **Ícones:** SVG inline (sem emojis) — incluindo as medalhas de ouro/prata/bronze do ranking.

## Segurança

- RLS ativo: operador acessa apenas os próprios atendimentos.
- O ranking usa RPC `SECURITY DEFINER` e retorna somente agregados — nomes de clientes e protocolos de terceiros nunca são expostos, e a comissão de cada operador não é retornada pela função (é visível apenas no dashboard do próprio operador).
- Chaves secretas (`sb_secret_*`/`service_role`) **nunca** em arquivos de frontend; `js/config.js` está no `.gitignore` para nunca vazar credenciais no repositório.
- Se uma chave secret for exposta em texto (ex.: e-mail/chat), **rotacione-a** imediatamente no dashboard do Supabase.
- `profiles`: usuários autenticados leem apenas `id` e `nome` (grants por coluna) — **e-mails e roles de colegas não são expostos**; o perfil próprio é lido via RPC `get_meu_perfil`.
- `role` vem de `raw_app_meta_data` (não editável pelo próprio usuário), com fallback para `raw_user_meta_data` em instalações antigas.
- Todos os dados vindos do banco (nomes, protocolos, mensagens de erro) são escapados antes de entrar no HTML (`escapeHtml`) — sem XSS.
- Login/logout: o botão **Sair** encerra a sessão local mesmo sem internet; a tela de login não pula automaticamente para o painel.
- A tabela do dashboard busca **todos** os atendimentos do período (paginação automática em blocos de 1000) — nenhum atendimento fica oculto.
