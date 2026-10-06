-- Pulso da Equipe · ROPA (TRAT-002): inclui o registro de exportações.
-- COLAR NO SQL EDITOR do Supabase (o apply_migration do MCP expira esperando confirmação neste UPDATE).
update public.lgpd_tratamentos set
  tabelas = array['pulso_participacoes','pulso_respostas_v2','pulso_espelho_v2','pulso_exportacoes','pulso_respostas','pulso_espelho'],
  categorias_dados = array['registro de que o usuário respondeu o ciclo (participação)','grupo de perfil',
        'percepções sobre o trabalho em escala e notas (anônimas)',
        'respostas de escolha única definidas por quem cria o ciclo (anônimas; podem identificar se perguntarem perfil pessoal)',
        'comentários livres (anônimos, podem identificar pelo conteúdo)',
        'identificador aleatório do aparelho do convidado (hash)',
        'registro de quem exportou o resultado (usuário, ciclo, formato, data)'],
  medidas_seguranca = 'Resposta e participação em tabelas separadas, resposta sem usuário e sem hora; sem leitura direta das tabelas (só RPC); supressão de recorte com menos de 5 respostas; texto livre embaralhado e sem perfil; perfil determinado pelo servidor; perguntas travadas após a 1ª resposta; editor alerta pergunta de escolha que pede dado de perfil; resultado visível só para quem criou o ciclo e para a coordenação; exportação só de agregados (nunca respostas individuais), bloqueada abaixo de 5 respostas e registrada em pulso_exportacoes.'
where codigo = 'TRAT-002';
