# Acessos por módulo liberado e entrada suspensa por inatividade

Decidido com o super_admin em 21/11/2026; em produção desde 26/11/2026 (migrações `20261126_acessos_a_estrutura`,
`_b_migracao_trava`, `_c_emails_auditor` e `_sino_sql_editor`). Testes de tela: `node tests/acessos/telas.js`.

## Regra

- **O perfil é o teto; a liberação é a chave.** Cada módulo precisa estar liberado em `usuario_permissoes`
  (linha ativa e no prazo). Conta nova nasce **sem nenhum módulo**. O super_admin tem tudo e nunca é suspenso.
- **Núcleo sempre aberto:** Visão Geral, Minhas tarefas, Manual e Meu perfil (`ACESSO_NUCLEO` em `js/config.js`).
- **Vínculo abre página sem módulo** (`ACESSO_VINCULO`, `fn_meus_vinculos()`): responsável/substituto de atividade →
  Atividades, TDRs, Produtos, Remanejamento; titular de cargo → Remanejamento; fornecedor vinculado → Produtos.
  No banco, os trechos de vínculo das policies não mudaram.
- **Dentro do teto, a liberação dá o que o perfil dava; fora dele, o "extra" continua como era.** Por isso o
  extra de Viagens (ver todos os protocolos) não vale para técnico (`viagem_prot_select_extra`).
- Catálogo: tabela `acesso_modulos` (rótulo, teto por perfil, núcleo) = `MODULOS_LISTA` de `js/usuarios.js`.
  Mudou num, muda no outro.

## Onde vale

| Camada | O quê |
|---|---|
| Banco | `fn_modulo_liberado()`/`tem_permissao()` no trecho de perfil de: `contratos` (select e escrita), `execucao_financeira`, `fornecedores` (escrita) e `fornecedor_dados_bancarios`, `viagem_protocolos`/`viagem_viajantes`, `beneficiarios`/`beneficiario_dados_bancarios`, `fn_pat_pode_*` (catálogo = `patrimonio_catalogo`), `fn_diag_pode_gerir` |
| Tela | `acessoLiberado(navId)` em `js/config.js`: menu (`layout.js`) e trava de página (`gerarLayout` manda para `pages/sem-acesso.html?m=<navId>`); Relatórios (`getAbasPermitidas`) e Cobertura da Visão Geral por módulo |

Exceções mantidas de propósito: o visualizador continua lendo `execucao_financeira` pelo perfil (a Visão Geral é
aberta a todos); a lista de fornecedores ainda aparece a quem enxerga TDR/contrato/lançamento/tarefa ligados a ele.

**Fase 2 (migração `20261127_acessos_d_vinculos_fase2`, 27/11/2026):**
- Ações que conferiam só o perfil exigem o módulo no trecho do perfil (o de vínculo não muda): pedir encerramento e
  anexar termo (`contratos`), liberar/estornar economia, licitação, cancelamento de TDR e `fn_registrar_acao_tdr`
  (`tdrs`; sem o módulo a pessoa age só pelo vínculo, como técnico), remanejamento e estorno (`remanejamentos`),
  editar mapa (`mapa`), gestor do Pulso (`pulso`), comprovantes/devolução de viagem (`viagens`, por
  `fn_usuario_modulo(uid, m)` nas funções chamadas pela Edge Function). Regras de gravação de atividades,
  responsáveis, matriz, indicadores, riscos, TDRs (inserir/editar/anexos/versões), produtos e encerramentos idem.
- Viagens: viajantes, trechos, diárias, tabelas antigas e registro de e-mails seguem `fn_viagem_pode(protocolo,
  'ver'|'editar')` = super_admin, coordenação/financeiro com o módulo, extra de Viagens (só ver, exceto técnico) ou quem
  participa (`fn_viagem_participa`). Quem participa passa a ver o próprio protocolo (`viagem_prot_participa`).
  Criar protocolo exige o módulo.
- Leitura de TDRs por perfil (coordenação, financeiro, visualizador) ficou como estava: a Visão Geral, aberta a todos, usa.
- Vínculos que abrem página: Contratos (responsável/fornecedor), Viagens (`viagem`), Patrimônio (`patrimonio`: bem sob
  guarda, termo a aceitar, comissão de inventário aberta), Pulso (`pulso`: criou ciclo).

## Responsáveis e titulares de cargo (decisão de 21/11/2026)
- Ganham na hora, sem prazo, os módulos do perfil (`fn_acesso_conceder_padrao`, gatilhos `trg_atividade_resp_acesso` e
  `trg_rem_titular_acesso`); os atuais foram aplicados na migração D sem desfazer módulo retirado de propósito.
- **Não são suspensos por inatividade** (`fn_acesso_vinculo_permanente` na `fn_acesso_rotina`): recebem o aviso e o
  Auditor aponta "Acessos: responsável ou signatário sem entrar há 15 dias".

## Revisão inicial (26/11/2026)

- Responsáveis/substitutos ativos de atividade: tudo o que o perfil dava virou liberação **permanente**.
- Entrevistadores do Diagnóstico (consultores externos): os acessos `diagnostico*` ficaram **confirmados**.
- Demais: tudo **em revisão** (`em_revisao = true`, `valido_ate` = migração + 15 dias, prazo antigo em
  `revisao_valido_ate_original`). Não confirmado ⇒ sai sozinho no prazo. Confirmar = em Usuários, "Revisei…" + salvar.

## Inatividade

- `fn_usuario_ultima_atividade` = mais recente entre `ultimo_acesso_em` (mesa), `ultimo_acesso_app_em` (app de campo,
  `fn_registrar_acesso('app')` a cada sincronização), `auth.users.last_sign_in_at`, criação, início da regra
  (`acesso_regras.inatividade_desde`) e liberação − 12 dias (carência de 3 dias).
- `fn_acesso_rotina()` (cron `acesso-rotina`, 10:43 UTC): 12 dias ⇒ e-mail de aviso; 15 dias ⇒ `bloqueado_inatividade_em`,
  banimento no Auth (`trg_usuario_ban`), `fn_perfil_atual()`/`tem_permissao()` deixam de responder, e-mail à pessoa,
  sino + resumo por e-mail aos super_admins. Também avisa prazo de liberação a 7 dias e revisão pendente (a cada 3 dias).
- Liberar: `fn_acesso_liberar_inatividade` (super_admin; botão "Liberar entrada"); pedido sem login na tela de entrada:
  `fn_publico_pedir_liberacao` (resposta sempre igual, 30/hora).
- Colunas de inatividade só mudam pelas funções (`trg_usuario_guarda_acesso`, chave `dima.acesso='rpc'`), que também
  recusa ficar com menos de 2 super_admins ativos (`MINIMO_SUPER_ADMIN`).

## Avisos, pedidos e relatório

- Sino: tipos `acesso_*` (exigem `20261126_acessos_sino_sql_editor.sql`; sem ele `fn_acesso_avisar` descarta em silêncio).
- E-mail: fila `acesso_notificacoes` → Edge Function `acesso-emails` (cron `acesso-emails`, 15 min) → `_shared/acesso-email.ts`.
- Pedidos: `usuario_pedidos_acesso` (`fn_acesso_pedir`, `fn_acesso_cancelar_pedido`, `fn_acesso_decidir`); tela
  `pages/sem-acesso.html` e Usuários › Pedidos de acesso.
- Relatório "Quem acessa o quê" (Usuários): A4 pela FolhaA4 + planilha ExcelJS.
- Auditor: `fn_auditoria_acessos()` (achados "Acessos: …"); agente `auditarAcessos` em `auditor-ia` (publicar a v24).
- ROPA: TRAT-007.
