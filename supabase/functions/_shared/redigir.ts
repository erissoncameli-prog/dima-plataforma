// Redação de dado pessoal antes de mandar texto à Anthropic (LGPD art. 6º, III).
// CPF/CNPJ (com ou sem máscara) ficam só com os 2 últimos dígitos; e-mail vira
// "[e-mail]". Mesmo padrão de redigirDadosPessoais() de analisar-tdr e
// sugerir-correcoes-tdr — regra nova de redação entra aqui.
export function redigirDadosPessoais(texto: string): string {
  if (!texto) return texto
  return texto
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, (m) => '***.***.***-' + m.slice(-2))
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, (m) => '**.***.***/****-' + m.slice(-2))
    .replace(/\b\d{11}\b/g, (m) => '***.***.***-' + m.slice(-2))
    .replace(/\b\d{14}\b/g, (m) => '**.***.***/****-' + m.slice(-2))
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail]')
}
