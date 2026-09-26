# RIPD — Diagnóstico Socioambiental (RASCUNHO para discussão)

> **Relatório de Impacto à Proteção de Dados Pessoais** (LGPD, art. 5º, XVII e art. 38).
> **Status:** rascunho técnico para discussão com a equipe, o Encarregado (DPO) e o
> jurídico da SEMA/AC. **Não é documento aprovado.** Os campos marcados com
> **[A DEFINIR]** dependem de decisão da SEMA.
>
> Base: [`plano.md`](plano.md) e [`instrumento-v1.md`](instrumento-v1.md).

---

## Para que serve este documento (leitura rápida)

O RIPD é a SEMA respondendo por escrito, **antes da coleta**, a quatro perguntas:

1. **O que vamos coletar e por quê?**
2. **O que pode dar errado para as pessoas entrevistadas?**
3. **O que fizemos para evitar?**
4. **Quanto risco sobra, e ele é aceitável?**

A ANPD (Autoridade Nacional de Proteção de Dados) pode exigir o relatório (art. 38).
Este diagnóstico tem três características que tornam o RIPD recomendado: há
**dado sensível** (filiação a sindicato), **dados de crianças e adolescentes**
(tabela de moradores) e o público são **comunidades em situação de
vulnerabilidade**. Se houver incidente ou reclamação, é este documento que mostra
que os riscos foram avaliados antes.

---

## 0. Identificação

| Item | Conteúdo |
|------|----------|
| Controlador | Secretaria de Estado de Meio Ambiente do Acre — SEMA/AC |
| Encarregado (DPO) | Luciana Cristina Rôla de Souza — contato para titulares: **somente e-mail**, divbioac@gmail.com *(decidido em 26/09)*. **[A DEFINIR]** ato formal de designação pela SEMA (LGPD art. 41) |
| Tratamento | Diagnóstico Socioambiental de comunidades: questionário domiciliar aplicado em campo |
| Projeto | 218BRA2001 — SEMA/AC · Fundo Brasil-ONU · UNESCO |
| Sistema | DIMA (módulo `diagnostico`): app de campo (PWA/Android) + tela de gestão |
| Operadores | Supabase (banco e arquivos), Vercel (hospedagem), consultores externos contratados pela SEMA (com termo de confidencialidade e LGPD) |
| Elaborado por | **[A DEFINIR]** |
| Data / versão | rascunho 0.1 — 26/09/2026 |

---

## 1. O que vamos coletar e por quê

### 1.1 Finalidade

Levantar as condições socioambientais de ~200 domicílios em comunidades do
Acre (moradia, água e saneamento, saúde e educação, renda e produção, uso da
terra, problemas ambientais, organização social, gênero) para **subsidiar o
planejamento das ações do projeto** e a **prestação de contas** por meio de
indicadores agregados na Matriz de Resultados.

O uso é **interno da SEMA**. Nenhum dado individual é repassado a terceiros. O que
sai da SEMA são números agregados (indicadores), sem identificação.

### 1.2 Titulares

| Titular | Como aparece |
|---------|-------------|
| Entrevistado (adulto responsável pelo domicílio, em regra) | responde o questionário |
| Moradores do domicílio, **incluindo crianças e adolescentes** | citados na tabela de moradores (P9) |
| Técnicos entrevistadores (servidores/colaboradores da SEMA) | identificados como autores da ficha; GPS no momento da coleta |

### 1.3 Dados coletados

| Categoria | Dados | Classe |
|-----------|-------|--------|
| Identificação | nome do entrevistado (**opcional**); nome dos moradores (ou só iniciais) | pessoal |
| Perfil | sexo/gênero, idade, tempo na comunidade | pessoal |
| Composição do domicílio | idade, sexo/gênero, parentesco, escolaridade e ocupação de cada morador | pessoal; **inclui menores** |
| Localização | comunidade, município, coordenada GPS da casa | pessoal (identifica a família) |
| Fotos | moradia e entorno (água, esgoto, lixo, produção, acesso) — **nunca pessoas** | pessoal (localiza a família) |
| Condição socioeconômica | fontes de renda, suficiência da renda, benefícios sociais, crédito, assistência técnica, produção | pessoal |
| Dinâmica familiar | quem decide sobre dinheiro e produção | pessoal |
| Participação social | participação em organizações, **inclusive sindicato** (P54/P55) | **sensível** (art. 5º, II) |
| Saúde | problemas de saúde **da comunidade** (lista fechada) | sensível apenas se o texto "Outro" citar pessoa |
| Percepções | meio ambiente, participação das mulheres, prioridades, futuro | pessoal |

**Não coletamos:** CPF, RG, telefone, valor de renda, número de benefício social
(NIS), data de nascimento.

### 1.4 Base legal

**[A DEFINIR com o jurídico].** Hipóteses em análise:

| Dado | Hipótese candidata |
|------|-------------------|
| Dados pessoais comuns | art. 7º, III — execução de políticas públicas; ou art. 7º, IV — estudo por órgão de pesquisa |
| Dados sensíveis (sindicato, saúde) | art. 11, II, "b" — execução de políticas públicas; ou art. 11, II, "c" — estudo por órgão de pesquisa |
| Crianças e adolescentes | art. 14 — melhor interesse |

A plataforma **não usa consentimento** como base legal: ele pode ser revogado a
qualquer momento, e a revogação obrigaria a apagar fichas e a refazer indicadores
já reportados. Isso não elimina o direito de informação: o entrevistado ouve um
aviso antes de começar e pode recusar a entrevista, qualquer pergunta ou as fotos.

**Ponto para o jurídico:** se nenhuma hipótese do art. 11 couber para a
filiação sindical (P54/P55), a alternativa é **retirar** a pergunta, e não pedir
consentimento.

### 1.5 Ciclo de vida do dado

```
Coleta (app, offline) → aparelho do técnico (com PIN) → envio ao servidor
→ validação pela coordenação → indicadores agregados (Matriz de Resultados)
→ 2 anos após a validação: nome, nomes dos moradores, GPS e fotos APAGADOS
→ ficha permanece sem identificação (respostas e indicadores)
```

---

## 2. O que pode dar errado para as pessoas

Escala: **P** = probabilidade, **I** = impacto (Baixo / Médio / Alto).

| # | Risco | Exemplo concreto | P | I |
|---|-------|------------------|---|---|
| R1 | Perda ou roubo do celular do técnico | fichas pendentes com nomes e respostas ficam acessíveis a quem pegar o aparelho | M | A |
| R2 | Vazamento por exportação | planilha com nomes e respostas circula por e-mail ou WhatsApp | M | A |
| R3 | Reidentificação por número agregado | numa comunidade de 3 famílias, "33% são sindicalizados" revela quem é | A | M |
| R4 | Exposição de filiação sindical | o dado sensível chega a quem não deveria e gera discriminação ou retaliação | B | A |
| R5 | Exposição de crianças | nome e idade de criança associados à localização da casa | B | A |
| R6 | Foto que identifica | foto da casa com pessoa ou placa, somada à comunidade, identifica a família | M | M |
| R7 | Constrangimento na entrevista | respostas sobre dinheiro e decisões familiares (bloco 9) dadas na frente de outros moradores | M | M |
| R8 | Acesso indevido interno | técnico ou consultor vê fichas de outras pessoas sem necessidade | B | M |
| R9 | Retenção além do necessário | nomes e localização guardados indefinidamente | A | M |
| R10 | Texto livre com dado de terceiro | resposta aberta cita nome ou doença de um vizinho | M | M |
| R11 | Transferência internacional | servidores dos operadores (Supabase, Vercel) fora do Brasil | A | B |
| R12 | Autodeclaração de conduta ilícita | resposta sobre caça ou madeira usada contra a família | B | M |

---

## 3. O que fizemos para evitar

| Risco | Medidas |
|-------|---------|
| R1 | App com PIN próprio; fichas enviadas saem do aparelho em 7 dias; sessão expira; nome e fotos são opcionais |
| R2 | Exportação com identificação só para coordenação e super_admin; exportação padrão sai **sem nome, sem GPS e sem fotos** |
| R3 | Números por comunidade só aparecem com **5 fichas ou mais**; abaixo disso, o número é suprimido ou agregado ao município. Sublocalidade (bairro, ramal) não entra em indicador |
| R4 | Dado sensível nunca aparece em agregado de célula pequena nem em sugestão com autor; acesso nominal, com prazo e registrado |
| R5 | Nome do morador **opcional** (aceita só iniciais); fica em tabela separada, fora de indicadores, sugestões e exportação padrão; apagado em 2 anos |
| R6 | Regra "nunca pessoas" no treinamento e na tela da câmera; coordenação apaga foto com pessoa na validação; localização embutida na foto é removida; fotos em repositório privado; apagadas em 2 anos |
| R7 | Bloco 9 aplicado **em privado** (lembrete no app); botão "Não respondeu" em toda pergunta |
| R8 | Técnico vê só as próprias fichas; consultor externo vê fichas **sem nome, sem localização e sem fotos**; acesso concedido com prazo pelo super_admin; trilha de auditoria |
| R9 | **Prazo de 2 anos** após a validação para nome, nomes de moradores, GPS e fotos; apagamento automático |
| R10 | P25 (saúde) em lista fechada; orientação "sem citar nomes" nos campos abertos; revisão na validação; textos abertos não saem em agregados |
| R11 | **[A DEFINIR]** — cláusulas contratuais/avaliação do art. 33 (pendência geral do DIMA) |
| R12 | Resposta nunca sai identificada; agregados com supressão |

Medidas gerais:
- aviso lido ao entrevistado antes de começar (quem coleta, para quê, o que é
  opcional, a quem procurar); a recusa é registrada sem coletar dados pessoais;
- cada ficha guarda qual versão do aviso e do questionário foi usada;
- registro do tratamento no ROPA dentro do próprio sistema;
- contrato do consultor externo com termo de confidencialidade e LGPD;
- dados em trânsito criptografados (HTTPS); regras de acesso no banco (RLS),
  não só na tela.

---

## 4. Risco residual e conclusão

| Risco | Residual após medidas |
|-------|----------------------|
| R1 | Médio: o aparelho não é criptografado pelo app (decisão da v1); depende do PIN e do bloqueio de tela do celular |
| R2 | Baixo |
| R3 | Baixo |
| R4 | Médio: depende da base legal (§1.4) |
| R5 | Baixo/Médio: o nome da criança é coletado quando a família informa |
| R6 | Baixo/Médio: depende do cumprimento da regra pelo técnico |
| R7 | Baixo |
| R8 | Baixo |
| R9 | Baixo |
| R10 | Baixo/Médio |
| R11 | **[A DEFINIR]** |
| R12 | Baixo |

**Conclusão:** **[A DEFINIR pela SEMA]** — por exemplo: "O tratamento é
considerado adequado e proporcional à finalidade, condicionado à definição da
base legal (§1.4) e ao treinamento dos técnicos antes do campo."

---

## 5. Pontos para a reunião com a equipe

1. **Base legal** (§1.4), especialmente para a pergunta sobre sindicato.
2. **Nome dos moradores:** manter ou orientar os técnicos a usar só iniciais?
   Hoje é opcional; o risco R5 cai se o padrão for iniciais.
3. **Celular do técnico** (R1): aceitar o risco residual ou exigir bloqueio de
   tela / criptografia do aparelho como condição para usar o app?
4. **Encarregado (DPO):** ✅ Luciana Rôla, contato só por e-mail *(26/09)*. Pendências:
   - **ato formal de designação** (portaria da SEMA; LGPD art. 41);
   - **conflito de interesse**: ela é responsável pela atividade que aplica o
     questionário e tem perfil super_admin. A regulamentação da ANPD pede que
     isso seja avaliado e registrado. Se mantido, considerar um substituto para
     pedidos ligados às atividades dela;
   - **só e-mail** é pouco acessível para comunidades com pouca internet.
     Mitigação: o técnico anota o pedido feito em campo e o encaminha ao e-mail.
5. **Transferência internacional** (R11): tratamento conjunto com o restante do DIMA.
6. **Treinamento:** conteúdo mínimo (aviso, fotos sem pessoas, bloco 9 em
   privado, campos abertos sem nomes, cuidado com o aparelho).
7. **Quem assina** o RIPD e quando ele é revisado (sugestão: antes do campo e a
   cada nova versão do questionário).
