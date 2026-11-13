// dynamic-endpoint — DESATIVADA (auditoria de segurança 13/11/2026).
// Era uma cópia antiga do enviar-email-viagem (link para o site antigo no GitHub
// Pages), sem uso pelas telas, que aceitava a chave pública: qualquer pessoa
// disparava e-mails de viagem e gerava links de prestação de contas.
// O envio de e-mail de viagem é o enviar-email-viagem.
Deno.serve(() => new Response(JSON.stringify({ ok: false, erro: 'desativada' }),
  { status: 410, headers: { 'Content-Type': 'application/json' } }))
