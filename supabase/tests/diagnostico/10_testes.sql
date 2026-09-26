-- ════════════════════════════════════════════════════════════════════════
-- Testes do Diagnóstico Socioambiental (rodar com rodar.sh, banco LOCAL).
-- Cada bloco falha com RAISE EXCEPTION 'FALHOU: ...' — o psql para no 1º erro.
-- Usuários simulados por perfil; "logar" = set role + request.jwt.claim.sub.
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
\o /dev/null

-- ── Cenário (como postgres) ─────────────────────────────────────────────
insert into public.usuarios (id, nome_completo, email, perfil, ativo) values
 ('00000000-0000-0000-0000-00000000005a','Super','sa@x','super_admin',true),
 ('00000000-0000-0000-0000-0000000000c0','Coord','co@x','coordenacao',true),
 ('00000000-0000-0000-0000-0000000000e1','Tec 1','t1@x','tecnico',true),
 ('00000000-0000-0000-0000-0000000000e2','Tec 2','t2@x','tecnico',true),
 ('00000000-0000-0000-0000-0000000000e3','Tec sem permissão','t3@x','tecnico',true),
 ('00000000-0000-0000-0000-0000000000e4','Tec vencido 5d','t4@x','tecnico',true),
 ('00000000-0000-0000-0000-0000000000e5','Tec vencido 20d','t5@x','tecnico',true),
 ('00000000-0000-0000-0000-0000000000e6','Tec inativo','t6@x','tecnico',false),
 ('00000000-0000-0000-0000-0000000000ce','Consultor','ce@x','consultor_externo',true),
 ('00000000-0000-0000-0000-0000000000cf','Consultor sem perm','cf@x','consultor_externo',true),
 ('00000000-0000-0000-0000-0000000000b1','Visual','vi@x','visualizador',true),
 ('00000000-0000-0000-0000-0000000000f1','Financeiro','fi@x','financeiro',true);

insert into public.usuario_permissoes (usuario_id, modulo, valido_de, valido_ate) values
 ('00000000-0000-0000-0000-0000000000e1','diagnostico', now()-interval '30 days', now()+interval '30 days'),
 ('00000000-0000-0000-0000-0000000000e2','diagnostico', now()-interval '30 days', null),
 ('00000000-0000-0000-0000-0000000000e4','diagnostico', now()-interval '60 days', now()-interval '5 days'),
 ('00000000-0000-0000-0000-0000000000e5','diagnostico', now()-interval '60 days', now()-interval '20 days'),
 ('00000000-0000-0000-0000-0000000000e6','diagnostico', now()-interval '30 days', null),
 ('00000000-0000-0000-0000-0000000000ce','diagnostico', now()-interval '30 days', null);

update public.diag_questionarios set status = 'publicado' where codigo = 'DSA' and versao = 1;
insert into public.diag_comunidades (id, municipio_ibge, nome)
values ('11111111-1111-1111-1111-111111111111', 1200708, 'Comunidade Teste');

create table public.t_ctx (k text primary key, v text);
grant select, insert, update on public.t_ctx to authenticated;
insert into public.t_ctx select 'q1', id::text from public.diag_questionarios where codigo='DSA' and versao=1;
alter table public.t_ctx disable row level security;

-- respostas completas e válidas da v1 (geradas da estrutura)
create function public.t_resp() returns jsonb language sql immutable as $$
  select '{"sexo_genero": "mulher", "idade": 40, "tempo_comunidade": "menos_de_1_ano", "qtd_moradores": 3, "moradia_situacao": "propria", "moradia_parede": "madeira", "energia_fonte": "rede_publica", "acesso_chuvoso": "bom", "comunicacao_meios": ["celular"], "infra_dificuldades": ["estradas"], "agua_fonte": "poco", "agua_tratada": "sim", "agua_tratamento": ["filtracao"], "agua_falta": "sim", "esgoto_destino": "fossa", "lixo_destino": ["coleta_publica"], "saude_onde": "unidade_de_saude", "saude_dificuldade": "distancia", "saude_problemas_freq": "sim", "saude_problemas_quais": ["diarreia_verminoses"], "educacao_dificuldades": ["distancia"], "renda_fontes": ["agricultura"], "renda_suficiente": "sim", "producao_atividades": ["agricultura"], "producao_produtos": "resposta de teste", "producao_destino": "venda", "comercializa_onde": ["na_propria_comunidade"], "producao_dificuldades": ["falta_de_recursos_financeiros"], "acesso_credito": "sim", "recebe_ater": "sim", "producao_desejo": "resposta de teste", "area_tamanho_ha": 5.5, "area_uso": ["floresta"], "usa_recursos_naturais": "sim", "recursos_coletados": ["frutos"], "recursos_destino": "consumo", "recursos_importantes": "resposta de teste", "recursos_mudanca": "aumentou", "recursos_mudanca_causas": ["desmatamento"], "amb_problemas": ["desmatamento"], "agua_qualidade_problema": "sim", "agua_qualidade_quais": "resposta de teste", "clima_eventos_afeta": "sim", "clima_eventos_quais": ["seca"], "clima_atividades_afetadas": ["agricultura"], "amb_percepcao_mudanca": "melhorou", "amb_o_que_fazer": "resposta de teste", "participa_org": "sim", "participa_org_quais": "resposta de teste", "decisoes_como": ["reunioes_comunitarias"], "moradores_participam": "sim", "grupos_participam_menos": ["mulheres"], "instituicoes_contribuem": "resposta de teste", "genero_oportunidades_iguais": "sim", "atividades_mulheres": ["trabalho_domestico"], "atividades_homens": ["agricultura"], "decisao_dinheiro": "principalmente_mulheres", "decisao_producao": "principalmente_mulheres", "mulheres_renda_propria": "sim_a_maioria", "mulheres_participam": "frequentemente", "grupo_mulheres_existe": "sim", "grupo_mulheres_atividades": ["producao"], "mulheres_dificuldades": ["falta_de_tempo"], "mulheres_acesso_oportunidades": "sim", "mulheres_independencia": "sim", "mulheres_fortalecer": "resposta de teste", "grupos_mulheres_falta": "resposta de teste", "mulheres_necessidades": "resposta de teste", "comunidade_melhor": "resposta de teste", "comunidade_problemas": "resposta de teste", "comunidade_potenciais": ["agricultura"], "prioridades": "resposta de teste", "apoio_projeto": "resposta de teste", "futuro_10_anos": "resposta de teste", "info_adicional": "resposta de teste"}'::jsonb
$$;

-- monta p_ficha
create function public.t_ficha(p_uuid uuid, p_codigo text, p_resp jsonb default null,
  p_final timestamptz default now(), p_extra jsonb default '{}'::jsonb)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'uuid_cliente', p_uuid, 'codigo', p_codigo,
    'questionario_id', (select v from public.t_ctx where k = 'q1'),  -- o app guarda no cache offline
    'municipio_ibge', 1200708, 'comunidade_id', '11111111-1111-1111-1111-111111111111',
    'dt_entrevista', current_date, 'finalizada_em', p_final,
    'aviso_lido', true, 'aceitou_participar', true,
    'respostas', coalesce(p_resp, public.t_resp()),
    'entrevistado_nome', 'Maria Teste', 'lat', -10.65, 'lon', -68.5, 'gps_precisao_m', 8
  ) || p_extra
$$;

create function public.t_mor() returns jsonb language sql immutable as $$
  select '[{"ordem":1,"nome":"Maria Teste","idade":40,"sexo_genero":"mulher","parentesco":"responsável","e_entrevistado":true},
           {"ordem":2,"nome":"João","idade":42,"sexo_genero":"homem","parentesco":"cônjuge"},
           {"ordem":3,"nome":"Ana","idade":10,"sexo_genero":"mulher","parentesco":"filha","escolaridade":"fundamental incompleto"}]'::jsonb
$$;

-- "logar" como alguém
create function public.t_como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text,''), false)
$$;

-- espera erro com prefixo; devolve true se veio
create function public.t_erro(p_sql text, p_prefixo text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_prefixo || '%' then return; end if;
    raise exception 'FALHOU: esperado erro "%", veio "%"', p_prefixo, sqlerrm;
  end;
  raise exception 'FALHOU: esperado erro "%", mas não houve erro', p_prefixo;
end $$;
grant execute on function public.t_resp(), public.t_ficha(uuid, text, jsonb, timestamptz, jsonb), public.t_mor(),
  public.t_como(uuid), public.t_erro(text, text) to anon, authenticated;

-- ── T01 anon não lê nada nem executa a RPC ──────────────────────────────
set role anon;
select public.t_erro('select count(*) from public.diag_fichas', 'permission denied');
select public.t_erro('select count(*) from public.diag_questionarios', 'permission denied');
select public.t_erro('select count(*) from public.lgpd_tratamentos', 'permission denied');
select public.t_erro('select public.diag_enviar_ficha(''{}''::jsonb)', 'permission denied');
reset role;

-- ── T02 técnico envia ficha completa ────────────────────────────────────
set role authenticated;
select public.t_como('00000000-0000-0000-0000-0000000000e1');
do $$
declare r jsonb;
begin
  r := public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-000000000001','DSA-XAP-260926-T1AA-01'),
                                public.t_mor(), '[]');
  if r->>'status' <> 'enviada' then raise exception 'FALHOU T02 status %', r; end if;
  if jsonb_array_length(r->'alertas') <> 0 then raise exception 'FALHOU T02 ficha completa com alertas: %', r->'alertas'; end if;
  insert into public.t_ctx values ('f1', r->>'id');
end $$;

-- ── T03 reenvio não duplica ─────────────────────────────────────────────
do $$
declare r jsonb;
begin
  r := public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-000000000001','DSA-XAP-260926-T1AA-01'),
                                public.t_mor(), '[]');
  if r->>'id' <> (select v from public.t_ctx where k='f1') then raise exception 'FALHOU T03 id mudou'; end if;
  if (select count(*) from public.diag_fichas where uuid_cliente='aaaaaaaa-0000-0000-0000-000000000001') <> 1
     then raise exception 'FALHOU T03 duplicou ficha'; end if;
  if (select count(*) from public.diag_moradores where ficha_id = (r->>'id')::uuid) <> 3
     then raise exception 'FALHOU T03 moradores duplicados'; end if;
  if (select count(*) from public.diag_moradores_identificacao) <> 3
     then raise exception 'FALHOU T03 identificação de moradores'; end if;
end $$;

-- ── T04 salto descarta resposta que não se aplica; T05 derivada do banco ──
do $$
declare r jsonb; v jsonb;
begin
  r := public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-000000000002','DSA-XAP-260926-T1AA-02',
          public.t_resp() || '{"agua_tratada":"nao","tem_escolar":"nao","producao_atividades":["nenhuma"]}'),
        public.t_mor(), '[]');
  select respostas into v from public.diag_fichas where id = (r->>'id')::uuid;
  if v ? 'agua_tratamento' then raise exception 'FALHOU T04 S1 não descartou agua_tratamento'; end if;
  if v ? 'producao_produtos' or v ? 'producao_destino' or v ? 'comercializa_onde' or v ? 'producao_dificuldades'
     then raise exception 'FALHOU T04 S10 não descartou P31–P34'; end if;
  if v->>'tem_escolar' <> 'sim' then raise exception 'FALHOU T05 derivada P26 = %', v->>'tem_escolar'; end if;
end $$;

-- ── T06–T09 validação estrutural ────────────────────────────────────────
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-0000000000f6','X-06-TESTE',
  public.t_resp() || '{"campo_inventado":"x"}'), public.t_mor())$q$, 'diag:resposta_invalida: chave desconhecida');
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-0000000000f7','X-07-TESTE',
  public.t_resp() || '{"comunicacao_meios":["celular","nenhum"]}'), public.t_mor())$q$, 'diag:resposta_invalida');
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-0000000000f8','X-08-TESTE',
  public.t_resp() || '{"agua_fonte_outro":"cacimba"}'), public.t_mor())$q$, 'diag:resposta_invalida: agua_fonte_outro sem');
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-0000000000f9','X-09-TESTE',
  public.t_resp() || '{"agua_fonte":"inexistente"}'), public.t_mor())$q$, 'diag:resposta_invalida');
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-0000000000fa','X-0A-TESTE',
  public.t_resp() || '{"idade":200}'), public.t_mor())$q$, 'diag:resposta_invalida: idade fora');
do $$
declare r jsonb; v jsonb;
begin
  r := public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-000000000003','DSA-XAP-260926-T1AA-03',
          public.t_resp() || '{"agua_fonte":"outro","agua_fonte_outro":"cacimba","renda_suficiente":"_nr","moradia_parede":"outro"}'),
        public.t_mor(), '[]');
  select respostas into v from public.diag_fichas where id = (r->>'id')::uuid;
  if v->>'agua_fonte_outro' <> 'cacimba' then raise exception 'FALHOU T08 especifique não gravado'; end if;
  if v->>'renda_suficiente' <> '_nr' then raise exception 'FALHOU T09 _nr'; end if;
  if not (r->'alertas') @> '[{"tipo":"outro_sem_texto","chave":"moradia_parede"}]'
     then raise exception 'FALHOU T08 alerta outro_sem_texto: %', r->'alertas'; end if;
end $$;

-- ── T10 alertas (nunca bloqueiam) ───────────────────────────────────────
do $$
declare r jsonb;
begin
  r := public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-000000000004','DSA-XAP-260926-T1AA-04',
          (public.t_resp() - 'recebe_ater') || '{"idade":16,"qtd_moradores":5,"area_tamanho_ha":5000,"atividades_mulheres":["nao_ha_mulheres"]}'),
        '[{"ordem":1,"idade":16,"sexo_genero":"mulher"},{"ordem":2,"idade":50,"sexo_genero":"homem","e_entrevistado":true}]', '[]');
  if not (r->'alertas') @> '[{"tipo":"pendente","chave":"recebe_ater"}]' then raise exception 'FALHOU T10 pendente: %', r->'alertas'; end if;
  if not (r->'alertas') @> '[{"tipo":"qtd_moradores_diverge"}]' then raise exception 'FALHOU T10 V1'; end if;
  if not (r->'alertas') @> '[{"tipo":"abaixo_do_esperado","chave":"idade"}]' then raise exception 'FALHOU T10 V2'; end if;
  if not (r->'alertas') @> '[{"tipo":"acima_do_esperado","chave":"area_tamanho_ha"}]' then raise exception 'FALHOU T10 área'; end if;
  if not (r->'alertas') @> '[{"tipo":"incoerente_com_moradores","chave":"atividades_mulheres"}]' then raise exception 'FALHOU T10 D2'; end if;
  if not (r->'alertas') @> '[{"tipo":"entrevistado_fora_da_1a_linha"}]' then raise exception 'FALHOU T10 1a linha'; end if;
end $$;

-- ── T11 técnico vê só as próprias ───────────────────────────────────────
do $$
begin
  if (select count(*) from public.diag_fichas) <> 4 then raise exception 'FALHOU T11 te1 não vê as 4 próprias'; end if;
  if (select count(*) from public.diag_fichas_identificacao) <> 4 then raise exception 'FALHOU T11 te1 identificação própria'; end if;
end $$;
select public.t_como('00000000-0000-0000-0000-0000000000e2');
do $$
begin
  if (select count(*) from public.diag_fichas) <> 0 then raise exception 'FALHOU T11 te2 vê ficha de te1'; end if;
  if (select count(*) from public.diag_moradores) <> 0 then raise exception 'FALHOU T11 te2 vê moradores de te1'; end if;
  if (select count(*) from public.diag_fichas_identificacao) <> 0 then raise exception 'FALHOU T11 te2 vê identificação'; end if;
end $$;
-- te2 não pode sobrescrever ficha de te1 reenviando o mesmo uuid
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-000000000001','DSA-XAP-260926-T1AA-01'), public.t_mor())$q$,
  'diag:nao_autorizado: ficha de outro');
-- escrita direta nas tabelas é proibida (só pela RPC)
select public.t_erro($q$insert into public.diag_fichas (uuid_cliente, codigo, questionario_id, municipio_ibge, comunidade_nova,
  dt_entrevista, finalizada_em, entrevistador_id, aviso_lido, aceitou_participar)
  values (gen_random_uuid(),'X-DIRETO-1',(select id from public.diag_questionarios limit 1),1200708,'x',current_date,now(),
  '00000000-0000-0000-0000-0000000000e2',true,true)$q$, 'permission denied');
select public.t_erro($q$update public.diag_fichas set respostas = '{}'$q$, 'permission denied');

-- ── T12–T14 quem NÃO aplica ─────────────────────────────────────────────
select public.t_como('00000000-0000-0000-0000-0000000000e3');
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha(gen_random_uuid(),'X-12-TESTE'), public.t_mor())$q$, 'diag:sem_permissao');
select public.t_como('00000000-0000-0000-0000-0000000000e6');
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha(gen_random_uuid(),'X-12B-TESTE'), public.t_mor())$q$, 'diag:nao_autorizado');
select public.t_como('00000000-0000-0000-0000-0000000000c0');
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha(gen_random_uuid(),'X-14-TESTE'), public.t_mor())$q$, 'diag:nao_autorizado');

-- ── T13 carência de 15 dias ─────────────────────────────────────────────
select public.t_como('00000000-0000-0000-0000-0000000000e4');
do $$
declare r jsonb;
begin
  r := public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-0000000000e4','DSA-XAP-260920-T4AA-01',
          null, now() - interval '6 days'), public.t_mor(), '[]');
  if not (r->>'usou_carencia')::boolean then raise exception 'FALHOU T13 carência não marcada'; end if;
  if not (r->'alertas') @> '[{"tipo":"enviada_na_carencia"}]' then raise exception 'FALHOU T13 alerta carência'; end if;
end $$;
-- concluída DEPOIS do vencimento: fora da carência
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha(gen_random_uuid(),'X-13B-TESTE', null, now() - interval '1 day'), public.t_mor())$q$, 'diag:sem_permissao');
select public.t_como('00000000-0000-0000-0000-0000000000e5');
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha(gen_random_uuid(),'X-13C-TESTE', null, now() - interval '25 days'), public.t_mor())$q$, 'diag:sem_permissao');

-- ── T15 consultor: ficha sim, identificação/fotos não ───────────────────
select public.t_como('00000000-0000-0000-0000-0000000000ce');
do $$
begin
  if (select count(*) from public.diag_fichas) <> 5 then raise exception 'FALHOU T15 consultor não vê fichas'; end if;
  if (select count(*) from public.diag_moradores) = 0 then raise exception 'FALHOU T15 consultor não vê moradores'; end if;
  if (select count(*) from public.diag_fichas_identificacao) <> 0 then raise exception 'FALHOU T15 consultor vê identificação'; end if;
  if (select count(*) from public.diag_moradores_identificacao) <> 0 then raise exception 'FALHOU T15 consultor vê nomes'; end if;
end $$;
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha(gen_random_uuid(),'X-15-TESTE'), public.t_mor())$q$, 'diag:nao_autorizado');
select public.t_como('00000000-0000-0000-0000-0000000000cf');
do $$ begin
  if (select count(*) from public.diag_fichas) <> 0 then raise exception 'FALHOU T15 consultor SEM permissão vê fichas'; end if;
end $$;

-- ── T16–T17 visualizador só números; financeiro nada ────────────────────
select public.t_como('00000000-0000-0000-0000-0000000000b1');
do $$
declare n int;
begin
  if (select count(*) from public.diag_fichas) <> 0 then raise exception 'FALHOU T16 visualizador vê fichas'; end if;
  -- 5 fichas na comunidade: pergunta com 5 respostas aparece; com menos, é suprimida
  if exists (select 1 from public.fn_diag_agregados('comunidade', null, false, false)
             where (n_validos < 5 and not suprimido) or (n_validos >= 5 and suprimido))
     then raise exception 'FALHOU T16 regra de supressão'; end if;
  if not exists (select 1 from public.fn_diag_agregados('comunidade', null, false, false)
                 where chave = 'agua_tratamento' and suprimido and pct is null and n_opcao is null)
     then raise exception 'FALHOU T16 agua_tratamento (4 fichas) deveria estar suprimida'; end if;
  if not exists (select 1 from public.fn_diag_agregados('comunidade', null, false, false)
                 where chave = 'agua_tratada' and not suprimido)
     then raise exception 'FALHOU T16 agua_tratada (5 fichas) deveria aparecer'; end if;
  -- por sexo do respondente a célula encolhe e volta a ser suprimida
  if exists (select 1 from public.fn_diag_agregados('comunidade', null, true, false) where not suprimido and n_validos < 5)
     then raise exception 'FALHOU T16 supressão por sexo'; end if;
  -- visualizador não desliga a supressão
  select count(*) into n from public.fn_diag_agregados('comunidade', null, false, false, false, 1)
   where n_validos < 5 and not suprimido;
  if n <> 0 then raise exception 'FALHOU T16 visualizador desligou supressão'; end if;
end $$;
select public.t_como('00000000-0000-0000-0000-0000000000f1');
select public.t_erro('select * from public.fn_diag_agregados()', 'diag:nao_autorizado');
do $$ begin
  if (select count(*) from public.diag_fichas) <> 0 then raise exception 'FALHOU T17 financeiro vê fichas'; end if;
  if (select count(*) from public.diag_questionarios) <> 0 then raise exception 'FALHOU T17 financeiro vê questionário'; end if;
end $$;

-- ── T18–T19 status pela coordenação ─────────────────────────────────────
select public.t_como('00000000-0000-0000-0000-0000000000e1');
select public.t_erro($q$select public.diag_mudar_status((select v::uuid from public.t_ctx where k='f1'),'validada')$q$, 'diag:nao_autorizado');
select public.t_como('00000000-0000-0000-0000-0000000000c0');
select public.t_erro($q$select public.diag_mudar_status((select v::uuid from public.t_ctx where k='f1'),'devolvida')$q$, 'diag:motivo_obrigatorio');
select public.diag_mudar_status((select v::uuid from public.t_ctx where k='f1'), 'validada');
select public.t_como('00000000-0000-0000-0000-0000000000e1');
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-000000000001','DSA-XAP-260926-T1AA-01'), public.t_mor())$q$,
  'diag:ja_validada');
select public.t_como('00000000-0000-0000-0000-0000000000c0');
select public.diag_mudar_status((select id from public.diag_fichas where codigo='DSA-XAP-260926-T1AA-02'), 'devolvida', 'conferir P9');
select public.t_como('00000000-0000-0000-0000-0000000000e1');
do $$
declare r jsonb;
begin
  r := public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-000000000002','DSA-XAP-260926-T1AA-02'), public.t_mor(), '[]');
  if r->>'status_anterior' <> 'devolvida' or r->>'status' <> 'enviada' then raise exception 'FALHOU T18 reenvio de devolvida %', r; end if;
  if (select string_agg(status_para, '>' order by id) from public.diag_fichas_historico
      where ficha_id = (r->>'id')::uuid) <> 'enviada>devolvida>enviada'
     then raise exception 'FALHOU T19 histórico'; end if;
end $$;

-- ── T20 código repetido em outra ficha ──────────────────────────────────
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha(gen_random_uuid(),'DSA-XAP-260926-T1AA-01'), public.t_mor())$q$,
  'diag:codigo_duplicado');

-- ── T21 recusa: nada além de comunidade/data/entrevistador ──────────────
do $$
declare r jsonb;
begin
  r := public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-000000000021','DSA-XAP-260926-T1AA-21', null, now(),
         '{"aceitou_participar":false,"entrevistado_nome":null,"lat":null}'), public.t_mor(), '[]');
  if (select respostas from public.diag_fichas where id=(r->>'id')::uuid) <> '{}'::jsonb then raise exception 'FALHOU T21 respostas'; end if;
  if (select count(*) from public.diag_moradores where ficha_id=(r->>'id')::uuid) <> 0 then raise exception 'FALHOU T21 moradores'; end if;
  if jsonb_array_length(r->'alertas') <> 0 then raise exception 'FALHOU T21 alertas'; end if;
end $$;

-- ── T22 fotos e storage ─────────────────────────────────────────────────
do $$
declare r jsonb;
begin
  insert into storage.objects (bucket_id, name)
    values ('diagnostico-fotos', 'aaaaaaaa-0000-0000-0000-000000000003/bbbbbbbb-0000-0000-0000-000000000001.jpg');
  r := public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-000000000003','DSA-XAP-260926-T1AA-03'), public.t_mor(),
       '[{"uuid_cliente":"bbbbbbbb-0000-0000-0000-000000000001","tema":"moradia",
          "arquivo_url":"https://x/storage/v1/object/public/diagnostico-fotos/aaaaaaaa-0000-0000-0000-000000000003/bbbbbbbb-0000-0000-0000-000000000001.jpg"}]');
  if (select count(*) from public.diag_fotos) <> 1 then raise exception 'FALHOU T22 foto não gravada'; end if;
  if (select count(*) from storage.objects where bucket_id='diagnostico-fotos') <> 1 then raise exception 'FALHOU T22 te1 não lê a própria foto'; end if;
end $$;
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha('aaaaaaaa-0000-0000-0000-000000000003','DSA-XAP-260926-T1AA-03'), public.t_mor(),
  '[{"uuid_cliente":"bbbbbbbb-0000-0000-0000-000000000002","tema":"moradia","arquivo_url":"https://x/object/public/diagnostico-fotos/outra/x.jpg"}]')$q$,
  'diag:foto_invalida');
select public.t_como('00000000-0000-0000-0000-0000000000e2');
select public.t_erro($q$insert into storage.objects (bucket_id, name) values ('diagnostico-fotos','aaaaaaaa-0000-0000-0000-000000000003/intruso.jpg')$q$,
  'new row violates row-level security');
do $$ begin
  if (select count(*) from storage.objects where bucket_id='diagnostico-fotos') <> 0 then raise exception 'FALHOU T22 te2 lê foto de te1'; end if;
end $$;
select public.t_como('00000000-0000-0000-0000-0000000000ce');
do $$ begin
  if (select count(*) from storage.objects where bucket_id='diagnostico-fotos') <> 0 then raise exception 'FALHOU T22 consultor lê foto'; end if;
  if (select count(*) from public.diag_fotos) <> 0 then raise exception 'FALHOU T22 consultor vê registro de foto'; end if;
end $$;
select public.t_como('00000000-0000-0000-0000-0000000000c0');
do $$ begin
  if (select count(*) from storage.objects where bucket_id='diagnostico-fotos') <> 1 then raise exception 'FALHOU T22 coordenação não lê foto'; end if;
end $$;

-- ── T23 agregados com números reais (6 fichas na mesma comunidade) ──────
select public.t_como('00000000-0000-0000-0000-0000000000e2');
do $$
declare i int;
begin
  for i in 1..6 loop
    perform public.diag_enviar_ficha(public.t_ficha(('cccccccc-0000-0000-0000-00000000000' || i)::uuid, 'DSA-XAP-260926-T2AA-0' || i,
      public.t_resp() || jsonb_build_object('agua_tratada', case when i <= 4 then 'sim' else 'nao' end,
                                            'participa_org', 'sim',
                                            'participa_org_quais', case when i = 1 then 'Sindicato Rural de Xapuri'
                                                                        when i = 2 then '  sindicato rural de xapurí '
                                                                        else 'Associação ' || i end)),
      public.t_mor(), '[]');
  end loop;
end $$;
select public.t_como('00000000-0000-0000-0000-0000000000b1');
do $$
declare v numeric; s boolean;
begin
  -- visualizador: comunidade tem 6 fichas de te2 + 4 aplicáveis de te1/te4... conferir pelo total
  select pct, suprimido into v, s from public.fn_diag_agregados('geral', null, false, false)
   where chave = 'agua_tratada' and opcao = 'sim';
  if s then raise exception 'FALHOU T23 geral suprimido'; end if;
  if v is null then raise exception 'FALHOU T23 pct nulo'; end if;
  -- conferência independente do denominador
  if (select n_validos from public.fn_diag_agregados('geral', null, false, false) where chave='agua_tratada' and opcao='sim')
     <> (select count(*) from public.diag_fichas) and false then null; end if;
end $$;
select public.t_como('00000000-0000-0000-0000-0000000000c0');
do $$
declare a record; esperado numeric;
begin
  select * into a from public.fn_diag_agregados('geral', null, false, false) where chave='agua_tratada' and opcao='sim';
  select round(100.0 * count(*) filter (where respostas->>'agua_tratada'='sim')
               / count(*) filter (where respostas ? 'agua_tratada' and respostas->>'agua_tratada' <> '_nr'), 1)
    into esperado from public.diag_fichas where status in ('enviada','validada') and aceitou_participar;
  if a.pct <> esperado then raise exception 'FALHOU T23 pct % esperado %', a.pct, esperado; end if;
  -- multipla: denominador por ficha, não por opção
  select * into a from public.fn_diag_agregados('geral', null, false, false) where chave='comunicacao_meios' and opcao='celular';
  if a.pct <> 100 then raise exception 'FALHOU T23 multipla pct %', a.pct; end if;
  -- média numérica
  select * into a from public.fn_diag_agregados('geral', null, false, false) where chave='_total_moradores';
  if a.media is null then raise exception 'FALHOU T23 média de moradores'; end if;
  -- só validadas: 1 ficha → suprimida
  select * into a from public.fn_diag_agregados('geral', null, false, true) where chave='agua_tratada' and opcao='sim';
  if not a.suprimido then raise exception 'FALHOU T23 validadas (<5) não suprimidas'; end if;
end $$;

-- ── T24 sugestões ───────────────────────────────────────────────────────
select public.t_como('00000000-0000-0000-0000-0000000000e1');
do $$
declare n int;
begin
  -- grafias diferentes do mesmo nome viram UMA sugestão; resposta única não é sugerida
  select count(*) into n from public.fn_diag_sugestoes('participa_org_quais')
   where public.fn_diag_normalizar_texto(texto) = 'sindicato rural de xapuri';
  if n <> 1 then raise exception 'FALHOU T24 sindicato: % sugestões', n; end if;
  if exists (select 1 from public.fn_diag_sugestoes('participa_org_quais') where texto like 'Associação%')
     then raise exception 'FALHOU T24 resposta única virou sugestão'; end if;
  if (select count(*) from public.fn_diag_sugestoes('moradores.parentesco')) < 3 then raise exception 'FALHOU T24 sugestões da P9'; end if;
end $$;
select public.t_erro($q$select * from public.fn_diag_sugestoes('idade')$q$, 'diag:parametro_invalido');
select public.t_erro($q$select * from public.fn_diag_sugestoes('moradores.nome')$q$, 'diag:parametro_invalido');
select public.t_como('00000000-0000-0000-0000-0000000000c0');
insert into public.diag_sugestoes_ocultas (chave, texto_normalizado)
  values ('participa_org_quais', public.fn_diag_normalizar_texto('Sindicato Rural de Xapuri'));
do $$ begin
  if exists (select 1 from public.fn_diag_sugestoes('participa_org_quais')
             where public.fn_diag_normalizar_texto(texto) = 'sindicato rural de xapuri')
     then raise exception 'FALHOU T24 ocultar'; end if;
end $$;
select public.t_como('00000000-0000-0000-0000-0000000000ce');
select public.t_erro($q$select * from public.fn_diag_sugestoes()$q$, 'diag:nao_autorizado');

-- ── T25 questionário publicado é imutável ───────────────────────────────
select public.t_como('00000000-0000-0000-0000-0000000000c0');
select public.t_erro($q$update public.diag_questionarios set estrutura = '{}' where versao = 1$q$, 'diag:questionario_publicado');
-- DELETE de publicada: a policy nem enxerga a linha (só rascunho); e o trigger barra quem passe da policy
delete from public.diag_questionarios where versao = 1;
do $$ begin
  if not exists (select 1 from public.diag_questionarios where versao = 1) then raise exception 'FALHOU T25 apagou publicada'; end if;
end $$;
reset role;
select public.t_erro($q$delete from public.diag_questionarios where versao = 1$q$, 'diag:questionario_publicado');
set role authenticated;
select public.t_como('00000000-0000-0000-0000-0000000000e1');
select public.t_erro($q$insert into public.diag_questionarios (codigo, versao, titulo, estrutura, aviso_entrevistado) values ('DSA',9,'x','{}','x')$q$,
  'new row violates row-level security');

-- ── T25b coordenação cria versão nova e comunidade; publica ─────────────
select public.t_como('00000000-0000-0000-0000-0000000000c0');
insert into public.diag_questionarios (codigo, versao, titulo, estrutura, aviso_entrevistado)
  select codigo, 2, titulo, estrutura, aviso_entrevistado from public.diag_questionarios where versao = 1;
update public.diag_questionarios set status = 'publicado' where versao = 2;
insert into public.diag_comunidades (municipio_ibge, nome) values (1200401, 'Comunidade Nova da Coordenação');
do $$ begin
  if (select publicado_em from public.diag_questionarios where versao = 2) is null then raise exception 'FALHOU T25b publicado_em'; end if;
  if (select hash_sha256 from public.diag_questionarios where versao = 2)
     <> (select hash_sha256 from public.diag_questionarios where versao = 1) then raise exception 'FALHOU T25b hash de conteúdo igual'; end if;
  if length((select hash_sha256 from public.diag_questionarios where versao = 2)) <> 64 then raise exception 'FALHOU T25b hash'; end if;
end $$;
select public.t_erro($q$update public.diag_questionarios set status = 'publicado' where versao = 2 and false; update public.diag_questionarios set status='arquivado' where versao=2; update public.diag_questionarios set status='publicado' where versao=2$q$,
  'diag:questionario_arquivado');
select public.t_como('00000000-0000-0000-0000-0000000000e1');
select public.t_erro($q$insert into public.diag_comunidades (municipio_ibge, nome) values (1200401, 'Tentativa do técnico')$q$,
  'new row violates row-level security');

-- ── T26 retenção de 2 anos ──────────────────────────────────────────────
select public.t_erro('select public.fn_diag_aplicar_retencao()', 'permission denied');
reset role;
do $$
declare f uuid; n int;
begin
  select id into f from public.diag_fichas where codigo = 'DSA-XAP-260926-T1AA-03';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c0', false);
  perform public.diag_mudar_status(f, 'validada');
  update public.diag_fichas set validado_em = now() - interval '2 years 1 day' where id = f;
  n := public.fn_diag_aplicar_retencao();
  if n <> 1 then raise exception 'FALHOU T26 retenção aplicou em % fichas', n; end if;
  if exists (select 1 from public.diag_fichas_identificacao where ficha_id = f) then raise exception 'FALHOU T26 identificação ficou'; end if;
  if exists (select 1 from public.diag_moradores_identificacao mi join public.diag_moradores m on m.id = mi.morador_id where m.ficha_id = f)
     then raise exception 'FALHOU T26 nomes de moradores ficaram'; end if;
  if exists (select 1 from public.diag_fotos where ficha_id = f) then raise exception 'FALHOU T26 foto ficou'; end if;
  if not exists (select 1 from public.diag_expurgo_arquivos where motivo = 'retencao_2_anos'
                 and caminho = 'aaaaaaaa-0000-0000-0000-000000000003/bbbbbbbb-0000-0000-0000-000000000001.jpg')
     then raise exception 'FALHOU T26 arquivo não foi para a fila de expurgo'; end if;
  if (select identificacao_apagada_em from public.diag_fichas where id = f) is null then raise exception 'FALHOU T26 marca'; end if;
  if (select count(*) from public.diag_moradores where ficha_id = f) = 0 then raise exception 'FALHOU T26 apagou moradores (só a identificação sai)'; end if;
  if public.fn_diag_aplicar_retencao() <> 0 then raise exception 'FALHOU T26 retenção não é idempotente'; end if;
  -- ficha validada há 1 ano: intocada
  if not exists (select 1 from public.diag_fichas_identificacao i join public.diag_fichas x on x.id = i.ficha_id
                 where x.status = 'validada') then raise exception 'FALHOU T26 apagou ficha dentro do prazo'; end if;
end $$;

-- ── T27 auditoria redigida e ROPA ───────────────────────────────────────
do $$ begin
  if exists (select 1 from public.audit_log where tabela like 'diag_%' and dados_depois::text like '%Maria Teste%')
     then raise exception 'FALHOU T27 nome em claro no audit_log'; end if;
  if not exists (select 1 from public.audit_log where tabela = 'diag_fichas_identificacao')
     then raise exception 'FALHOU T27 identificação não auditada'; end if;
  if (select count(*) from public.lgpd_tratamentos) <> 1 then raise exception 'FALHOU T27 ROPA duplicou/ausente'; end if;
  if exists (select 1 from cron.job where jobname = 'diag-retencao-diaria') is not true then raise exception 'FALHOU T27 cron'; end if;
end $$;

-- ── T28 nenhuma policy USING (true) nem grant ao anon nas tabelas novas ──
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public'
             and (tablename like 'diag_%' or tablename = 'lgpd_tratamentos') and (qual = 'true' or with_check = 'true'))
     then raise exception 'FALHOU T28 policy USING (true)'; end if;
  if exists (select 1 from pg_policies where schemaname in ('public','storage')
             and (tablename like 'diag_%' or policyname like 'diag_%') and not ('authenticated' = any(roles)))
     then raise exception 'FALHOU T28 policy fora de TO authenticated'; end if;
  if exists (select 1 from information_schema.role_table_grants where grantee = 'anon'
             and (table_name like 'diag_%' or table_name like 'vw_diag_%' or table_name = 'lgpd_tratamentos'))
     then raise exception 'FALHOU T28 grant ao anon'; end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
             and (p.proname like 'fn_diag_%' or p.proname like 'diag_%') and has_function_privilege('anon', p.oid, 'execute'))
     then raise exception 'FALHOU T28 anon executa função do módulo'; end if;
end $$;

-- ── T29 modo treino ─────────────────────────────────────────────────────
reset role;
insert into public.usuario_permissoes (usuario_id, modulo, valido_de, valido_ate) values
 ('00000000-0000-0000-0000-0000000000e2','diagnostico_treino', now()-interval '1 day', now()+interval '30 days');
-- versão em rascunho (a v1 em produção ainda é rascunho no piloto)
insert into public.diag_questionarios (codigo, versao, titulo, estrutura, aviso_entrevistado)
  select codigo, 3, titulo, estrutura, aviso_entrevistado from public.diag_questionarios where versao = 1;
insert into public.t_ctx select 'q3', id::text from public.diag_questionarios where versao = 3;
create function public.t_ficha_q3(p_uuid uuid, p_codigo text, p_treino boolean, p_resp jsonb default null)
returns jsonb language sql stable as $$
  select public.t_ficha(p_uuid, p_codigo, p_resp) || jsonb_build_object(
    'questionario_id', (select v from public.t_ctx where k = 'q3'), 'treino', p_treino)
$$;
set role authenticated;


-- permissão: técnico só com diagnostico_treino; super_admin sempre; coordenação nunca
select public.t_como('00000000-0000-0000-0000-0000000000e1');
do $$ begin if public.fn_diag_pode_treinar() then raise exception 'FALHOU T29 e1 treina sem permissão'; end if; end $$;
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha_q3('eeeeeeee-0000-0000-0000-000000000009','TRE-XAP-260926-T1AA-01',true), public.t_mor())$q$,
  'diag:sem_permissao_treino');
select public.t_como('00000000-0000-0000-0000-0000000000c0');
do $$ begin if public.fn_diag_pode_treinar() then raise exception 'FALHOU T29 coordenação treina'; end if; end $$;
select public.t_como('00000000-0000-0000-0000-00000000005a');
do $$ begin if not public.fn_diag_pode_treinar() then raise exception 'FALHOU T29 super_admin não treina'; end if; end $$;

select public.t_como('00000000-0000-0000-0000-0000000000e2');
-- ficha real em rascunho: recusada
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha_q3('eeeeeeee-0000-0000-0000-000000000008','DSA-XAP-260926-T2TR-08',false), public.t_mor())$q$,
  'diag:questionario_invalido');
-- prefixo: treino sem TRE- e real com TRE- recusados
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha_q3('eeeeeeee-0000-0000-0000-000000000007','DSA-XAP-260926-T2TR-07',true), public.t_mor())$q$,
  'diag:ficha_invalida');
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha('eeeeeeee-0000-0000-0000-000000000006','TRE-XAP-260926-T2TR-06'), public.t_mor())$q$,
  'diag:ficha_invalida');

-- duas fichas de treino em rascunho, com texto que só existe nelas + foto
do $$
declare r jsonb; i int;
begin
  for i in 1..2 loop
    r := public.diag_enviar_ficha(
      public.t_ficha_q3(('eeeeeeee-0000-0000-0000-00000000000' || i)::uuid, 'TRE-XAP-260926-T2TR-0' || i, true,
        public.t_resp() || '{"participa_org_quais":"Clube do Treino Exclusivo"}'::jsonb),
      public.t_mor(),
      case when i = 1 then jsonb_build_array(jsonb_build_object(
        'uuid_cliente','dddddddd-0000-0000-0000-000000000001','tema','moradia',
        'arquivo_url','https://x/storage/v1/object/public/diagnostico-fotos/eeeeeeee-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000001.jpg',
        'tirada_em', now())) else '[]'::jsonb end);
    if not (r->>'treino')::boolean then raise exception 'FALHOU T29 retorno sem treino'; end if;
  end loop;
  -- reenvio idempotente
  r := public.diag_enviar_ficha(public.t_ficha_q3('eeeeeeee-0000-0000-0000-000000000001','TRE-XAP-260926-T2TR-01',true), public.t_mor());
  if (select count(*) from public.diag_fichas where codigo like 'TRE-%') <> 2 then raise exception 'FALHOU T29 contagem'; end if;
end $$;
-- treino não vira real
select public.t_erro($q$select public.diag_enviar_ficha(public.t_ficha_q3('eeeeeeee-0000-0000-0000-000000000001','DSA-XAP-260926-T2TR-01',false), public.t_mor())$q$,
  'diag:');

-- fora dos números e das sugestões
select public.t_como('00000000-0000-0000-0000-0000000000c0');
do $$ begin
  if exists (select 1 from public.vw_diag_respostas r join public.diag_fichas f on f.id = r.ficha_id where f.treino)
     then raise exception 'FALHOU T29 treino em vw_diag_respostas'; end if;
  if exists (select 1 from public.fn_diag_sugestoes('participa_org_quais') where texto ilike '%treino exclusivo%')
     then raise exception 'FALHOU T29 treino nas sugestões'; end if;
end $$;

-- apagar: só gestão
select public.t_como('00000000-0000-0000-0000-0000000000e2');
select public.t_erro('select public.diag_apagar_treino()', 'diag:nao_autorizado');
select public.t_como('00000000-0000-0000-0000-0000000000c0');
do $$
declare n int; v_reais int;
begin
  reset role;
  select count(*) into v_reais from public.diag_fichas where not treino;
  set role authenticated;
  n := public.diag_apagar_treino();
  if n <> 2 then raise exception 'FALHOU T29 apagou % fichas de treino', n; end if;
  reset role;
  if exists (select 1 from public.diag_fichas where treino) then raise exception 'FALHOU T29 sobrou treino'; end if;
  if (select count(*) from public.diag_fichas where not treino) <> v_reais then raise exception 'FALHOU T29 apagou ficha real'; end if;
  if exists (select 1 from public.diag_moradores m left join public.diag_fichas f on f.id = m.ficha_id where f.id is null)
     then raise exception 'FALHOU T29 morador órfão'; end if;
  if not exists (select 1 from public.diag_expurgo_arquivos where motivo = 'treino_apagado'
                 and caminho = 'eeeeeeee-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000001.jpg')
     then raise exception 'FALHOU T29 foto do treino fora da fila de expurgo'; end if;
  if not exists (select 1 from public.audit_log where tabela = 'diag_fichas' and operacao = 'DELETE')
     then raise exception 'FALHOU T29 exclusão não auditada'; end if;
  set role authenticated;
end $$;
