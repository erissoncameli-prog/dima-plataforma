-- ════════════════════════════════════════════════════════════════════════════
-- PATRIMÔNIO · Fase 6 — fotos do bem e da ocorrência (docs/patrimonio/plano.md §17)
-- ════════════════════════════════════════════════════════════════════════════
-- Fotos do bem em 3 posições (pat_documentos.slot): frente (capa, OBRIGATÓRIA na
-- entrada), placa/nº de série e detalhe. Uma foto viva por posição; trocar = a antiga
-- sai do quadro (ativo=false, motivo "substituída") e fica no histórico.
--   • Entrada: fn_pat_incorporar exige item.fotos com a de frente; os arquivos vão
--     antes para patrimonio-docs/incorporacoes/<id>/fotos/ (id gerado no navegador).
--   • Depois: fn_pat_foto_definir (gestor, quem guarda o bem ou a comissão de um
--     inventário aberto que tem o bem), arquivo em bens/<bem_id>/.
--   • Ocorrência: até 3 fotos no próprio registro (fn_pat_ocorrencia_registrar,
--     p.fotos), ligadas por ocorrencia_id; documentos depois seguem sem limite.
-- A foto de frente não se remove, só se troca. A tela refaz toda foto no navegador
-- (≤ 1600 px, JPEG), o que também tira os dados escondidos (GPS, aparelho).
-- Sem a palavra que remove linhas no texto (o apply_migration ficaria esperando).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.pat_documentos add column if not exists slot text check (slot in ('frente','placa','detalhe'));
create unique index if not exists pat_docs_foto_slot_uk on public.pat_documentos (bem_id, slot) where ativo and slot is not null;

-- quem pode fotografar o bem: gestor, quem guarda, ou comissão de inventário aberto com o bem
create or replace function public.fn_pat_pode_fotografar(p_bem uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
         public.fn_pat_pode_gerir()
      or exists (select 1 from pat_bens b join usuarios u on u.id = b.responsavel_id and u.ativo
                  where b.id = p_bem and b.responsavel_id = auth.uid())
      or exists (select 1 from pat_inventario_itens i join pat_inventarios v on v.id = i.inventario_id and v.situacao = 'em_andamento'
                  where i.bem_id = p_bem and public.fn_pat_inv_membro(v.id)))
$$;

-- envio ao bucket: incorporacoes/ só quem gere; bens/<id>/ quem pode fotografar o bem
create or replace function public.fn_pat_doc_pode_enviar(p_nome text)
returns boolean language sql stable security definer set search_path = public as $$
  select case split_part(p_nome, '/', 1)
           when 'incorporacoes' then public.fn_pat_pode_gerir()
           when 'bens' then public.fn_pat_pode_gerir()
                         or exists (select 1 from pat_bens b where b.id::text = split_part(p_nome, '/', 2)
                                     and public.fn_pat_pode_fotografar(b.id))
           else false end
$$;

-- foto numa posição (troca a anterior da mesma posição)
create or replace function public.fn_pat_foto_definir(p_bem uuid, p_slot text, p_url text, p_nome text, p_tamanho bigint default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.fn_pat_pode_fotografar(p_bem) then
    raise exception 'PAT_SEM_PERMISSAO: fotografa o bem o gestor patrimonial, quem guarda o bem ou a comissão do inventário';
  end if;
  if not exists (select 1 from pat_bens where id = p_bem and situacao not in ('anulado','baixado','transferido')) then
    raise exception 'PAT_ENCERRADO: bem fora do patrimônio ativo';
  end if;
  if coalesce(p_slot, '') not in ('frente','placa','detalhe') then raise exception 'PAT_DADOS: posição de foto inválida'; end if;
  if not public.fn_pat_arquivo_existe(p_url, 'bens/' || p_bem || '/') then
    raise exception 'PAT_ARQUIVO: foto não encontrada no armazenamento';
  end if;
  update pat_documentos set ativo = false, removido_por = auth.uid(), removido_em = now(), motivo_remocao = 'Substituída por outra foto'
   where bem_id = p_bem and slot = p_slot and ativo;
  insert into pat_documentos (bem_id, tipo, slot, url, nome, tamanho, enviado_por)
  values (p_bem, 'foto', p_slot, p_url, left(coalesce(nullif(btrim(p_nome), ''), 'foto.jpg'), 200), p_tamanho, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- anexo genérico: foto vai para a primeira posição livre (máximo 3)
create or replace function public.fn_pat_anexar(p_bem uuid, p_tipo text, p_url text, p_nome text, p_tamanho bigint default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_slot text;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  if not exists (select 1 from pat_bens where id = p_bem and situacao <> 'anulado') then raise exception 'PAT_DADOS: bem não encontrado'; end if;
  if p_tipo not in ('foto','laudo','garantia','manual','termo','bo','outro') then raise exception 'PAT_DADOS: tipo de documento inválido'; end if;
  if p_tipo = 'foto' then
    select s into v_slot from unnest(array['frente','placa','detalhe']) with ordinality as t(s, o)
     where not exists (select 1 from pat_documentos d where d.bem_id = p_bem and d.slot = t.s and d.ativo)
     order by o limit 1;
    if v_slot is null then raise exception 'PAT_FOTO_LIMITE: o bem já tem as 3 fotos; troque uma delas no quadro de fotos'; end if;
    return public.fn_pat_foto_definir(p_bem, v_slot, p_url, p_nome, p_tamanho);
  end if;
  if not public.fn_pat_arquivo_existe(p_url, 'bens/' || p_bem || '/') then
    raise exception 'PAT_ARQUIVO: arquivo não encontrado no armazenamento';
  end if;
  insert into pat_documentos (bem_id, tipo, url, nome, tamanho, enviado_por)
  values (p_bem, p_tipo, p_url, left(coalesce(nullif(btrim(p_nome), ''), 'arquivo'), 200), p_tamanho, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- remover: a foto de frente não sai (só se troca)
create or replace function public.fn_pat_remover_anexo(p_doc uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  if length(coalesce(btrim(p_motivo), '')) < 5 then raise exception 'PAT_DADOS: diga por que o arquivo sai'; end if;
  if exists (select 1 from pat_documentos d join pat_bens b on b.id = d.bem_id
              where d.id = p_doc and d.ativo and d.slot = 'frente' and b.situacao <> 'anulado') then
    raise exception 'PAT_FOTO_OBRIGATORIA: a foto de frente é obrigatória; troque por outra em vez de remover';
  end if;
  update pat_documentos set ativo = false, removido_por = auth.uid(), removido_em = now(), motivo_remocao = btrim(p_motivo)
   where id = p_doc and ativo;
  if not found then raise exception 'PAT_DADOS: documento não encontrado'; end if;
end $$;

-- ── Entrada com fotos ───────────────────────────────────────────────────────
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

  perform set_config('dima.pat_evento', '1', true);
  insert into pat_incorporacoes (id, origem, origem_detalhe, contrato_produto_id, contrato_id, lancamento_id, fornecedor_id,
                                 atividade_id, tdr_id, nf_numero, nf_data, nf_url, nf_nome, registrado_por)
  values (v_id, v_origem, nullif(btrim(p->>'origem_detalhe'), ''), v_prod.id, c.id, v_lanc, c.fornecedor_id,
          c.atividade_id, c.tdr_id, nullif(btrim(p->>'nf_numero'), ''), nullif(p->>'nf_data', '')::date,
          nullif(p->>'nf_url', ''), nullif(p->>'nf_nome', ''), v_uid);

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
    if v_cat.controle = 'lote' then
      if cardinality(v_series) > 1 then raise exception 'PAT_DADOS: bem em lote não leva vários números de série'; end if;
    else
      if cardinality(v_series) > v_qtd then raise exception 'PAT_DADOS: mais números de série que unidades em "%"', v_it->>'descricao'; end if;
      if v_cat.exige_serie and cardinality(v_series) <> v_qtd then
        raise exception 'PAT_SERIE: "%" (%) exige um número de série por unidade (% de %)',
          v_it->>'descricao', v_cat.nome, cardinality(v_series), v_qtd;
      end if;
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

    -- lote = 1 ficha com a quantidade; individual = 1 ficha por unidade (centavo que sobra vai na última)
    for k in 1 .. case when v_cat.controle = 'lote' then 1 else v_qtd end loop
      if v_cat.controle = 'lote' then v_valor := v_total;
      else
        v_unit := trunc(v_total / v_qtd, 2);
        v_valor := case when k = v_qtd then v_total - v_unit * (v_qtd - 1) else v_unit end;
      end if;
      insert into pat_bens (numero, numero_unesco, numero_sema, categoria_codigo, descricao, marca, modelo, numero_serie,
                            especificacao, quantidade, unidade, incorporacao_id, origem, contrato_produto_id, contrato_id,
                            fornecedor_id, atividade_id, tdr_id, dt_aquisicao, dt_inicio_uso, valor_aquisicao_brl,
                            cotacao_ptax, cotacao_ptax_data, vida_util_meses, residual_pct, garantia_ate, garantia_obs,
                            titularidade, situacao, condicao, local_id, observacoes, criado_por)
      values ('', case when v_qtd = 1 then nullif(btrim(v_it->>'numero_unesco'), '') end,
              case when v_qtd = 1 then nullif(btrim(v_it->>'numero_sema'), '') end,
              v_cat.codigo, btrim(v_it->>'descricao'), nullif(btrim(v_it->>'marca'), ''), nullif(btrim(v_it->>'modelo'), ''),
              case when v_cat.controle = 'lote' then v_series[1] else v_series[k] end,
              nullif(btrim(v_it->>'especificacao'), ''),
              case when v_cat.controle = 'lote' then v_qtd else 1 end,
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

-- ── Ocorrência com até 3 fotos no registro ─────────────────────────────────
create or replace function public.fn_pat_ocorrencia_registrar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); b pat_bens%rowtype; v_id uuid; v_num text; v_tipo text := p->>'tipo';
  v_dt date := nullif(p->>'dt_ocorrencia', '')::date; v_cond text := nullif(p->>'condicao', ''); v_sit text; v_tar uuid;
  v_gestor uuid; v_fotos jsonb := coalesce(p->'fotos', '[]'::jsonb); v_f jsonb;
begin
  select * into b from pat_bens where id = nullif(p->>'bem_id', '')::uuid for update;
  if b.id is null then raise exception 'PAT_DADOS: bem não encontrado'; end if;
  if v_uid is null or not public.fn_pat_pode_registrar_ocorrencia(b.id) then
    raise exception 'PAT_SEM_PERMISSAO: ocorrência é registrada pelo gestor patrimonial ou por quem guarda o bem';
  end if;
  if b.situacao in ('anulado','baixado','transferido') then raise exception 'PAT_ENCERRADO: bem fora do patrimônio ativo'; end if;
  if v_tipo not in ('avaria','defeito','mau_uso','extravio','furto','roubo','sinistro') then raise exception 'PAT_DADOS: tipo de ocorrência inválido'; end if;
  if v_dt is null or v_dt > current_date or v_dt < b.dt_aquisicao then raise exception 'PAT_DADOS: data da ocorrência inválida'; end if;
  if length(coalesce(btrim(p->>'descricao'), '')) < 20 then raise exception 'PAT_DADOS: descreva o que aconteceu com ao menos 20 caracteres'; end if;
  if v_tipo in ('furto','roubo') and coalesce(btrim(p->>'bo_numero'), '') = '' then
    raise exception 'PAT_BO: furto ou roubo exige o número do boletim de ocorrência';
  end if;
  if v_tipo in ('extravio','furto','roubo') and b.situacao = 'extraviado' then raise exception 'PAT_SITUACAO: o bem já está extraviado'; end if;
  if exists (select 1 from pat_ocorrencias where bem_id = b.id and situacao <> 'concluida' and tipo = v_tipo) then
    raise exception 'PAT_DADOS: já há ocorrência deste tipo aberta para o bem';
  end if;
  if v_cond is not null then
    if v_cond not in ('bom','regular','ruim','inservivel') then raise exception 'PAT_DADOS: condição inválida'; end if;
  end if;
  if public.fn_pat_bem_em_termo(b.id) is not null and v_tipo in ('extravio','furto','roubo') then
    raise exception 'PAT_TERMO_PENDENTE: cancele o termo pendente do bem antes';
  end if;

  if jsonb_typeof(v_fotos) <> 'array' then raise exception 'PAT_DADOS: fotos em formato inválido'; end if;
  if jsonb_array_length(v_fotos) > 3 then raise exception 'PAT_FOTO_LIMITE: no máximo 3 fotos no registro da ocorrência'; end if;
  if exists (select 1 from jsonb_array_elements(v_fotos) f where not public.fn_pat_arquivo_existe(f->>'url', 'bens/' || b.id || '/')) then
    raise exception 'PAT_ARQUIVO: foto da ocorrência não encontrada no armazenamento';
  end if;

  v_num := 'OC-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.pat_ocorrencias_numero_seq')::text, 4, '0');
  v_sit := case when v_tipo in ('extravio','furto','roubo') then 'extraviado' else b.situacao end;
  perform set_config('dima.pat_evento', '1', true);
  insert into pat_ocorrencias (numero, bem_id, tipo, dt_ocorrencia, onde, descricao, bo_numero, situacao_bem_antes, condicao_antes, registrado_por)
  values (v_num, b.id, v_tipo, v_dt, nullif(btrim(p->>'onde'), ''), btrim(p->>'descricao'), nullif(btrim(p->>'bo_numero'), ''),
          b.situacao, b.condicao, v_uid)
  returning id into v_id;
  update pat_bens set situacao = v_sit, condicao = coalesce(v_cond, condicao) where id = b.id;
  insert into pat_eventos (bem_id, tipo, dt_evento, condicao_de, condicao_para, detalhes, observacao, registrado_por)
  values (b.id, 'ocorrencia', v_dt, b.condicao, coalesce(v_cond, b.condicao),
          jsonb_build_object('ocorrencia_id', v_id, 'ocorrencia', v_num, 'tipo', v_tipo, 'situacao_antes', b.situacao,
                             'situacao_depois', v_sit, 'bo', nullif(btrim(p->>'bo_numero'), '')),
          btrim(p->>'descricao'), v_uid);
  v_gestor := public.fn_pat_gestor_padrao();
  v_tar := public.fn_pat_criar_tarefa('Tratar ocorrência ' || v_num || ' — ' || b.numero,
    'Ocorrência de ' || replace(v_tipo, '_', ' ') || ' registrada para ' || b.numero || ' (' || b.descricao || '). Apure, anexe os documentos '
      || '(boletim, laudo, fotos) e registre o desfecho em Patrimônio › Ocorrências. A tarefa é concluída quando a ocorrência for concluída.',
    v_gestor, v_uid, current_date + 30, 'pat_ocorrencia', v_id, case when v_tipo in ('furto','roubo','sinistro','extravio') then 'alta' else 'media' end);
  update pat_ocorrencias set tarefa_id = v_tar where id = v_id;
  for v_f in select * from jsonb_array_elements(v_fotos) loop
    insert into pat_documentos (bem_id, tipo, url, nome, tamanho, enviado_por, ocorrencia_id)
    values (b.id, 'foto', v_f->>'url', left(coalesce(nullif(btrim(v_f->>'nome'), ''), 'foto.jpg'), 200),
            nullif(v_f->>'tamanho', '')::bigint, v_uid, v_id);
  end loop;
  perform set_config('dima.pat_evento', '', true);
  return jsonb_build_object('ocorrencia_id', v_id, 'numero', v_num);
end $$;

-- ── Capa = foto de frente; contagem = fotos do quadro ──────────────────────
create or replace view public.vw_pat_bens with (security_invoker = true) as
select b.id, b.numero, b.numero_unesco, b.numero_sema, b.categoria_codigo, c.nome as categoria_nome,
       c.controle, c.icone as categoria_icone, b.descricao, b.marca, b.modelo, b.numero_serie, b.especificacao,
       b.quantidade, b.unidade, b.incorporacao_id, b.origem, b.contrato_produto_id, b.contrato_id,
       ct.numero as contrato_numero, b.fornecedor_id, f.nome as fornecedor_nome,
       b.atividade_id, a.codigo as atividade_codigo, b.tdr_id, t.numero as tdr_numero,
       b.dt_aquisicao, b.dt_inicio_uso, b.garantia_ate, b.garantia_obs, b.titularidade,
       b.situacao, b.condicao, b.local_id, l.nome as local_nome, b.responsavel_id,
       r.nome_completo as responsavel_nome, b.ultimo_inventario_em, b.dt_baixa, b.observacoes,
       b.criado_por, b.criado_em, b.atualizado_em,
       case when v.ok then (i.nf_url is null and b.origem = 'compra_projeto') end as nf_pendente,
       case when v.ok then i.nf_numero end as nf_numero,
       case when v.ok then i.nf_data end as nf_data,
       case when v.ok then i.nf_url end as nf_url,
       case when v.ok then i.nf_nome end as nf_nome,
       case when v.ok then b.valor_aquisicao_brl end as valor_aquisicao_brl,
       case when v.ok then b.vida_util_meses end as vida_util_meses,
       case when v.ok then b.residual_pct end as residual_pct,
       case when v.ok then d.meses end as meses_depreciados,
       case when v.ok then d.cota_mensal end as cota_mensal_brl,
       case when v.ok then d.depreciacao_acumulada end as depreciacao_acumulada_brl,
       case when v.ok then d.valor_contabil end as valor_contabil_brl,
       case when v.ok then d.valor_residual end as valor_residual_brl,
       case when v.ok then (d.meses >= b.vida_util_meses) end as totalmente_depreciado,
       case when v.ok then x.cotacao end as cotacao,
       case when v.ok then x.origem end as cotacao_origem,
       case when v.ok and x.cotacao > 0 then round(b.valor_aquisicao_brl / x.cotacao, 2) end as valor_aquisicao_usd,
       case when v.ok and x.cotacao > 0 then round(d.valor_contabil / x.cotacao, 2) end as valor_contabil_usd,
       (select count(*) from pat_documentos dc where dc.bem_id = b.id and dc.ativo and dc.tipo = 'foto' and dc.slot is not null)::int as n_fotos,
       (select dc.url from pat_documentos dc where dc.bem_id = b.id and dc.ativo and dc.tipo = 'foto' and dc.ocorrencia_id is null and dc.baixa_id is null
         order by (dc.slot = 'frente') desc nulls last, dc.enviado_em limit 1) as foto_url,
       public.fn_pat_bem_em_termo(b.id) as termo_pendente,
       (select tt.devolver_ate from pat_termo_itens ti join pat_termos tt on tt.id = ti.termo_id
         where ti.bem_id = b.id and tt.tipo = 'emprestimo' and tt.situacao = 'aceito' and tt.devolvido_em is null
           and b.situacao = 'emprestado' order by tt.decidido_em desc limit 1) as devolver_ate,
       (select tt.numero from pat_termo_itens ti join pat_termos tt on tt.id = ti.termo_id
         where ti.bem_id = b.id and tt.situacao = 'aceito' and b.responsavel_id = tt.responsavel_id
         order by tt.decidido_em desc limit 1) as termo_vigente,
       (select oc.numero from pat_ocorrencias oc where oc.bem_id = b.id and oc.situacao <> 'concluida'
         order by oc.registrado_em desc limit 1) as ocorrencia_aberta,
       (select bx.numero from pat_baixas bx where bx.bem_id = b.id and bx.situacao = 'aguardando' limit 1) as baixa_pendente
  from pat_bens b
  join pat_categorias c on c.codigo = b.categoria_codigo
  left join pat_incorporacoes i on i.id = b.incorporacao_id
  left join pat_locais l on l.id = b.local_id
  left join usuarios r on r.id = b.responsavel_id
  left join contratos ct on ct.id = b.contrato_id
  left join fornecedores f on f.id = b.fornecedor_id
  left join atividades a on a.id = b.atividade_id
  left join tdrs t on t.id = b.tdr_id
  cross join lateral (select public.fn_pat_pode_ver_valor() as ok) v
  cross join lateral public.fn_pat_depreciacao(b.valor_aquisicao_brl, b.residual_pct, b.vida_util_meses,
                                               b.dt_inicio_uso, current_date, b.dt_baixa) d
  cross join lateral public.fn_pat_cotacao_bem(b.id) x;
revoke all on public.vw_pat_bens from anon, authenticated;
grant select on public.vw_pat_bens to authenticated;

-- ── Permissões ──────────────────────────────────────────────────────────────
revoke execute on function public.fn_pat_pode_fotografar(uuid), public.fn_pat_foto_definir(uuid, text, text, text, bigint)
  from public, anon;
grant execute on function public.fn_pat_pode_fotografar(uuid), public.fn_pat_foto_definir(uuid, text, text, text, bigint) to authenticated;
