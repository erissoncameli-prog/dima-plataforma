-- Nota técnica obrigatória e conferida na aprovação de produto (total ou parcial; devolução fora).
--
-- A Edge Function `conferir-nota-tecnica` baixa o PDF do bucket entregas-docs, extrai o texto (unpdf,
-- sem IA, sem custo), aplica as regras e grava o resultado aqui (service_role). A tela só mostra o que
-- a função devolveu. A aprovação (contratos_produtos_entregas.situacao → 'aprovada') é recusada pelo
-- banco se não houver conferência APROVADA do mesmo arquivo para a mesma entrega.
--
-- Regras (todas bloqueiam): pdf · texto legível · título "Nota Técnica" · assinatura eletrônica SEI ·
-- código verificador + CRC · nº do contrato · nota não usada em outro produto · produto citado ·
-- fornecedor citado · assinada há no máximo 60 dias (e não depois de hoje) · assinada pelo
-- responsável/substituto da atividade ou por quem aprova.

create table if not exists public.nota_tecnica_conferencias (
  id                 uuid primary key default gen_random_uuid(),
  entrega_id         uuid not null references public.contratos_produtos_entregas(id),
  caminho            text not null,            -- caminho no bucket entregas-docs
  arquivo_nome       text,
  sha256             text,
  tamanho            bigint,
  paginas            integer,
  origem             text not null default 'tela' check (origem in ('tela', 'calibracao')),
  aprovada           boolean not null,
  regras             jsonb not null default '[]',   -- [{id, ok, titulo, detalhe, corrigir}]
  nt_numero          text,
  sei_documento      text,
  codigo_verificador text,
  codigo_crc         text,
  signatarios        jsonb not null default '[]',   -- [{nome, cargo, data}]
  data_assinatura    date,
  conferido_por      uuid references public.usuarios(id),
  conferido_em       timestamptz not null default now()
);
create index if not exists nt_conf_entrega_idx on public.nota_tecnica_conferencias (entrega_id, conferido_em desc);
create index if not exists nt_conf_sha_idx     on public.nota_tecnica_conferencias (sha256);
create index if not exists nt_conf_cv_idx      on public.nota_tecnica_conferencias (codigo_verificador);

alter table public.nota_tecnica_conferencias enable row level security;
revoke all on public.nota_tecnica_conferencias from public, anon, authenticated;
grant select on public.nota_tecnica_conferencias to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nota_tecnica_conferencias' and policyname = 'ntc_select') then
    -- quem enxerga a entrega (RLS de contratos_produtos_entregas) enxerga a conferência
    create policy ntc_select on public.nota_tecnica_conferencias for select to authenticated
      using (exists (select 1 from public.contratos_produtos_entregas e where e.id = entrega_id));
  end if;
end $$;

-- Chave de uso único para a calibração em lote (chamada da função pelo banco, sem login).
create table if not exists public.nota_tecnica_calibracao_chaves (
  chave     text primary key,
  criado_em timestamptz not null default now(),
  usada_em  timestamptz
);
alter table public.nota_tecnica_calibracao_chaves enable row level security;
revoke all on public.nota_tecnica_calibracao_chaves from public, anon, authenticated;

-- caminho dentro do bucket a partir da URL "portadora" (/object/public/entregas-docs/<caminho>)
create or replace function public.fn_nt_caminho(p_url text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(p_url, ''), '^.*/entregas-docs/', ''), coalesce(p_url, ''))
$$;

-- Trava: aprovar exige conferência aprovada do mesmo arquivo
create or replace function public.fn_trg_entrega_exige_nota()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_cam text;
begin
  if new.situacao is distinct from 'aprovada' then return new; end if;
  if tg_op = 'UPDATE' and old.situacao = 'aprovada'
     and new.nota_tecnica_url is not distinct from old.nota_tecnica_url then
    return new;   -- já aprovada antes; nada mudou na nota
  end if;
  if current_setting('dima.nota_tecnica', true) = 'dispensar' then return new; end if;

  v_cam := public.fn_nt_caminho(new.nota_tecnica_url);
  if v_cam is null then
    raise exception 'NOTA_TECNICA_OBRIGATORIA: anexe a nota técnica (PDF do SEI) para aprovar o produto.';
  end if;
  if not exists (
    select 1 from public.nota_tecnica_conferencias c
     where c.entrega_id = new.id and c.caminho = v_cam and c.aprovada and c.origem = 'tela'
       and c.conferido_em > now() - interval '2 days'
       and c.id = (select c2.id from public.nota_tecnica_conferencias c2
                    where c2.entrega_id = new.id and c2.caminho = v_cam
                    order by c2.conferido_em desc limit 1)
  ) then
    raise exception 'NOTA_TECNICA_NAO_CONFERIDA: a nota técnica anexada não passou na conferência — anexe a nota corrigida.';
  end if;
  return new;
end $$;
revoke execute on function public.fn_trg_entrega_exige_nota() from public, anon, authenticated;

create or replace trigger trg_entrega_exige_nota
  before insert or update on public.contratos_produtos_entregas
  for each row execute function public.fn_trg_entrega_exige_nota();
