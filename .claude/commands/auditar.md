# /auditar — Rodar Auditoria IA

Dispara a Edge Function `auditor-ia` no Supabase e exibe um resumo dos achados encontrados.

## Passos

1. Use o MCP `mcp__8e7e9235-1600-441d-ac01-60977e04a7e4__execute_sql` com `project_id: wfymnmlinonvdqfucjya` para buscar a última execução:
   ```sql
   SELECT id, concluido_em, total_achados, achados_criticos, achados_altos, resumo_geral
   FROM auditoria_execucoes
   WHERE status = 'concluido'
   ORDER BY concluido_em DESC
   LIMIT 1;
   ```

2. Se a execução for de mais de 1 hora atrás (ou não existir), pergunte ao usuário se quer rodar uma nova auditoria.

3. Para exibir os achados abertos da última execução:
   ```sql
   SELECT dominio, severidade, titulo, descricao, recomendacao, referencia_label
   FROM auditoria_registros
   WHERE execucao_id = '<id_da_execucao>'
     AND status IN ('aberto', 'em_analise')
   ORDER BY
     CASE severidade
       WHEN 'critico' THEN 0 WHEN 'alto' THEN 1
       WHEN 'medio'   THEN 2 WHEN 'baixo' THEN 3 ELSE 4
     END;
   ```

4. Apresente os achados agrupados por severidade com emojis:
   - 🚨 **Crítico** — risco imediato, ação urgente
   - ⚠️ **Alto** — resolver em até 7 dias
   - 📋 **Médio** — monitorar e planejar correção
   - 🔵 **Baixo** / ℹ️ **Info** — melhorias gerais

5. Se o usuário pedir detalhes de um achado específico ou ação de correção, use o contexto do schema em `CLAUDE.md` para sugerir a correção diretamente no código ou no banco.

## Exemplo de saída esperada

```
## 🛡 Auditoria DIMA · Última execução: 11/05/2026 22:30

**12 achados** — 2 críticos, 4 altos, 6 médios

### 🚨 Críticos (2)
1. **Contrato vigente sem TDR aprovado** (TDR/Contrato)
   Contrato 012/2025 · Fornecedor XYZ · TDR em rascunho
   → Acesse o módulo de TDRs e submeta para aprovação

2. **Pagamento sem comprovante** (Financeiro)
   R$ 45.000 pago em 03/05/2026 · NF 00123
   → Anexe o comprovante no módulo Financeiro

### ⚠️ Altos (4)
...
```
