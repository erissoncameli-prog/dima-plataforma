-- ════════════════════════════════════════════════════════════════════════════
-- PATRIMÔNIO · Fase 7 — uma ficha por unidade e leitura da nota fiscal (plano.md §18)
-- ════════════════════════════════════════════════════════════════════════════
-- • Sem lote: toda unidade recebida vira uma ficha com número PAT próprio e placa
--   própria. As categorias passam a 'individual' e fn_pat_salvar_categoria não
--   aceita mais 'lote' (o check da coluna fica como está). A entrada
--   reserva o bloco de números com um lock de transação, para os PAT-… de uma mesma
--   nota saírem em sequência mesmo com duas pessoas incorporando ao mesmo tempo.
-- • Nota fiscal lida na tela (XML ou PDF, sem IA, no navegador): a incorporação
--   guarda a chave de acesso (única — a mesma NF não entra duas vezes), de onde
--   veio a lista (xml | pdf | manual), as linhas lidas e se alguém mudou valor ou
--   quantidade depois da leitura. fn_pat_nf_conferir responde, sem mostrar o CNPJ,
--   se o emitente é o fornecedor do contrato e se a chave já foi usada.
-- Sem a palavra que remove linhas no texto (o apply_migration ficaria esperando).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.pat_incorporacoes add column if not exists nf_chave text check (nf_chave is null or nf_chave ~ '^\d{44}$');
alter table public.pat_incorporacoes add column if not exists leitura_origem text not null default 'manual'
  check (leitura_origem in ('xml','pdf','manual'));
alter table public.pat_incorporacoes add column if not exists leitura_itens jsonb;
alter table public.pat_incorporacoes add column if not exists leitura_alterada boolean not null default false;
create unique index if not exists pat_incorp_nf_chave_uk on public.pat_incorporacoes (nf_chave) where nf_chave is not null;

-- sem lote
update public.pat_categorias set controle = 'individual' where controle <> 'individual';
create or replace function public.fn_pat_salvar_categoria(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_cod text := lower(btrim(coalesce(p->>'codigo', '')));
begin
  if auth.uid() is null or not public.fn_pat_pode_coordenar() then
    raise exception 'PAT_SEM_PERMISSAO: categorias são da coordenação ou do super_admin';
  end if;
  if coalesce(p->>'controle', 'individual') <> 'individual' then
    raise exception 'PAT_DADOS: não há mais controle em lote; cada unidade é uma ficha com placa própria';
  end if;
  insert into pat_categorias (codigo, nome, vida_util_meses, residual_pct, controle, exige_serie, icone, referencia, ordem, ativo)
  values (v_cod, btrim(p->>'nome'), (p->>'vida_util_meses')::int, coalesce((p->>'residual_pct')::numeric, 10),
          'individual', coalesce((p->>'exige_serie')::boolean, false),
          coalesce(nullif(p->>'icone', ''), 'caixa'), nullif(btrim(p->>'referencia'), ''),
          coalesce((p->>'ordem')::int, 0), coalesce((p->>'ativo')::boolean, true))
  on conflict (codigo) do update set
    nome = excluded.nome, vida_util_meses = excluded.vida_util_meses, residual_pct = excluded.residual_pct,
    exige_serie = excluded.exige_serie, icone = excluded.icone, referencia = excluded.referencia,
    ordem = excluded.ordem, ativo = excluded.ativo, controle = 'individual';
  return v_cod;
end $$;

-- conferência da nota lida, sem expor o CNPJ do fornecedor na tela
create or replace function public.fn_pat_nf_conferir(p_produto uuid, p_cnpj text, p_chave text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_doc text; v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
        v_chave text := regexp_replace(coalesce(p_chave, ''), '\D', '', 'g'); v_usada jsonb;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  select regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g') into v_doc
    from contratos_produtos cp join contratos c on c.id = cp.contrato_id join fornecedores f on f.id = c.fornecedor_id
   where cp.id = p_produto;
  select jsonb_build_object('incorporacao_id', i.id, 'bens', (select string_agg(b.numero, ', ' order by b.numero) from pat_bens b where b.incorporacao_id = i.id))
    into v_usada from pat_incorporacoes i where v_chave <> '' and i.nf_chave = v_chave;
  return jsonb_build_object(
    'cnpj_confere', case when coalesce(v_doc, '') = '' or v_cnpj = '' then null else v_doc = v_cnpj end,
    'chave_usada', v_usada);
end $$;

-- ── Entrada: sem lote, números em sequência, nota lida ──────────────────────
create or replace function public.fn_pat_incorporar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_origem text := coalesce(p->>'origem', 'compra_projeto');
  v_prod contratos_produtos%rowtype; c contratos%rowtype;
  v_lanc uuid; v_ptax numeric; v_ptax_data date;
  v_dt_aq date := nullif(p->>'dt_aquisicao', '')::date;
  v_dt_uso date := nullif(p->>'dt_inicio_uso', '')::date;
  v_local uuid := nullif(p->>'local_id', '')::uuid;
  v_tit text := coalesce(nullif(p->>'titularidade', ''), case when v_origem = 'compra_projeto' then 'unesco_projeto' else 'sema' end);
  v_just text := nullif(btrim(coalesce(p->>'justificativa_diferenca', '')), '');
  v_it jsonb; v_cat pat_categorias%rowtype; v_qtd int; v_total numeric; v_unit numeric; v_resto numeric;
  v_series text[]; v_soma numeric := 0; k int; v_bem uuid; v_num text; v_valor numeric;
  v_saida jsonb := '[]'::jsonb; s record; v_restante numeric; v_concluida boolean;
  v_fotos jsonb; v_f jsonb;
  v_chave text := nullif(regexp_replace(coalesce(p->>'nf_chave', ''), '\D', '', 'g'), '');
  v_leitura text := nullif(p->>'leitura_origem', '');
begin
  if v_uid is null or not public.fn_pat_pode_gerir() then
    raise exception 'PAT_SEM_PERMISSAO: incorporar bens é do gestor patrimonial, da coordenação ou do super_admin';
  end if;
  if v_id is null then raise exception 'PAT_DADOS: identificador da incorporação ausente'; end if;
  if exists (select 1 from pat_incorporacoes where id = v_id) then
    return jsonb_build_object('incorporacao_id', v_id, 'repetida', true,
      'bens', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'numero', b.numero) order by b.numero)
                          from pat_bens b where b.incorporacao_id = v_id), '[]'::jsonb));
  end if;
  if v_origem not in ('compra_projeto','cessao','doacao_recebida','outra') then raise exception 'PAT_DADOS: origem inválida'; end if;
  if v_dt_aq is null then raise exception 'PAT_DADOS: informe a data de aquisição (da nota fiscal ou do recebimento)'; end if;
  if v_dt_aq > current_date then raise exception 'PAT_DADOS: data de aquisição no futuro'; end if;
  if v_dt_uso is not null and (v_dt_uso < v_dt_aq or v_dt_uso > current_date) then
    raise exception 'PAT_DADOS: início de uso deve ficar entre a aquisição e hoje';
  end if;
  if v_local is null or not exists (select 1 from pat_locais where id = v_local and ativo) then
    raise exception 'PAT_DADOS: escolha o local onde o bem está';
  end if;
  if v_tit not in ('unesco_projeto','sema','terceiro') then raise exception 'PAT_DADOS: titularidade inválida'; end if;
  if jsonb_typeof(p->'itens') is distinct from 'array' or jsonb_array_length(p->'itens') = 0 then
    raise exception 'PAT_DADOS: inclua ao menos um bem';
  end if;
  -- nota fiscal lida (Fase 7): chave de acesso única; de onde veio a lista
  if v_chave is not null and v_chave !~ '^\d{44}$' then raise exception 'PAT_NF: a chave de acesso da NF-e tem 44 dígitos'; end if;
  if v_chave is not null and exists (select 1 from pat_incorporacoes where nf_chave = v_chave) then
    raise exception 'PAT_NF_REPETIDA: esta nota fiscal já foi usada na incorporação de outros bens';
  end if;
  if v_leitura is not null and v_leitura not in ('xml','pdf','manual') then raise exception 'PAT_DADOS: origem da leitura inválida'; end if;
  if nullif(p->>'nf_url', '') is not null and not public.fn_pat_arquivo_existe(p->>'nf_url', 'incorporacoes/' || v_id || '/') then
    raise exception 'PAT_ARQUIVO: o PDF da nota fiscal não foi encontrado no armazenamento';
  end if;

  if v_origem = 'compra_projeto' then
    select * into v_prod from contratos_produtos where id = nullif(p->>'contrato_produto_id', '')::uuid;
    if v_prod.id is null then raise exception 'PAT_DADOS: compra do projeto exige o produto do contrato'; end if;
    select * into c from contratos where id = v_prod.contrato_id;
    if c.status = 'cancelado' then raise exception 'PAT_CONTRATO: contrato cancelado'; end if;
    if v_prod.situacao not in ('aprovado','entrega_parcial','pago') then
      raise exception 'PAT_CONTRATO: o produto ainda não foi aprovado (situação %)', v_prod.situacao;
    end if;
    if public.fn_eh_fornecedor_do_contrato(c.id) then
      raise exception 'PAT_FORNECEDOR: o fornecedor do contrato não incorpora os próprios bens';
    end if;
    perform 1 from contratos_produtos where id = v_prod.id for update;
    v_lanc := public.fn_pat_lancamento_do_produto(v_prod.id);
  else
    if not public.fn_pat_pode_coordenar() then
      raise exception 'PAT_SEM_PERMISSAO: bem fora de contrato (cessão, doação) só a coordenação ou o super_admin incorpora';
    end if;
    if length(coalesce(btrim(p->>'origem_detalhe'), '')) < 10 then
      raise exception 'PAT_DADOS: descreva a origem (órgão, documento de cessão ou doação) com ao menos 10 caracteres';
    end if;
  end if;

  -- PTAX da data (reserva para o US$ quando não houver pagamento UNESCO)
  begin
    select ptax_venda, data_cotacao into v_ptax, v_ptax_data from public.fn_cotacao_usd(v_dt_aq);
  exception when others then v_ptax := null; v_ptax_data := null;
  end;

  -- números em sequência sem intercalar: uma entrada por vez reserva o bloco de PAT-…
  perform pg_advisory_xact_lock(hashtext('pat_bens_numero'));
  perform set_config('dima.pat_evento', '1', true);
  insert into pat_incorporacoes (id, origem, origem_detalhe, contrato_produto_id, contrato_id, lancamento_id, fornecedor_id,
                                 atividade_id, tdr_id, nf_numero, nf_data, nf_url, nf_nome, registrado_por,
                                 nf_chave, leitura_origem, leitura_itens, leitura_alterada)
  values (v_id, v_origem, nullif(btrim(p->>'origem_detalhe'), ''), v_prod.id, c.id, v_lanc, c.fornecedor_id,
          c.atividade_id, c.tdr_id, nullif(btrim(p->>'nf_numero'), ''), nullif(p->>'nf_data', '')::date,
          nullif(p->>'nf_url', ''), nullif(p->>'nf_nome', ''), v_uid,
          v_chave, coalesce(v_leitura, 'manual'), case when jsonb_typeof(p->'leitura_itens') = 'array' then p->'leitura_itens' end,
          coalesce((p->>'leitura_alterada')::boolean, false));

  for v_it in select * from jsonb_array_elements(p->'itens') loop
    select * into v_cat from pat_categorias where codigo = v_it->>'categoria' and ativo;
    if v_cat.codigo is null then raise exception 'PAT_DADOS: categoria inválida ou desativada (%)', v_it->>'categoria'; end if;
    if length(coalesce(btrim(v_it->>'descricao'), '')) < 3 then raise exception 'PAT_DADOS: descreva cada bem'; end if;
    v_qtd := coalesce(nullif(v_it->>'quantidade', '')::int, 1);
    v_total := round(coalesce(nullif(v_it->>'valor_total', '')::numeric, -1), 2);
    if v_qtd < 1 or v_qtd > 500 then raise exception 'PAT_DADOS: quantidade entre 1 e 500'; end if;
    if v_total < 0 then raise exception 'PAT_DADOS: informe o valor de cada item (pode ser zero em doação)'; end if;
    select coalesce(array_agg(btrim(x)) filter (where btrim(x) <> ''), '{}') into v_series
      from jsonb_array_elements_text(coalesce(v_it->'numeros_serie', '[]'::jsonb)) x;
    -- sem lote (Fase 7): cada unidade é uma ficha, com número e placa próprios
    if cardinality(v_series) > v_qtd then raise exception 'PAT_DADOS: mais números de série que unidades em "%"', v_it->>'descricao'; end if;
    if v_cat.exige_serie and cardinality(v_series) <> v_qtd then
      raise exception 'PAT_SERIE: "%" (%) exige um número de série por unidade (% de %)',
        v_it->>'descricao', v_cat.nome, cardinality(v_series), v_qtd;
    end if;
    v_soma := v_soma + v_total;
    -- fotos do item (Fase 6): até 3, uma por posição; a de frente é obrigatória
    v_fotos := coalesce(v_it->'fotos', '[]'::jsonb);
    if jsonb_typeof(v_fotos) <> 'array' then raise exception 'PAT_DADOS: fotos em formato inválido'; end if;
    if jsonb_array_length(v_fotos) > 3 then raise exception 'PAT_FOTO_LIMITE: no máximo 3 fotos por bem'; end if;
    if exists (select 1 from jsonb_array_elements(v_fotos) f where coalesce(f->>'slot', '') not in ('frente','placa','detalhe')) then
      raise exception 'PAT_DADOS: posição de foto inválida (frente, placa ou detalhe)';
    end if;
    if (select count(distinct f->>'slot') from jsonb_array_elements(v_fotos) f) <> jsonb_array_length(v_fotos) then
      raise exception 'PAT_DADOS: uma foto por posição';
    end if;
    if not exists (select 1 from jsonb_array_elements(v_fotos) f where f->>'slot' = 'frente') then
      raise exception 'PAT_FOTO_OBRIGATORIA: "%" precisa da foto de frente', btrim(v_it->>'descricao');
    end if;
    if exists (select 1 from jsonb_array_elements(v_fotos) f
                where not public.fn_pat_arquivo_existe(f->>'url', 'incorporacoes/' || v_id || '/fotos/')) then
      raise exception 'PAT_ARQUIVO: foto de "%" não encontrada no armazenamento', btrim(v_it->>'descricao');
    end if;

    -- 1 ficha por unidade (o centavo que sobra vai na última)
    for k in 1 .. v_qtd loop
      v_unit := trunc(v_total / v_qtd, 2);
      v_valor := case when k = v_qtd then v_total - v_unit * (v_qtd - 1) else v_unit end;
      insert into pat_bens (numero, numero_unesco, numero_sema, categoria_codigo, descricao, marca, modelo, numero_serie,
                            especificacao, quantidade, unidade, incorporacao_id, origem, contrato_produto_id, contrato_id,
                            fornecedor_id, atividade_id, tdr_id, dt_aquisicao, dt_inicio_uso, valor_aquisicao_brl,
                            cotacao_ptax, cotacao_ptax_data, vida_util_meses, residual_pct, garantia_ate, garantia_obs,
                            titularidade, situacao, condicao, local_id, observacoes, criado_por)
      values ('', case when v_qtd = 1 then nullif(btrim(v_it->>'numero_unesco'), '') end,
              case when v_qtd = 1 then nullif(btrim(v_it->>'numero_sema'), '') end,
              v_cat.codigo, btrim(v_it->>'descricao'), nullif(btrim(v_it->>'marca'), ''), nullif(btrim(v_it->>'modelo'), ''),
              v_series[k],
              nullif(btrim(v_it->>'especificacao'), ''),
              1,
              coalesce(nullif(btrim(v_it->>'unidade'), ''), 'un'),
              v_id, v_origem, v_prod.id, c.id, c.fornecedor_id, c.atividade_id, c.tdr_id, v_dt_aq, v_dt_uso, v_valor,
              v_ptax, v_ptax_data, v_cat.vida_util_meses, v_cat.residual_pct, nullif(v_it->>'garantia_ate', '')::date,
              nullif(btrim(v_it->>'garantia_obs'), ''), v_tit,
              case when v_dt_uso is not null then 'em_uso' else 'em_estoque' end, 'novo', v_local,
              nullif(btrim(v_it->>'observacoes'), ''), v_uid)
      returning id, numero into v_bem, v_num;
      insert into pat_eventos (bem_id, tipo, dt_evento, local_para, condicao_para, detalhes, observacao, registrado_por)
      values (v_bem, 'incorporacao', v_dt_aq, v_local, 'novo',
              jsonb_build_object('incorporacao_id', v_id, 'valor_brl', v_valor, 'origem', v_origem,
                                 'contrato', c.numero, 'nf', nullif(btrim(p->>'nf_numero'), '')),
              case when v_origem = 'compra_projeto' then 'Entrada pelo contrato ' || c.numero
                   else 'Entrada: ' || btrim(p->>'origem_detalhe') end, v_uid);
      for v_f in select * from jsonb_array_elements(v_fotos) loop
        insert into pat_documentos (bem_id, tipo, slot, url, nome, tamanho, enviado_por)
        values (v_bem, 'foto', v_f->>'slot', v_f->>'url', left(coalesce(nullif(btrim(v_f->>'nome'), ''), 'foto.jpg'), 200),
                nullif(v_f->>'tamanho', '')::bigint, v_uid);
      end loop;
      v_saida := v_saida || jsonb_build_object('id', v_bem, 'numero', v_num);
    end loop;
  end loop;

  update pat_incorporacoes set valor_total_brl = v_soma where id = v_id;

  if v_origem = 'compra_projeto' then
    select * into s from fn_pat_produto_saldo(v_prod.id);
    if s.incorporado > s.valor_ref + 0.01 then
      raise exception 'PAT_VALOR_EXCEDE: a soma dos bens (R$ %) passa o valor do produto (R$ %)',
        to_char(s.incorporado, 'FM999999990.00'), to_char(s.valor_ref, 'FM999999990.00');
    end if;
    if s.restante > 0.01 and v_just is not null then
      if length(v_just) < 10 then raise exception 'PAT_DADOS: justifique a diferença com ao menos 10 caracteres'; end if;
      update pat_incorporacoes set justificativa_diferenca = v_just where id = v_id;
      select * into s from fn_pat_produto_saldo(v_prod.id);
    end if;
    if s.concluida then
      perform public.fn_pat_fechar_tarefa_incorporar(v_prod.id,
        'Bens incorporados ao patrimônio (' || jsonb_array_length(v_saida) || ' ficha(s)).'
        || coalesce(' Diferença justificada: ' || v_just, ''));
    end if;
    v_restante := s.restante; v_concluida := s.concluida;
  end if;
  perform set_config('dima.pat_evento', '', true);

  return jsonb_build_object('incorporacao_id', v_id, 'bens', v_saida, 'valor_total', v_soma,
                            'restante', v_restante, 'concluida', v_concluida);
end $$;

revoke execute on function public.fn_pat_nf_conferir(uuid, text, text) from public, anon;
grant execute on function public.fn_pat_nf_conferir(uuid, text, text) to authenticated;
