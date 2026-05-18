// ── DIMA · Sistema de Ajuda Multilíngue ──────────────────────
// Conteúdo isolado em AJUDA — pronto para migração futura para banco de dados

const AJUDA = {
  dashboard: {
    pt: {
      titulo: 'Visão Geral',
      intro: 'O Dashboard é a tela principal do DIMA. Aqui você encontra um resumo financeiro e operacional do projeto, alertas automáticos e indicadores de acompanhamento em tempo real.',
      secoes: [
        { titulo: 'Indicadores Financeiros', itens: [
          'Orçamento Total: valor total aprovado pela UNESCO para o projeto.',
          'Total Executado: soma dos pagamentos com situação "Pago".',
          'A Pagar: compromissos lançados ainda não liquidados.',
          'Contratos Ativos: número de contratos com status "Vigente".',
        ]},
        { titulo: 'Indicadores de Risco e Acompanhamento', itens: [
          'TDRs em Andamento: contratos vigentes sem TDR aprovado vinculado.',
          'Cotação USD: taxa de câmbio do dia usada nas conversões.',
          'Indicadores em risco: atividades com orçamento comprometido acima de 90%.',
        ]},
        { titulo: 'Alertas Automáticos', itens: [
          'Contratos próximos ao vencimento (dentro de 30 dias).',
          'Produtos aguardando avaliação do responsável técnico.',
          'TDRs pendentes de aprovação ou com retorno da UNESCO.',
          'Viagens solicitadas aguardando aprovação da coordenação.',
        ]},
      ]
    },
    en: {
      titulo: 'Overview',
      intro: 'The Dashboard is the main screen of DIMA. Here you find a financial and operational summary of the project, automatic alerts, and real-time monitoring indicators.',
      secoes: [
        { titulo: 'Financial Indicators', itens: [
          'Total Budget: total amount approved by UNESCO for the project.',
          'Total Executed: sum of payments with "Paid" status.',
          'Pending Payment: commitments recorded but not yet settled.',
          'Active Contracts: number of contracts with "Active" status.',
        ]},
        { titulo: 'Risk and Monitoring Indicators', itens: [
          'TORs in Progress: active contracts without an approved TOR linked.',
          'USD Rate: current exchange rate used for conversions.',
          'Indicators at risk: activities with budget committed above 90%.',
        ]},
        { titulo: 'Automatic Alerts', itens: [
          'Contracts approaching expiration (within 30 days).',
          'Products awaiting technical evaluation.',
          'TORs pending approval or with UNESCO feedback.',
          'Travel requests awaiting coordination approval.',
        ]},
      ]
    },
    es: {
      titulo: 'Resumen General',
      intro: 'El Dashboard es la pantalla principal de DIMA. Aquí encontrará un resumen financiero y operativo del proyecto, alertas automáticas e indicadores de seguimiento en tiempo real.',
      secoes: [
        { titulo: 'Indicadores Financieros', itens: [
          'Presupuesto Total: monto total aprobado por la UNESCO para el proyecto.',
          'Total Ejecutado: suma de pagos con situación "Pagado".',
          'Por Pagar: compromisos registrados aún no liquidados.',
          'Contratos Activos: número de contratos con estado "Vigente".',
        ]},
        { titulo: 'Indicadores de Riesgo y Seguimiento', itens: [
          'TDRs en Curso: contratos vigentes sin TDR aprobado vinculado.',
          'Cotización USD: tipo de cambio del día usado en conversiones.',
          'Indicadores en riesgo: actividades con presupuesto comprometido por encima del 90%.',
        ]},
        { titulo: 'Alertas Automáticas', itens: [
          'Contratos próximos al vencimiento (dentro de 30 días).',
          'Productos pendientes de evaluación técnica.',
          'TDRs pendientes de aprobación o con retorno de la UNESCO.',
          'Viajes solicitados pendientes de aprobación de coordinación.',
        ]},
      ]
    },
  },

  atividades: {
    pt: {
      titulo: 'Atividades',
      intro: 'Atividades são as unidades de trabalho do projeto. Cada atividade tem orçamento próprio em USD, responsável designado e fase de execução. Todos os contratos, TDRs e lançamentos financeiros devem estar vinculados a uma atividade.',
      secoes: [
        { titulo: 'Fases de uma Atividade', itens: [
          'A Iniciar: atividade planejada, ainda não iniciada.',
          'Elaboração: em processo de preparação do TDR ou documentação.',
          'Licitação: em processo de seleção e contratação.',
          'Elaborado: produto ou documento principal foi elaborado.',
          'Contratado: contrato assinado e em execução.',
          'Concluído: todos os produtos entregues e pagamentos realizados.',
        ]},
        { titulo: 'Orçamento', itens: [
          'Cada atividade tem um orçamento aprovado em USD pela UNESCO.',
          'O sistema calcula automaticamente o saldo disponível descontando os contratos vinculados.',
          'Atividades com orçamento comprometido acima de 90% aparecem como alerta no Dashboard.',
        ]},
        { titulo: 'Responsável', itens: [
          'Usuário interno designado para acompanhar a execução da atividade.',
          'O responsável recebe notificações sobre produtos e TDRs relacionados.',
        ]},
      ]
    },
    en: {
      titulo: 'Activities',
      intro: 'Activities are the project\'s work units. Each activity has its own USD budget, assigned responsible person, and execution phase. All contracts, TORs, and financial entries must be linked to an activity.',
      secoes: [
        { titulo: 'Activity Phases', itens: [
          'To Start: planned activity, not yet initiated.',
          'Drafting: TOR or documentation being prepared.',
          'Procurement: selection and contracting in progress.',
          'Drafted: main product or document has been drafted.',
          'Contracted: contract signed and in execution.',
          'Completed: all products delivered and payments made.',
        ]},
        { titulo: 'Budget', itens: [
          'Each activity has a UNESCO-approved budget in USD.',
          'The system automatically calculates the available balance by deducting linked contracts.',
          'Activities with budget committed above 90% appear as alerts on the Dashboard.',
        ]},
        { titulo: 'Responsible Person', itens: [
          'Internal user assigned to oversee activity execution.',
          'The responsible person receives notifications about related products and TORs.',
        ]},
      ]
    },
    es: {
      titulo: 'Actividades',
      intro: 'Las actividades son las unidades de trabajo del proyecto. Cada actividad tiene su propio presupuesto en USD, responsable asignado y fase de ejecución. Todos los contratos, TDRs y registros financieros deben estar vinculados a una actividad.',
      secoes: [
        { titulo: 'Fases de una Actividad', itens: [
          'Por Iniciar: actividad planificada, aún no iniciada.',
          'Elaboración: TDR o documentación en preparación.',
          'Licitación: proceso de selección y contratación en curso.',
          'Elaborado: producto o documento principal elaborado.',
          'Contratado: contrato firmado y en ejecución.',
          'Concluido: todos los productos entregados y pagos realizados.',
        ]},
        { titulo: 'Presupuesto', itens: [
          'Cada actividad tiene un presupuesto aprobado en USD por la UNESCO.',
          'El sistema calcula automáticamente el saldo disponible descontando los contratos vinculados.',
          'Actividades con presupuesto comprometido por encima del 90% aparecen como alerta en el Dashboard.',
        ]},
        { titulo: 'Responsable', itens: [
          'Usuario interno asignado para acompañar la ejecución de la actividad.',
          'El responsable recibe notificaciones sobre productos y TDRs relacionados.',
        ]},
      ]
    },
  },

  tdrs: {
    pt: {
      titulo: 'TDRs',
      intro: 'O TDR (Termo de Referência) é o documento que define o escopo, perfil profissional e condições de contratação de um consultor (PF) ou empresa (PJ). Todo contrato deve ter um TDR aprovado associado.',
      secoes: [
        { titulo: 'Fluxo de Status', itens: [
          'Rascunho: documento em preparação interna.',
          'Revisão Interna: aguardando análise da coordenação.',
          'Ajustes: devolvido para correção.',
          'Enviado UNESCO: submetido para análise da UNESCO.',
          'Retorno UNESCO: recebeu comentários e precisa de revisão.',
          'Aprovado: autorizado para contratação. Único status que habilita vínculo com contrato.',
          'Cancelado: TDR descartado.',
        ]},
        { titulo: 'Tipo: PF ou PJ', itens: [
          'PF (Pessoa Física): para contratação de consultores individuais via CPF.',
          'PJ (Pessoa Jurídica): para contratação de empresas via CNPJ.',
          'O tipo define os campos obrigatórios do cadastro do fornecedor vinculado.',
        ]},
        { titulo: 'Arquivo e Submissão', itens: [
          'O TDR deve ser enviado em formato PDF.',
          'Após o upload, o status avança automaticamente para "Enviado UNESCO".',
          'Use a análise IA disponível na tela para verificar conformidade antes do envio.',
          'O histórico de versões fica registrado para rastreabilidade.',
        ]},
      ]
    },
    en: {
      titulo: 'TORs',
      intro: 'A TOR (Terms of Reference) is the document defining the scope, professional profile, and contracting conditions for a consultant (individual) or company (legal entity). Every contract must have an approved TOR associated.',
      secoes: [
        { titulo: 'Status Flow', itens: [
          'Draft: document being prepared internally.',
          'Internal Review: awaiting coordination analysis.',
          'Adjustments: returned for correction.',
          'Sent to UNESCO: submitted for UNESCO review.',
          'UNESCO Feedback: received comments, revision needed.',
          'Approved: authorized for contracting. The only status that enables contract linking.',
          'Cancelled: TOR discarded.',
        ]},
        { titulo: 'Type: Individual or Legal Entity', itens: [
          'Individual (PF): for hiring individual consultants.',
          'Legal Entity (PJ): for hiring companies.',
          'The type determines required fields in the linked supplier registration.',
        ]},
        { titulo: 'File and Submission', itens: [
          'The TOR must be submitted in PDF format.',
          'After upload, status automatically advances to "Sent to UNESCO".',
          'Use the AI analysis available on the screen to verify compliance before submission.',
          'Version history is recorded for traceability.',
        ]},
      ]
    },
    es: {
      titulo: 'TDRs',
      intro: 'El TDR (Términos de Referencia) es el documento que define el alcance, perfil profesional y condiciones de contratación de un consultor (PF) o empresa (PJ). Todo contrato debe tener un TDR aprobado asociado.',
      secoes: [
        { titulo: 'Flujo de Estado', itens: [
          'Borrador: documento en preparación interna.',
          'Revisión Interna: pendiente de análisis de coordinación.',
          'Ajustes: devuelto para corrección.',
          'Enviado UNESCO: enviado para revisión de la UNESCO.',
          'Retorno UNESCO: recibió comentarios, necesita revisión.',
          'Aprobado: autorizado para contratación. Único estado que habilita el vínculo con contrato.',
          'Cancelado: TDR descartado.',
        ]},
        { titulo: 'Tipo: PF o PJ', itens: [
          'PF (Persona Física): para contratar consultores individuales.',
          'PJ (Persona Jurídica): para contratar empresas.',
          'El tipo determina los campos obligatorios en el registro del proveedor vinculado.',
        ]},
        { titulo: 'Archivo y Envío', itens: [
          'El TDR debe enviarse en formato PDF.',
          'Tras la carga, el estado avanza automáticamente a "Enviado UNESCO".',
          'Use el análisis IA disponible en la pantalla para verificar conformidad antes del envío.',
          'El historial de versiones queda registrado para trazabilidad.',
        ]},
      ]
    },
  },

  contratos: {
    pt: {
      titulo: 'Contratos',
      intro: 'Contratos registram os acordos firmados com fornecedores para prestação de serviços ou entrega de produtos. Cada contrato pode estar vinculado a um TDR aprovado e a uma atividade do projeto.',
      secoes: [
        { titulo: 'Criação de Contrato', itens: [
          'Número do contrato, fornecedor e valor total (BRL) são obrigatórios.',
          'Defina a data de início e fim para controlar a vigência.',
          'Vincule a uma atividade para rastrear o orçamento.',
          'Vincule a um TDR aprovado para conformidade documental.',
        ]},
        { titulo: 'Status do Contrato', itens: [
          'Vigente: contrato ativo e em execução.',
          'Encerrado: contrato finalizado normalmente após cumprimento.',
          'Suspenso: contrato temporariamente paralisado.',
        ]},
        { titulo: 'Produtos do Contrato', itens: [
          'Cada contrato pode ter múltiplos produtos/entregas definidos.',
          'Cada produto tem descrição, valor e prazo de entrega.',
          'O percentual aprovado e o valor aprovado são calculados após avaliação.',
        ]},
        { titulo: 'Saldo e Execução Financeira', itens: [
          'Valor Total: montante contratado.',
          'Valor Utilizado: soma dos lançamentos financeiros vinculados a este contrato.',
          'Valor Comprometido: valor reservado mas ainda não executado.',
          'Saldo: diferença entre valor total e utilizado.',
        ]},
      ]
    },
    en: {
      titulo: 'Contracts',
      intro: 'Contracts record agreements signed with suppliers for service delivery or product delivery. Each contract can be linked to an approved TOR and a project activity.',
      secoes: [
        { titulo: 'Creating a Contract', itens: [
          'Contract number, supplier, and total value (BRL) are required.',
          'Set start and end dates to control validity.',
          'Link to an activity to track budget.',
          'Link to an approved TOR for documentary compliance.',
        ]},
        { titulo: 'Contract Status', itens: [
          'Active: contract in execution.',
          'Closed: contract finalized after fulfillment.',
          'Suspended: contract temporarily halted.',
        ]},
        { titulo: 'Contract Products', itens: [
          'Each contract can have multiple defined products/deliverables.',
          'Each product has a description, value, and delivery deadline.',
          'Approved percentage and approved value are calculated after evaluation.',
        ]},
        { titulo: 'Balance and Financial Execution', itens: [
          'Total Value: contracted amount.',
          'Used Value: sum of financial entries linked to this contract.',
          'Committed Value: amount reserved but not yet executed.',
          'Balance: difference between total and used value.',
        ]},
      ]
    },
    es: {
      titulo: 'Contratos',
      intro: 'Los contratos registran los acuerdos firmados con proveedores para la prestación de servicios o entrega de productos. Cada contrato puede estar vinculado a un TDR aprobado y a una actividad del proyecto.',
      secoes: [
        { titulo: 'Creación de Contrato', itens: [
          'Número de contrato, proveedor y valor total (BRL) son obligatorios.',
          'Defina fecha de inicio y fin para controlar la vigencia.',
          'Vincule a una actividad para rastrear el presupuesto.',
          'Vincule a un TDR aprobado para conformidad documental.',
        ]},
        { titulo: 'Estado del Contrato', itens: [
          'Vigente: contrato activo en ejecución.',
          'Cerrado: contrato finalizado tras cumplimiento.',
          'Suspendido: contrato temporalmente paralizado.',
        ]},
        { titulo: 'Productos del Contrato', itens: [
          'Cada contrato puede tener múltiples productos/entregables definidos.',
          'Cada producto tiene descripción, valor y plazo de entrega.',
          'El porcentaje aprobado y el valor aprobado se calculan tras la evaluación.',
        ]},
        { titulo: 'Saldo y Ejecución Financiera', itens: [
          'Valor Total: monto contratado.',
          'Valor Utilizado: suma de registros financieros vinculados a este contrato.',
          'Valor Comprometido: monto reservado pero aún no ejecutado.',
          'Saldo: diferencia entre valor total y utilizado.',
        ]},
      ]
    },
  },

  fornecedores: {
    pt: {
      titulo: 'Fornecedores',
      intro: 'Fornecedores são as pessoas físicas ou jurídicas contratadas pelo projeto. O cadastro deve ser feito antes de criar contratos ou TDRs vinculados.',
      secoes: [
        { titulo: 'Cadastro de Fornecedor', itens: [
          'Nome completo (PF) ou Razão Social (PJ) — campo "Nome" no sistema.',
          'CPF (PF) ou CNPJ (PJ) — campo "CPF/CNPJ".',
          'Tipo: PF (Pessoa Física) ou PJ (Pessoa Jurídica).',
          'O código interno é gerado automaticamente pelo sistema.',
        ]},
        { titulo: 'Ativação e Desativação', itens: [
          'Fornecedores inativos não aparecem nas listas de seleção de novos contratos.',
          'Desativar um fornecedor não exclui o histórico de contratos anteriores.',
          'Para reativar, edite o cadastro e marque como ativo.',
        ]},
        { titulo: 'Boas Práticas', itens: [
          'Verifique duplicatas antes de cadastrar: busque pelo CPF/CNPJ.',
          'Mantenha os dados cadastrais atualizados para emissão de documentos.',
        ]},
      ]
    },
    en: {
      titulo: 'Suppliers',
      intro: 'Suppliers are the individuals or companies contracted by the project. Registration must be done before creating linked contracts or TORs.',
      secoes: [
        { titulo: 'Supplier Registration', itens: [
          'Full name (individual) or Company name (legal entity) — "Name" field in the system.',
          'CPF (individual) or CNPJ (legal entity) — "CPF/CNPJ" field.',
          'Type: Individual (PF) or Legal Entity (PJ).',
          'The internal code is automatically generated by the system.',
        ]},
        { titulo: 'Activation and Deactivation', itens: [
          'Inactive suppliers do not appear in selection lists for new contracts.',
          'Deactivating a supplier does not delete the history of previous contracts.',
          'To reactivate, edit the registration and mark as active.',
        ]},
        { titulo: 'Best Practices', itens: [
          'Check for duplicates before registering: search by CPF/CNPJ.',
          'Keep registration data up to date for document issuance.',
        ]},
      ]
    },
    es: {
      titulo: 'Proveedores',
      intro: 'Los proveedores son las personas físicas o jurídicas contratadas por el proyecto. El registro debe hacerse antes de crear contratos o TDRs vinculados.',
      secoes: [
        { titulo: 'Registro de Proveedor', itens: [
          'Nombre completo (PF) o Razón Social (PJ) — campo "Nombre" en el sistema.',
          'CPF (PF) o CNPJ (PJ) — campo "CPF/CNPJ".',
          'Tipo: Persona Física (PF) o Persona Jurídica (PJ).',
          'El código interno es generado automáticamente por el sistema.',
        ]},
        { titulo: 'Activación y Desactivación', itens: [
          'Los proveedores inactivos no aparecen en las listas de selección de nuevos contratos.',
          'Desactivar un proveedor no elimina el historial de contratos anteriores.',
          'Para reactivar, edite el registro y marque como activo.',
        ]},
        { titulo: 'Buenas Prácticas', itens: [
          'Verifique duplicados antes de registrar: busque por CPF/CNPJ.',
          'Mantenga los datos de registro actualizados para emisión de documentos.',
        ]},
      ]
    },
  },

  financeiro: {
    pt: {
      titulo: 'Financeiro',
      intro: 'O módulo Financeiro registra todos os lançamentos de pagamentos do projeto. Cada lançamento está vinculado a uma atividade e, opcionalmente, a um contrato e fornecedor específicos.',
      secoes: [
        { titulo: 'Criação de Lançamento', itens: [
          'Atividade é obrigatória para rastrear o orçamento.',
          'Valor em BRL é obrigatório; o valor em USD é convertido automaticamente.',
          'O número da nota fiscal (NF) deve ser preenchido para rastreabilidade.',
          'Data de vencimento: quando o pagamento deve ser efetuado.',
          'Data de pagamento: quando o pagamento foi confirmado.',
        ]},
        { titulo: 'Situação do Lançamento', itens: [
          'Pago: pagamento confirmado. Exige comprovante anexado.',
          'A Pagar: compromisso registrado, aguardando liquidação.',
          'Cancelado: lançamento anulado — não entra nos totais do Dashboard.',
        ]},
        { titulo: 'Comprovantes', itens: [
          'Anexe o comprovante em PDF, JPG ou PNG.',
          'O comprovante é obrigatório para marcar um lançamento como "Pago".',
          'Arquivos são armazenados de forma segura no Supabase Storage.',
        ]},
      ]
    },
    en: {
      titulo: 'Financial',
      intro: 'The Financial module records all project payment entries. Each entry is linked to an activity and optionally to a specific contract and supplier.',
      secoes: [
        { titulo: 'Creating an Entry', itens: [
          'Activity is required to track the budget.',
          'Value in BRL is required; USD value is automatically converted.',
          'Invoice number (NF) must be filled in for traceability.',
          'Due date: when the payment should be made.',
          'Payment date: when the payment was confirmed.',
        ]},
        { titulo: 'Entry Status', itens: [
          'Paid: confirmed payment. Requires attached proof.',
          'Pending: recorded commitment, awaiting settlement.',
          'Cancelled: entry voided — not included in Dashboard totals.',
        ]},
        { titulo: 'Proof of Payment', itens: [
          'Attach proof in PDF, JPG, or PNG.',
          'Proof is required to mark an entry as "Paid".',
          'Files are stored securely in Supabase Storage.',
        ]},
      ]
    },
    es: {
      titulo: 'Financiero',
      intro: 'El módulo Financiero registra todos los pagos del proyecto. Cada registro está vinculado a una actividad y, opcionalmente, a un contrato y proveedor específicos.',
      secoes: [
        { titulo: 'Creación de Registro', itens: [
          'La actividad es obligatoria para rastrear el presupuesto.',
          'El valor en BRL es obligatorio; el valor en USD se convierte automáticamente.',
          'El número de factura (NF) debe completarse para trazabilidad.',
          'Fecha de vencimiento: cuándo debe efectuarse el pago.',
          'Fecha de pago: cuándo se confirmó el pago.',
        ]},
        { titulo: 'Situación del Registro', itens: [
          'Pagado: pago confirmado. Requiere comprobante adjunto.',
          'Por Pagar: compromiso registrado, pendiente de liquidación.',
          'Cancelado: registro anulado — no se incluye en los totales del Dashboard.',
        ]},
        { titulo: 'Comprobantes', itens: [
          'Adjunte el comprobante en PDF, JPG o PNG.',
          'El comprobante es obligatorio para marcar un registro como "Pagado".',
          'Los archivos se almacenan de forma segura en Supabase Storage.',
        ]},
      ]
    },
  },

  produtos: {
    pt: {
      titulo: 'Produtos Entregues',
      intro: 'O módulo de Produtos registra as entregas realizadas pelos consultores e empresas contratadas. Cada produto está vinculado a um contrato e passa por um fluxo de aprovação em etapas.',
      secoes: [
        { titulo: 'Entregas por Contrato', itens: [
          'Cada produto está vinculado a um contrato específico.',
          'O produto tem número sequencial, descrição, valor e prazo.',
          'O consultor envia o arquivo pelo link de prestação pública (sem necessidade de login).',
        ]},
        { titulo: 'Fluxo de Aprovação', itens: [
          'Submetido: arquivo enviado pelo consultor, aguardando avaliação.',
          'Em Revisão: técnico responsável está analisando o produto.',
          'Aprovado Técnico: aprovado pelo perfil Técnico/Focal.',
          'Aprovado Coordenação: aprovado pela Coordenação.',
          'Aprovado Diretoria: aprovação final concedida.',
          'Recusado: produto rejeitado com justificativa.',
        ]},
        { titulo: 'Upload e Arquivos', itens: [
          'O consultor acessa o link de prestação pública recebido por e-mail.',
          'O arquivo deve ser enviado em PDF.',
          'Após o envio, o produto fica disponível para avaliação interna.',
          'Avaliadores podem adicionar nota técnica e percentual de aprovação.',
        ]},
      ]
    },
    en: {
      titulo: 'Delivered Products',
      intro: 'The Products module records deliverables submitted by contractors and consultants. Each product is linked to a contract and goes through a multi-stage approval flow.',
      secoes: [
        { titulo: 'Deliverables per Contract', itens: [
          'Each product is linked to a specific contract.',
          'The product has a sequential number, description, value, and deadline.',
          'The consultant submits the file via the public submission link (no login required).',
        ]},
        { titulo: 'Approval Flow', itens: [
          'Submitted: file sent by consultant, awaiting evaluation.',
          'Under Review: technical officer is analyzing the product.',
          'Technical Approval: approved by the Technical/Focal profile.',
          'Coordination Approval: approved by Coordination.',
          'Director Approval: final approval granted.',
          'Rejected: product rejected with justification.',
        ]},
        { titulo: 'Upload and Files', itens: [
          'The consultant accesses the public submission link received by email.',
          'The file must be submitted in PDF format.',
          'After submission, the product is available for internal evaluation.',
          'Evaluators can add a technical note and approval percentage.',
        ]},
      ]
    },
    es: {
      titulo: 'Productos Entregados',
      intro: 'El módulo de Productos registra los entregables enviados por consultores y empresas contratadas. Cada producto está vinculado a un contrato y pasa por un flujo de aprobación por etapas.',
      secoes: [
        { titulo: 'Entregables por Contrato', itens: [
          'Cada producto está vinculado a un contrato específico.',
          'El producto tiene número secuencial, descripción, valor y plazo.',
          'El consultor envía el archivo por el enlace de presentación pública (sin necesidad de inicio de sesión).',
        ]},
        { titulo: 'Flujo de Aprobación', itens: [
          'Enviado: archivo enviado por el consultor, pendiente de evaluación.',
          'En Revisión: el técnico responsable está analizando el producto.',
          'Aprobado Técnico: aprobado por el perfil Técnico/Focal.',
          'Aprobado Coordinación: aprobado por la Coordinación.',
          'Aprobado Dirección: aprobación final concedida.',
          'Rechazado: producto rechazado con justificación.',
        ]},
        { titulo: 'Carga y Archivos', itens: [
          'El consultor accede al enlace de presentación pública recibido por correo.',
          'El archivo debe enviarse en formato PDF.',
          'Tras el envío, el producto queda disponible para evaluación interna.',
          'Los evaluadores pueden agregar nota técnica y porcentaje de aprobación.',
        ]},
      ]
    },
  },

  viagens: {
    pt: {
      titulo: 'Viagens',
      intro: 'O módulo de Viagens gerencia os protocolos de deslocamento de consultores e servidores vinculados ao projeto. Cada viagem requer aprovação da coordenação antes da realização.',
      secoes: [
        { titulo: 'Criação de Protocolo', itens: [
          'Informe o objetivo da viagem (campo obrigatório).',
          'Destino principal: cidade ou local de destino.',
          'Data de saída e data de retorno.',
          'Vincule a uma atividade do projeto para rastreabilidade.',
        ]},
        { titulo: 'Situações da Viagem', itens: [
          'Solicitado: protocolo criado, aguardando aprovação.',
          'Aprovado: coordenação autorizou a realização.',
          'Rejeitado: coordenação não autorizou, com justificativa.',
          'Concluído: viagem realizada e prestação de contas enviada.',
          'Cancelado: viagem cancelada antes da realização.',
        ]},
        { titulo: 'Aprovação e Notificações', itens: [
          'Coordenação e Super Admin podem aprovar ou rejeitar.',
          'Ao aprovar, um e-mail automático é enviado ao solicitante.',
          'Após a viagem, o consultor envia a prestação de contas pelo link público.',
        ]},
      ]
    },
    en: {
      titulo: 'Travel',
      intro: 'The Travel module manages travel protocols for consultants and staff linked to the project. Each trip requires coordination approval before it takes place.',
      secoes: [
        { titulo: 'Creating a Protocol', itens: [
          'Enter the travel objective (required field).',
          'Main destination: target city or location.',
          'Departure date and return date.',
          'Link to a project activity for traceability.',
        ]},
        { titulo: 'Travel Status', itens: [
          'Requested: protocol created, awaiting approval.',
          'Approved: coordination authorized the trip.',
          'Rejected: coordination did not authorize, with justification.',
          'Completed: trip completed and expense report submitted.',
          'Cancelled: trip cancelled before taking place.',
        ]},
        { titulo: 'Approval and Notifications', itens: [
          'Coordination and Super Admin can approve or reject.',
          'Upon approval, an automatic email is sent to the requestor.',
          'After the trip, the consultant submits the expense report via the public link.',
        ]},
      ]
    },
    es: {
      titulo: 'Viajes',
      intro: 'El módulo de Viajes gestiona los protocolos de desplazamiento de consultores y personal vinculado al proyecto. Cada viaje requiere aprobación de coordinación antes de realizarse.',
      secoes: [
        { titulo: 'Creación de Protocolo', itens: [
          'Indique el objetivo del viaje (campo obligatorio).',
          'Destino principal: ciudad o lugar de destino.',
          'Fecha de salida y fecha de retorno.',
          'Vincule a una actividad del proyecto para trazabilidad.',
        ]},
        { titulo: 'Situaciones del Viaje', itens: [
          'Solicitado: protocolo creado, pendiente de aprobación.',
          'Aprobado: coordinación autorizó la realización.',
          'Rechazado: coordinación no autorizó, con justificación.',
          'Concluido: viaje realizado y rendición de cuentas enviada.',
          'Cancelado: viaje cancelado antes de realizarse.',
        ]},
        { titulo: 'Aprobación y Notificaciones', itens: [
          'Coordinación y Super Admin pueden aprobar o rechazar.',
          'Al aprobar, se envía un correo automático al solicitante.',
          'Tras el viaje, el consultor envía la rendición de cuentas por el enlace público.',
        ]},
      ]
    },
  },

  auditoria: {
    pt: {
      titulo: 'Auditoria IA',
      intro: 'A Auditoria IA analisa automaticamente os dados do projeto em 6 domínios, identificando inconsistências, riscos de conformidade e pontos de melhoria. Os resultados ficam registrados para acompanhamento.',
      secoes: [
        { titulo: 'Domínios Auditados', itens: [
          'TDR-Contrato: verifica contratos vigentes sem TDR aprovado vinculado.',
          'Financeiro: verifica lançamentos sem comprovante, duplicatas ou valores atípicos.',
          'Produtos: verifica entregas pendentes de avaliação ou aprovação.',
          'Viagens: verifica protocolos sem prestação de contas após conclusão.',
          'Matriz: verifica contribuições à matriz de resultados com dados faltantes.',
          'Qualidade de Dados: verifica campos obrigatórios ausentes em qualquer módulo.',
        ]},
        { titulo: 'Níveis de Severidade', itens: [
          'Crítico: requer ação imediata. Risco direto de não conformidade.',
          'Alto: risco elevado. Deve ser tratado no curto prazo.',
          'Médio: atenção recomendada. Pode virar problema se não resolvido.',
          'Baixo: observação para melhoria contínua.',
          'Info: informação sem risco associado.',
        ]},
        { titulo: 'Achados e Acompanhamento', itens: [
          'Cada achado pode ser marcado como: Aberto, Em Análise, Resolvido ou Ignorado.',
          'Registre a justificativa ao marcar como "Ignorado".',
          'O chat interativo permite discutir achados específicos com o assistente IA.',
          'Novas execuções da auditoria atualizam os achados existentes.',
        ]},
      ]
    },
    en: {
      titulo: 'AI Audit',
      intro: 'The AI Audit automatically analyzes project data across 6 domains, identifying inconsistencies, compliance risks, and improvement points. Results are recorded for ongoing monitoring.',
      secoes: [
        { titulo: 'Audited Domains', itens: [
          'TOR-Contract: checks active contracts without a linked approved TOR.',
          'Financial: checks entries without proof of payment, duplicates, or unusual values.',
          'Products: checks deliverables pending evaluation or approval.',
          'Travel: checks protocols without expense reports after completion.',
          'Matrix: checks results matrix contributions with missing data.',
          'Data Quality: checks for missing required fields in any module.',
        ]},
        { titulo: 'Severity Levels', itens: [
          'Critical: immediate action required. Direct non-compliance risk.',
          'High: elevated risk. Should be addressed in the short term.',
          'Medium: attention recommended. May become an issue if unresolved.',
          'Low: observation for continuous improvement.',
          'Info: informational, no associated risk.',
        ]},
        { titulo: 'Findings and Follow-up', itens: [
          'Each finding can be marked as: Open, Under Analysis, Resolved, or Ignored.',
          'Record justification when marking as "Ignored".',
          'The interactive chat allows discussion of specific findings with the AI assistant.',
          'New audit runs update existing findings.',
        ]},
      ]
    },
    es: {
      titulo: 'Auditoría IA',
      intro: 'La Auditoría IA analiza automáticamente los datos del proyecto en 6 dominios, identificando inconsistencias, riesgos de conformidad y puntos de mejora. Los resultados quedan registrados para seguimiento.',
      secoes: [
        { titulo: 'Dominios Auditados', itens: [
          'TDR-Contrato: verifica contratos vigentes sin TDR aprobado vinculado.',
          'Financiero: verifica registros sin comprobante, duplicados o valores atípicos.',
          'Productos: verifica entregables pendientes de evaluación o aprobación.',
          'Viajes: verifica protocolos sin rendición de cuentas tras conclusión.',
          'Matriz: verifica contribuciones a la matriz de resultados con datos faltantes.',
          'Calidad de Datos: verifica campos obligatorios ausentes en cualquier módulo.',
        ]},
        { titulo: 'Niveles de Severidad', itens: [
          'Crítico: acción inmediata requerida. Riesgo directo de no conformidad.',
          'Alto: riesgo elevado. Debe tratarse a corto plazo.',
          'Medio: atención recomendada. Puede convertirse en problema si no se resuelve.',
          'Bajo: observación para mejora continua.',
          'Info: información sin riesgo asociado.',
        ]},
        { titulo: 'Hallazgos y Seguimiento', itens: [
          'Cada hallazgo puede marcarse como: Abierto, En Análisis, Resuelto o Ignorado.',
          'Registre la justificación al marcar como "Ignorado".',
          'El chat interactivo permite discutir hallazgos específicos con el asistente IA.',
          'Nuevas ejecuciones de auditoría actualizan los hallazgos existentes.',
        ]},
      ]
    },
  },

  glossario: {
    pt: {
      titulo: 'Glossário',
      intro: 'Definição dos principais termos, status e perfis utilizados na plataforma DIMA.',
      secoes: [
        { titulo: 'Termos do Projeto', itens: [
          'TDR — Termo de Referência: documento que define escopo, perfil e condições de contratação.',
          'Matriz de Resultados: framework que relaciona atividades a indicadores e metas do projeto.',
          'SEI — Sistema Eletrônico de Informações: sistema oficial do governo para protocolos administrativos.',
          'UNESCO: Organização das Nações Unidas para a Educação, a Ciência e a Cultura — organismo financiador.',
          'SEMA: Secretaria de Meio Ambiente do Estado do Acre — executora do projeto.',
          'Projeto 218BRA2001: código oficial do projeto junto à UNESCO.',
        ]},
        { titulo: 'Status e Fases', itens: [
          'Vigente (Contrato): contrato ativo e em execução.',
          'Encerrado (Contrato): contrato finalizado após cumprimento.',
          'Suspenso (Contrato): contrato temporariamente paralisado.',
          'Aprovado (TDR): único status que autoriza vinculação a contratos.',
          'Concluído (Atividade): todos os produtos entregues e pagamentos realizados.',
          'Pago (Financeiro): pagamento confirmado com comprovante.',
          'A Pagar (Financeiro): compromisso registrado, aguardando liquidação.',
        ]},
        { titulo: 'Perfis de Usuário', itens: [
          'Super Admin: acesso total — configurações, usuários e todos os módulos.',
          'Coordenação: acesso a todos os módulos operacionais exceto configurações de sistema.',
          'Técnico/Focal: acesso a atividades, TDRs, produtos e viagens.',
          'Financeiro: acesso a contratos, fornecedores e módulo financeiro.',
          'Consultor Externo: acesso limitado à visualização de dados.',
          'Visualizador: somente leitura em módulos autorizados.',
        ]},
      ]
    },
    en: {
      titulo: 'Glossary',
      intro: 'Definition of the main terms, statuses, and profiles used on the DIMA platform.',
      secoes: [
        { titulo: 'Project Terms', itens: [
          'TOR — Terms of Reference: document defining scope, profile, and contracting conditions.',
          'Results Matrix: framework linking activities to project indicators and targets.',
          'SEI — Electronic Information System: official government system for administrative protocols.',
          'UNESCO: United Nations Educational, Scientific and Cultural Organization — funding body.',
          'SEMA: Acre State Environmental Secretariat — project executor.',
          'Project 218BRA2001: official project code with UNESCO.',
        ]},
        { titulo: 'Statuses and Phases', itens: [
          'Active (Contract): contract in execution.',
          'Closed (Contract): contract finalized after fulfillment.',
          'Suspended (Contract): contract temporarily halted.',
          'Approved (TOR): the only status that authorizes linking to contracts.',
          'Completed (Activity): all products delivered and payments made.',
          'Paid (Financial): confirmed payment with proof attached.',
          'Pending (Financial): recorded commitment awaiting settlement.',
        ]},
        { titulo: 'User Profiles', itens: [
          'Super Admin: full access — settings, users, and all modules.',
          'Coordination: access to all operational modules except system settings.',
          'Technical/Focal: access to activities, TORs, products, and travel.',
          'Financial: access to contracts, suppliers, and financial module.',
          'External Consultant: limited read-only access to data.',
          'Viewer: read-only access to authorized modules.',
        ]},
      ]
    },
    es: {
      titulo: 'Glosario',
      intro: 'Definición de los principales términos, estados y perfiles utilizados en la plataforma DIMA.',
      secoes: [
        { titulo: 'Términos del Proyecto', itens: [
          'TDR — Términos de Referencia: documento que define alcance, perfil y condiciones de contratación.',
          'Matriz de Resultados: marco que relaciona actividades con indicadores y metas del proyecto.',
          'SEI — Sistema Electrónico de Información: sistema oficial del gobierno para protocolos administrativos.',
          'UNESCO: Organización de las Naciones Unidas para la Educación, la Ciencia y la Cultura — organismo financiador.',
          'SEMA: Secretaría de Medio Ambiente del Estado de Acre — ejecutora del proyecto.',
          'Proyecto 218BRA2001: código oficial del proyecto ante la UNESCO.',
        ]},
        { titulo: 'Estados y Fases', itens: [
          'Vigente (Contrato): contrato activo en ejecución.',
          'Cerrado (Contrato): contrato finalizado tras cumplimiento.',
          'Suspendido (Contrato): contrato temporalmente paralizado.',
          'Aprobado (TDR): único estado que autoriza el vínculo con contratos.',
          'Concluido (Actividad): todos los productos entregados y pagos realizados.',
          'Pagado (Financiero): pago confirmado con comprobante adjunto.',
          'Por Pagar (Financiero): compromiso registrado, pendiente de liquidación.',
        ]},
        { titulo: 'Perfiles de Usuario', itens: [
          'Super Admin: acceso total — configuraciones, usuarios y todos los módulos.',
          'Coordinación: acceso a todos los módulos operativos excepto configuración del sistema.',
          'Técnico/Focal: acceso a actividades, TDRs, productos y viajes.',
          'Financiero: acceso a contratos, proveedores y módulo financiero.',
          'Consultor Externo: acceso limitado de solo lectura a los datos.',
          'Visualizador: solo lectura en módulos autorizados.',
        ]},
      ]
    },
  },
};

// ── Lógica do Painel Flutuante ────────────────────────────────

const AJUDA_LABELS = {
  pt: { titulo: 'Ajuda', buscar: 'Buscar nesta página...', semResultado: 'Nenhum resultado para', verManual: 'Ver manual completo', fechar: 'Fechar' },
  en: { titulo: 'Help',  buscar: 'Search this page...', semResultado: 'No results for', verManual: 'View full manual', fechar: 'Close' },
  es: { titulo: 'Ayuda', buscar: 'Buscar en esta página...', semResultado: 'Sin resultados para', verManual: 'Ver manual completo', fechar: 'Cerrar' },
};

function _ajudaIdioma() {
  return localStorage.getItem('ajuda_idioma') || (typeof appState !== 'undefined' ? appState.idioma : 'pt') || 'pt';
}

function _norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function _injetarPainel() {
  if (document.getElementById('ajuda-painel-wrap')) return;

  const wrap = document.createElement('div');
  wrap.id = 'ajuda-painel-wrap';
  wrap.innerHTML = `
    <style>
      #ajuda-btn {
        position:fixed; bottom:24px; right:24px; z-index:1200;
        width:46px; height:46px; border-radius:50%;
        background:#009edb; border:none; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 4px 16px rgba(0,157,219,.45);
        transition:transform .15s, box-shadow .15s;
        font-size:20px; color:#fff; font-weight:700;
      }
      #ajuda-btn:hover { transform:scale(1.08); box-shadow:0 6px 20px rgba(0,157,219,.6); }
      #ajuda-painel {
        position:fixed; top:0; right:0; bottom:0; z-index:1199;
        width:360px; max-width:100vw;
        background:#fff; border-left:1px solid #e2e8f0;
        box-shadow:-4px 0 24px rgba(0,0,0,.12);
        display:flex; flex-direction:column;
        transform:translateX(100%); transition:transform .28s cubic-bezier(.4,0,.2,1);
        font-family:var(--font-sans, system-ui, sans-serif);
      }
      #ajuda-painel.aberto { transform:translateX(0); }
      #ajuda-painel-header {
        display:flex; align-items:center; gap:8px;
        padding:14px 16px; border-bottom:1px solid #e2e8f0;
        background:#f8fafc; flex-shrink:0;
      }
      #ajuda-painel-titulo { font-size:14px; font-weight:700; color:#1e293b; flex:1; }
      .ajuda-lang-btn {
        font-size:10px; font-weight:700; padding:2px 7px; border-radius:99px;
        border:1px solid #cbd5e1; background:#fff; cursor:pointer; color:#475569;
        transition:all .12s;
      }
      .ajuda-lang-btn.ativo { background:#009edb; color:#fff; border-color:#009edb; }
      #ajuda-fechar-btn {
        width:26px; height:26px; border-radius:50%; border:none;
        background:#f1f5f9; cursor:pointer; font-size:14px; color:#475569;
        display:flex; align-items:center; justify-content:center; flex-shrink:0;
        transition:background .12s;
      }
      #ajuda-fechar-btn:hover { background:#e2e8f0; }
      #ajuda-busca-wrap { padding:10px 14px; border-bottom:1px solid #e2e8f0; flex-shrink:0; }
      #ajuda-busca {
        width:100%; box-sizing:border-box; padding:7px 10px;
        border:1px solid #cbd5e1; border-radius:8px; font-size:12px;
        outline:none; color:#1e293b; font-family:inherit;
        transition:border .15s;
      }
      #ajuda-busca:focus { border-color:#009edb; }
      #ajuda-corpo { flex:1; overflow-y:auto; padding:14px; }
      #ajuda-intro { font-size:12px; color:#475569; line-height:1.6; margin-bottom:12px; }
      .ajuda-secao { margin-bottom:6px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
      .ajuda-secao-titulo {
        display:flex; align-items:center; justify-content:space-between;
        padding:9px 12px; cursor:pointer; background:#f8fafc;
        font-size:12px; font-weight:600; color:#334155;
        user-select:none; border:none; width:100%; text-align:left;
        font-family:inherit; transition:background .12s;
      }
      .ajuda-secao-titulo:hover { background:#f1f5f9; }
      .ajuda-secao-chevron { font-size:9px; color:#94a3b8; transition:transform .2s; }
      .ajuda-secao-chevron.aberto { transform:rotate(90deg); }
      .ajuda-secao-corpo { overflow:hidden; transition:max-height .22s ease; }
      .ajuda-secao-corpo ul { margin:0; padding:8px 12px 8px 24px; }
      .ajuda-secao-corpo li { font-size:11.5px; color:#475569; line-height:1.6; margin-bottom:3px; }
      .ajuda-secao-corpo li mark { background:#fef08a; color:#1e293b; border-radius:2px; padding:0 1px; }
      #ajuda-sem-resultado { display:none; padding:16px; text-align:center; font-size:12px; color:#94a3b8; }
      #ajuda-painel-footer {
        padding:12px 14px; border-top:1px solid #e2e8f0; flex-shrink:0; background:#f8fafc;
      }
      #ajuda-link-manual {
        display:flex; align-items:center; gap:6px; font-size:12px;
        color:#009edb; text-decoration:none; font-weight:600;
        transition:color .12s;
      }
      #ajuda-link-manual:hover { color:#0077aa; }
      @media (max-width:480px) { #ajuda-painel { width:100vw; } }
    </style>

    <button id="ajuda-btn" onclick="ajudaToggle()" title="Ajuda">?</button>

    <div id="ajuda-painel">
      <div id="ajuda-painel-header">
        <span id="ajuda-painel-titulo">Ajuda</span>
        <button class="ajuda-lang-btn" data-lang="pt" onclick="ajudaTrocarIdioma('pt')">PT</button>
        <button class="ajuda-lang-btn" data-lang="en" onclick="ajudaTrocarIdioma('en')">EN</button>
        <button class="ajuda-lang-btn" data-lang="es" onclick="ajudaTrocarIdioma('es')">ES</button>
        <button id="ajuda-fechar-btn" onclick="ajudaFechar()" title="Fechar">✕</button>
      </div>
      <div id="ajuda-busca-wrap">
        <input id="ajuda-busca" type="text" autocomplete="off" oninput="ajudaBuscar(this.value)">
      </div>
      <div id="ajuda-corpo">
        <p id="ajuda-intro"></p>
        <div id="ajuda-secoes"></div>
        <div id="ajuda-sem-resultado"></div>
      </div>
      <div id="ajuda-painel-footer">
        <a id="ajuda-link-manual" href="../pages/ajuda.html">📖 <span id="ajuda-link-txt">Ver manual completo</span> →</a>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  // Fechar ao clicar fora
  document.addEventListener('click', e => {
    const painel = document.getElementById('ajuda-painel');
    const btn = document.getElementById('ajuda-btn');
    if (painel?.classList.contains('aberto') && !painel.contains(e.target) && !btn.contains(e.target)) {
      ajudaFechar();
    }
  });

  ajudaRenderPainel();
}

function ajudaRenderPainel() {
  const lang = _ajudaIdioma();
  const navId = window.AJUDA_NAV_ID || 'dashboard';
  const modulo = AJUDA[navId]?.[lang] || AJUDA[navId]?.pt || AJUDA.dashboard.pt;
  const labels = AJUDA_LABELS[lang] || AJUDA_LABELS.pt;

  const titulo = document.getElementById('ajuda-painel-titulo');
  if (titulo) titulo.textContent = labels.titulo;

  const busca = document.getElementById('ajuda-busca');
  if (busca) { busca.placeholder = labels.buscar; busca.value = ''; }

  const linkTxt = document.getElementById('ajuda-link-txt');
  if (linkTxt) linkTxt.textContent = labels.verManual;

  // Link relativo correto dependendo de onde estamos
  const linkManual = document.getElementById('ajuda-link-manual');
  if (linkManual) {
    const path = window.location.pathname;
    linkManual.href = path.includes('/pages/') ? 'ajuda.html' : 'pages/ajuda.html';
  }

  // Lang buttons
  document.querySelectorAll('.ajuda-lang-btn').forEach(b => {
    b.classList.toggle('ativo', b.dataset.lang === lang);
  });

  const intro = document.getElementById('ajuda-intro');
  if (intro) intro.textContent = modulo.intro || '';

  _ajudaRenderSecoes(modulo.secoes || [], '');
}

function _ajudaRenderSecoes(secoes, termo) {
  const wrap = document.getElementById('ajuda-secoes');
  const semResultado = document.getElementById('ajuda-sem-resultado');
  const lang = _ajudaIdioma();
  const labels = AJUDA_LABELS[lang] || AJUDA_LABELS.pt;

  if (!wrap) return;

  const normTermo = _norm(termo);
  let totalVisiveis = 0;

  wrap.innerHTML = secoes.map((sec, si) => {
    const itensFiltrados = sec.itens.filter(item =>
      !normTermo || _norm(item).includes(normTermo)
    );
    if (!itensFiltrados.length && normTermo) return '';
    totalVisiveis += itensFiltrados.length;

    const aberto = si === 0 || normTermo;
    const itensHtml = itensFiltrados.map(item => {
      const txt = normTermo
        ? item.replace(new RegExp(`(${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>')
        : item;
      return `<li>${txt}</li>`;
    }).join('');

    return `
      <div class="ajuda-secao">
        <button class="ajuda-secao-titulo" onclick="ajudaToggleSecao(this)">
          ${sec.titulo}
          <span class="ajuda-secao-chevron ${aberto ? 'aberto' : ''}">▶</span>
        </button>
        <div class="ajuda-secao-corpo" style="max-height:${aberto ? '600px' : '0px'}">
          <ul>${itensHtml}</ul>
        </div>
      </div>`;
  }).join('');

  if (semResultado) {
    if (normTermo && totalVisiveis === 0) {
      semResultado.style.display = 'block';
      semResultado.textContent = `${labels.semResultado} "${termo}"`;
    } else {
      semResultado.style.display = 'none';
    }
  }
}

let _ajudaBuscaTimer;
function ajudaBuscar(termo) {
  clearTimeout(_ajudaBuscaTimer);
  _ajudaBuscaTimer = setTimeout(() => {
    const lang = _ajudaIdioma();
    const navId = window.AJUDA_NAV_ID || 'dashboard';
    const modulo = AJUDA[navId]?.[lang] || AJUDA[navId]?.pt || AJUDA.dashboard.pt;
    _ajudaRenderSecoes(modulo.secoes || [], termo);
  }, 200);
}

function ajudaToggleSecao(btn) {
  const corpo = btn.nextElementSibling;
  const chevron = btn.querySelector('.ajuda-secao-chevron');
  const aberto = corpo.style.maxHeight !== '0px';
  corpo.style.maxHeight = aberto ? '0px' : '600px';
  chevron.classList.toggle('aberto', !aberto);
}

let _ajudaAberto = false;
function ajudaToggle() {
  _ajudaAberto ? ajudaFechar() : ajudaAbrir();
}

function ajudaAbrir() {
  _ajudaAberto = true;
  document.getElementById('ajuda-painel')?.classList.add('aberto');
  ajudaRenderPainel();
}

function ajudaFechar() {
  _ajudaAberto = false;
  document.getElementById('ajuda-painel')?.classList.remove('aberto');
}

function ajudaTrocarIdioma(lang) {
  localStorage.setItem('ajuda_idioma', lang);
  ajudaRenderPainel();
}

// Inicializar após DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  _injetarPainel();
});
