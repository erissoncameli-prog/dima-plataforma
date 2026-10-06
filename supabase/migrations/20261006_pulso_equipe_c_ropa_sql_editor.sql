-- Pulso da Equipe · atualização do ROPA (TRAT-002) para as perguntas personalizáveis.
-- COLAR NO SQL EDITOR do Supabase (o apply_migration do MCP expira esperando confirmação).
update public.lgpd_tratamentos set
  tabelas = array['pulso_participacoes','pulso_respostas_v2','pulso_espelho_v2','pulso_respostas','pulso_espelho'],
  categorias_dados = array['registro de que o usuário respondeu o ciclo (participação)','grupo de perfil',
        'percepções sobre o trabalho em escala e notas (anônimas)',
        'respostas de escolha única definidas por quem cria o ciclo (anônimas; podem identificar se perguntarem perfil pessoal)',
        'comentários livres (anônimos, podem identificar pelo conteúdo)',
        'identificador aleatório do aparelho do convidado (hash)'],
  medidas_seguranca = 'Resposta e participação em tabelas separadas, resposta sem usuário e sem hora; sem leitura direta das tabelas (só RPC); supressão de recorte com menos de 5 respostas; texto livre embaralhado e sem perfil; perfil determinado pelo servidor; perguntas travadas após a 1ª resposta; editor alerta pergunta de escolha que pede dado de perfil; resultado visível só para quem criou o ciclo e para a coordenação.'
where codigo = 'TRAT-002';
