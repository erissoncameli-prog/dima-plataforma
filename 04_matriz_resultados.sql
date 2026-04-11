-- ═══════════════════════════════════════════════════════════════════
-- DIMA · Migração 04 — Matriz de Resultados, ODS e Kunming-Montreal
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. ODS — 17 Objetivos de Desenvolvimento Sustentável ─────────
CREATE TABLE IF NOT EXISTS public.ods_refs (
  numero  TEXT PRIMARY KEY,
  titulo  TEXT NOT NULL,
  emoji   TEXT NOT NULL DEFAULT '🎯',
  cor     TEXT NOT NULL DEFAULT '#6B7280',
  no_projeto BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO public.ods_refs (numero, titulo, emoji, cor, no_projeto) VALUES
  ('1',  'Erradicação da Pobreza',                          '🏚',  '#E5243B', false),
  ('2',  'Fome Zero e Agricultura Sustentável',             '🌾',  '#DDA63A', true),
  ('3',  'Saúde e Bem-Estar',                               '❤',  '#4C9F38', false),
  ('4',  'Educação de Qualidade',                           '📚',  '#C5192D', true),
  ('5',  'Igualdade de Gênero',                             '♀',  '#FF3A21', true),
  ('6',  'Água Potável e Saneamento',                       '💧',  '#26BDE2', true),
  ('7',  'Energia Limpa e Acessível',                       '⚡',  '#FCC30B', false),
  ('8',  'Trabalho Decente e Crescimento Econômico',        '📈',  '#A21942', true),
  ('9',  'Indústria, Inovação e Infraestrutura',            '🏭',  '#FD6925', false),
  ('10', 'Redução das Desigualdades',                       '⚖',  '#DD1367', false),
  ('11', 'Cidades e Comunidades Sustentáveis',              '🏙',  '#FD9D24', true),
  ('12', 'Consumo e Produção Responsáveis',                 '♻',  '#BF8B2E', true),
  ('13', 'Ação Contra a Mudança Global do Clima',           '🌡',  '#3F7E44', true),
  ('14', 'Vida na Água',                                    '🐟',  '#0A97D9', true),
  ('15', 'Vida Terrestre',                                  '🌿',  '#56C02B', false),
  ('16', 'Paz, Justiça e Instituições Eficazes',            '⚖',  '#00689D', false),
  ('17', 'Parcerias e Meios de Implementação',              '🤝',  '#19486A', false)
ON CONFLICT (numero) DO UPDATE SET no_projeto = EXCLUDED.no_projeto;

-- ── 2. Metas de Kunming-Montreal — 23 metas ──────────────────────
CREATE TABLE IF NOT EXISTS public.metas_km_refs (
  numero     TEXT PRIMARY KEY,
  titulo     TEXT NOT NULL,
  resumo     TEXT,
  no_projeto BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO public.metas_km_refs (numero, titulo, resumo, no_projeto) VALUES
  ('1',  'Planejamento espacial participativo',              'Garantir que todas as terras e águas sejam geridas de forma integrada a 2030', false),
  ('2',  'Restauração de ecossistemas degradados',           'Restaurar pelo menos 30% dos ecossistemas terrestres, de água doce, costeiros e marinhos degradados', true),
  ('3',  'Conservação de ecossistemas terrestres e marinhos','Proteger e conservar 30% das terras e águas continentais e 30% dos oceanos', false),
  ('4',  'Gestão de espécies e coexistência humano-fauna',   'Assegurar ações de manejo para recuperação de espécies e coexistência com fauna silvestre', true),
  ('5',  'Uso sustentável da vida silvestre',                'Garantir o uso sustentável e legal de espécies silvestres, evitando sobreexploração', false),
  ('6',  'Espécies exóticas invasoras',                     'Reduzir em 50% a taxa de introdução de espécies invasoras e controlar as prioritárias', false),
  ('7',  'Redução da poluição',                             'Reduzir o risco de poluição de todas as fontes a níveis não nocivos à biodiversidade', false),
  ('8',  'Minimizar impactos das mudanças climáticas',       'Minimizar o impacto das mudanças climáticas na biodiversidade por meio de soluções baseadas na natureza', false),
  ('9',  'Gestão da vida silvestre de forma sustentável',    'Beneficiar os povos locais com uso sustentável de espécies silvestres e seus benefícios', false),
  ('10', 'Agricultura, aquicultura, pesca e silvicultura',   'Garantir que áreas de agricultura, aquicultura, pesca e floresta sejam geridas sustentavelmente', true),
  ('11', 'Restauração e manutenção dos serviços ecossistêmicos','Restaurar, manter e melhorar as funções e serviços da natureza que beneficiam as pessoas', true),
  ('12', 'Áreas verdes urbanas',                            'Aumentar a cobertura, qualidade e conectividade de espaços verdes e azuis em áreas urbanas', false),
  ('13', 'Repartição justa de benefícios genéticos',        'Implementar medidas para repartição justa de benefícios provenientes de recursos genéticos', false),
  ('14', 'Integração da biodiversidade nos setores',        'Assegurar que a biodiversidade seja integrada nos processos de decisão em todos os setores', false),
  ('15', 'Empresas avaliam e divulgam riscos de biodiversidade','Garantir que grandes empresas monitorem, avaliem e divulguem riscos e dependências da biodiversidade', false),
  ('16', 'Consumo sustentável',                             'Garantir que as pessoas sejam encorajadas a fazer escolhas de consumo sustentáveis', false),
  ('17', 'Biossegurança e biotecnologia',                   'Estabelecer e fortalecer medidas de biossegurança relacionadas à biotecnologia', false),
  ('18', 'Redução de incentivos prejudiciais',              'Identificar e eliminar gradualmente subsidios e incentivos prejudiciais à biodiversidade (US$ 500 bi/ano)', false),
  ('19', 'Mobilização de recursos financeiros',             'Aumentar substancialmente recursos para implementação do quadro (US$ 200 bi/ano até 2030)', false),
  ('20', 'Capacitação e transferência de tecnologia',       'Fortalecer a capacidade de países em desenvolvimento, especialmente países menos desenvolvidos', false),
  ('21', 'Conhecimento, dados e informação',                'Assegurar que o melhor conhecimento disponível oriente as decisões de biodiversidade de forma inclusiva', true),
  ('22', 'Participação de povos indígenas e comunidades',   'Garantir participação plena e efetiva de povos indígenas, comunidades locais, mulheres e jovens', true),
  ('23', 'Igualdade de gênero na governança da biodiversidade','Garantir igualdade de gênero na implementação do Quadro, com abordagem de gênero e equidade', true)
ON CONFLICT (numero) DO UPDATE SET no_projeto = EXCLUDED.no_projeto;

-- ── 3. Matriz de Resultados — itens/indicadores ───────────────────
CREATE TABLE IF NOT EXISTS public.matriz_itens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resultado        INT  NOT NULL CHECK (resultado IN (1,2,3)),
  produto_codigo   TEXT NOT NULL,  -- '1.1', '1.2', '2.1'...
  produto_titulo   TEXT NOT NULL,
  indicador        TEXT NOT NULL,
  situacao_ref     TEXT,           -- linha de base
  meta_descricao   TEXT NOT NULL,  -- ex: "200 Unidades produtivas"
  meta_numerica    NUMERIC,        -- 200
  unidade          TEXT,           -- "pessoas", "hectares", "documentos"...
  meios_verificacao TEXT,
  hipoteses_riscos TEXT,
  ods              TEXT[] NOT NULL DEFAULT '{}',
  metas_km         TEXT[] NOT NULL DEFAULT '{}',
  ordem            INT  NOT NULL DEFAULT 0,
  ativo            BOOLEAN NOT NULL DEFAULT true,
  criado_em        TIMESTAMPTZ DEFAULT now(),
  atualizado_em    TIMESTAMPTZ DEFAULT now()
);

-- Pré-popular com todos os indicadores do documento
INSERT INTO public.matriz_itens
  (resultado, produto_codigo, produto_titulo, indicador, meta_descricao, meta_numerica, unidade, meios_verificacao, ods, metas_km, ordem)
VALUES
-- ── RESULTADO 1 ───────────────────────────────────────────────────
-- Produto 1.1
(1,'1.1','Desenvolvimento de Produtos Sustentáveis',
  'Número de unidades produtivas com práticas agroecológicas',
  '200 unidades produtivas',200,'unidades produtivas',
  'Verificação in loco', ARRAY['2','12'], ARRAY['10'], 10),

(1,'1.1','Desenvolvimento de Produtos Sustentáveis',
  'Número de produtores capacitados (recorte para mulheres e jovens)',
  '200 pessoas capacitadas',200,'pessoas',
  'Listas de presença; Registro digital', ARRAY['2','4','12'], ARRAY['22'], 20),

(1,'1.1','Desenvolvimento de Produtos Sustentáveis',
  'Diversificação de produtos e aumento da renda média dos pequenos produtores',
  '10 novos produtos desenvolvidos',10,'produtos',
  'Registro digital (fotografia); Relação de novos produtos', ARRAY['12'], ARRAY['10'], 30),

(1,'1.1','Desenvolvimento de Produtos Sustentáveis',
  'Número de visitantes e aumento da renda média dos pequenos produtores (turismo)',
  '200 visitantes nas APAs',200,'visitantes',
  'Número de turistas; Lista de visitação; Registro digital', ARRAY['11'], ARRAY['10'], 40),

(1,'1.1','Desenvolvimento de Produtos Sustentáveis',
  'Capacitação em turismo comunitário (proporção de mulheres)',
  '100 pessoas capacitadas',100,'pessoas',
  'Número de membros treinados; Lista de presença; Registro digital', ARRAY['4','11'], ARRAY['23'], 50),

(1,'1.1','Desenvolvimento de Produtos Sustentáveis',
  'Impacto social — infraestruturas sociais criadas',
  '2 infraestruturas sociais criadas',2,'infraestruturas',
  'Relação de infraestruturas criadas; Registro digital', ARRAY['11'], ARRAY['23'], 60),

-- Produto 1.2
(1,'1.2','Elaboração de Manual de Análise (Governança)',
  'Número total de manuais para apoio à gestão das UCs elaborados',
  '13 documentos (manuais) elaborados',13,'documentos',
  'Número de documentos elaborados', ARRAY['11'], ARRAY[]::TEXT[], 70),

-- Produto 1.3
(1,'1.3','Programas de Educação Ambiental',
  'Número de participantes nos programas de educação ambiental',
  '200 pessoas assistidas',200,'pessoas',
  'Número de participantes; Lista de presença; Registro digital', ARRAY['4','12'], ARRAY['23'], 80),

(1,'1.3','Programas de Educação Ambiental',
  'Diversidade de participantes (gênero, idade, agricultores, jovens)',
  '100 pessoas de diferentes grupos',100,'pessoas',
  'Percentual de participação; Lista de presença; Registro digital', ARRAY['4','5'], ARRAY['23'], 90),

(1,'1.3','Programas de Educação Ambiental',
  'Número de oficinas realizadas',
  '20 oficinas realizadas',20,'oficinas',
  'Número de eventos; Relatório dos eventos; Registro digital', ARRAY['4'], ARRAY['23'], 100),

(1,'1.3','Programas de Educação Ambiental',
  'Avaliação de conhecimento — testes/questionários aplicados (inclusivo, por sexo/idade)',
  '50 testes ou questionários aplicados',50,'testes',
  'Testes aplicados antes e depois das atividades', ARRAY['4'], ARRAY['21'], 110),

(1,'1.3','Programas de Educação Ambiental',
  'Aumento na diversidade de cultivos adotados após capacitação',
  '10 novas culturas ou práticas adotadas',10,'culturas/práticas',
  'Número de novas práticas adotadas; Relatório anual de gestão das UCs', ARRAY['2','12'], ARRAY['10'], 120),

-- Produto 1.4
(1,'1.4','Fortalecimento das Organizações Locais',
  'Número de organizações formais e não formais fortalecidas',
  '10 grupos formais e não formais capacitados',10,'grupos',
  'Número de grupos que receberam capacitação ou apoio', ARRAY['8'], ARRAY['23'], 130),

(1,'1.4','Fortalecimento das Organizações Locais',
  'Participação em capacitações (inclusivo por sexo, idade, deficiência)',
  '50 membros das organizações capacitados',50,'membros',
  'Número de membros; Lista de presença', ARRAY['4','8'], ARRAY['21'], 140),

(1,'1.4','Fortalecimento das Organizações Locais',
  'Acesso a mercados — parcerias estabelecidas',
  '10 parcerias estabelecidas',10,'parcerias',
  'Número de parcerias com compradores; Número de contratos', ARRAY['8'], ARRAY['21'], 150),

(1,'1.4','Fortalecimento das Organizações Locais',
  'Diversificação de produtos e serviços desenvolvidos pelas organizações',
  '10 novos produtos ou serviços',10,'produtos/serviços',
  'Número de novos produtos; Relação disponível', ARRAY['8'], ARRAY['10'], 160),

(1,'1.4','Fortalecimento das Organizações Locais',
  'Participação em feiras e eventos (inclusivo por sexo, idade, deficiência)',
  'Participação em 10 eventos',10,'eventos',
  'Número de feiras; Relação de eventos; Relatório de Gestão das UCs', ARRAY['8','11'], ARRAY['21'], 170),

(1,'1.4','Fortalecimento das Organizações Locais',
  'Rede de colaboração — parcerias firmadas entre organizações locais',
  '10 colaborações ou parcerias firmadas',10,'colaborações',
  'Número de colaborações; Relação de parcerias firmadas', ARRAY['8'], ARRAY['21'], 180),

-- ── RESULTADO 2 ───────────────────────────────────────────────────
-- Produto 2.1
(2,'2.1','Mitigação da Vulnerabilidade das APAs',
  'Número de nascentes identificadas e protegidas',
  '20 nascentes protegidas',20,'nascentes',
  'Verificação in loco; Análise de imagens aéreas', ARRAY['13'], ARRAY[]::TEXT[], 190),

(2,'2.1','Mitigação da Vulnerabilidade das APAs',
  'Área total implantada e protegida (APPs)',
  '30 hectares de APP nas APAs',30,'hectares',
  'Verificação in loco; Análise de imagens aéreas', ARRAY['13'], ARRAY[]::TEXT[], 200),

-- Produto 2.2
(2,'2.2','Aumento de Resiliência',
  'Plano de regularização da vazão do Igarapé São Francisco',
  '1 plano entregue',1,'plano',
  'Análise técnica do plano; Relatório de conclusão', ARRAY['13'], ARRAY[]::TEXT[], 210),

(2,'2.2','Aumento de Resiliência',
  'Fossas sépticas construídas e sistemas de tratamento de água implantados',
  '160 fossas sépticas + 15 sistemas de tratamento',175,'unidades',
  'Acompanhamento in loco', ARRAY['6'], ARRAY['11'], 220),

-- Produto 2.3
(2,'2.3','Monitoramento e Adaptação',
  'Plano de adaptação e mitigação para eventos extremos nas APAs',
  '1 plano elaborado',1,'plano',
  'Análise do plano', ARRAY['6','13'], ARRAY['2','4'], 230),

(2,'2.3','Monitoramento e Adaptação',
  'Estação meteorológica com sensores hidrológicos instalada na Bacia do Ig. São Francisco',
  '1 estação instalada',1,'estação',
  'Verificação in loco; Transmissão e recepção de dados', ARRAY['6','13'], ARRAY['2'], 240),

(2,'2.3','Monitoramento e Adaptação',
  'Aumento da cobertura florestal secundária restaurada (serviços ecossistêmicos)',
  '% de hectares e serviços ecossistêmicos restaurados',NULL,'% hectares',
  'Verificação in loco; Registros fotográficos', ARRAY['13'], ARRAY['2'], 250),

(2,'2.3','Monitoramento e Adaptação',
  'Trilhas de observação de animais implementadas (coexistência humano-fauna)',
  '2 trilhas de observação de animais nas APAs',2,'trilhas',
  'Trilhas em uso; Registro de visitantes', ARRAY['13','14'], ARRAY['4'], 260),

(2,'2.3','Monitoramento e Adaptação',
  'Melhora na qualidade ambiental da água e acesso à água potável',
  '% de hectares com serviços ecossistêmicos restaurados',NULL,'% hectares',
  'Verificação in loco; Registros fotográficos das áreas', ARRAY['6'], ARRAY['11'], 270),

-- ── RESULTADO 3 ───────────────────────────────────────────────────
-- Produto 3
(3,'3.1','Fortalecimento da Governança e Equidade de Gênero',
  'Pessoas capacitadas com emissão de certificados (ênfase em mulheres)',
  '100 pessoas capacitadas',100,'pessoas',
  'Relatórios; Listas de presença', ARRAY['5','13'], ARRAY['22'], 280),

(3,'3.2','Fortalecimento da Governança e Equidade de Gênero',
  'Plano de educação e sensibilização para visitantes e moradores',
  '1 plano elaborado e implementado',1,'plano',
  'Relatórios', ARRAY['5','13'], ARRAY['22'], 290),

(3,'3.3','Fortalecimento da Governança e Equidade de Gênero',
  'Campanha de fortalecimento do empoderamento de mulheres',
  '1 campanha elaborada e implementada',1,'campanha',
  'Relatórios', ARRAY['5','13'], ARRAY['22'], 300),

(3,'3.x','Fortalecimento da Governança e Equidade de Gênero',
  'Crescimento do percentual de mulheres capacitadas (Meta 22 KM)',
  'Crescimento % do número de mulheres capacitadas no Produto 3',NULL,'%',
  'Listas de pessoas capacitadas', ARRAY['5','13'], ARRAY['22'], 310);

-- ── 4. Junção muitos-para-muitos: atividades ↔ matriz_itens ───────
CREATE TABLE IF NOT EXISTS public.atividade_matriz (
  atividade_id   UUID NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  matriz_item_id UUID NOT NULL REFERENCES public.matriz_itens(id) ON DELETE CASCADE,
  PRIMARY KEY (atividade_id, matriz_item_id)
);

-- ODS e KM nas atividades (campos extras)
ALTER TABLE public.atividades
  ADD COLUMN IF NOT EXISTS ods       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metas_km  TEXT[] NOT NULL DEFAULT '{}';

-- ── 5. Contribuições dos produtos entregues aos indicadores ────────
CREATE TABLE IF NOT EXISTS public.produto_matriz_contribuicao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id      UUID NOT NULL REFERENCES public.produtos_entregas(id) ON DELETE CASCADE,
  matriz_item_id  UUID NOT NULL REFERENCES public.matriz_itens(id) ON DELETE CASCADE,
  valor           NUMERIC NOT NULL,
  unidade         TEXT,
  observacao      TEXT,
  -- Fluxo de confirmação
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmado','rejeitado')),
  confirmado_por  UUID REFERENCES public.usuarios(id),
  confirmado_em   TIMESTAMPTZ,
  criado_por      UUID REFERENCES public.usuarios(id),
  criado_em       TIMESTAMPTZ DEFAULT now()
);

-- ── 6. View de progresso por indicador ───────────────────────────
CREATE OR REPLACE VIEW public.vw_matriz_progresso AS
SELECT
  mi.id,
  mi.resultado,
  mi.produto_codigo,
  mi.produto_titulo,
  mi.indicador,
  mi.meta_numerica,
  mi.meta_descricao,
  mi.unidade,
  mi.ods,
  mi.metas_km,
  COALESCE(SUM(CASE WHEN pmc.status = 'confirmado' THEN pmc.valor ELSE 0 END), 0) AS realizado_confirmado,
  COALESCE(SUM(CASE WHEN pmc.status = 'pendente'   THEN pmc.valor ELSE 0 END), 0) AS realizado_pendente,
  COALESCE(SUM(pmc.valor), 0) AS realizado_total,
  CASE WHEN mi.meta_numerica > 0
    THEN ROUND(COALESCE(SUM(CASE WHEN pmc.status = 'confirmado' THEN pmc.valor ELSE 0 END), 0) / mi.meta_numerica * 100, 1)
    ELSE NULL
  END AS pct_confirmado
FROM public.matriz_itens mi
LEFT JOIN public.produto_matriz_contribuicao pmc ON pmc.matriz_item_id = mi.id
WHERE mi.ativo = true
GROUP BY mi.id;

-- ── 7. RLS ────────────────────────────────────────────────────────
ALTER TABLE public.matriz_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matriz_itens_select" ON public.matriz_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "matriz_itens_admin"  ON public.matriz_itens FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND perfil IN ('super_admin','coordenacao') AND ativo = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND perfil IN ('super_admin','coordenacao') AND ativo = true));

ALTER TABLE public.ods_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ods_select" ON public.ods_refs FOR SELECT TO authenticated USING (true);

ALTER TABLE public.metas_km_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "km_select" ON public.metas_km_refs FOR SELECT TO authenticated USING (true);

ALTER TABLE public.atividade_matriz ENABLE ROW LEVEL SECURITY;
CREATE POLICY "atv_mat_select" ON public.atividade_matriz FOR SELECT TO authenticated USING (true);
CREATE POLICY "atv_mat_admin"  ON public.atividade_matriz FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND perfil IN ('super_admin','coordenacao','tecnico') AND ativo = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND perfil IN ('super_admin','coordenacao','tecnico') AND ativo = true));

ALTER TABLE public.produto_matriz_contribuicao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pmc_select" ON public.produto_matriz_contribuicao FOR SELECT TO authenticated USING (true);
CREATE POLICY "pmc_insert" ON public.produto_matriz_contribuicao FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "pmc_confirm" ON public.produto_matriz_contribuicao FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND perfil IN ('super_admin','coordenacao') AND ativo = true));
