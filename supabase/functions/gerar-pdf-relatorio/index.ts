// gerar-pdf-relatorio — DESATIVADA (auditoria de segurança 13/11/2026).
// Mandava o HTML do relatório (com nome, CPF/CNPJ e dado de propriedade) para um
// serviço externo de PDF (Browserless) e aceitava a chave pública do site.
// Regra do projeto: PDF só pelo motor de impressão do navegador (FolhaA4).
Deno.serve(() => new Response(JSON.stringify({ ok: false, erro: 'desativada' }),
  { status: 410, headers: { 'Content-Type': 'application/json' } }))
