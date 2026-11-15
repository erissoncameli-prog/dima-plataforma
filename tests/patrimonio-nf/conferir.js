// Teste do leitor de nota fiscal do Patrimônio (js/patrimonio-nf.js), sem navegador:
//   node tests/patrimonio-nf/conferir.js
// Usa uma nota FICTÍCIA nos dois formatos (DANFE remontado por posição e XML da NF-e).
// A conferência com a NF real 23.126 (13 linhas, R$ 20.714,50; 10 bens = R$ 20.301,00 e
// 3 de consumo = R$ 413,50) foi feita à parte, com o pdf.js 4.7.76 (o arquivo não fica no repositório).
'use strict'
require('../../js/patrimonio-nf.js')
const NF = globalThis.PatNF
let falhas = 0
const ok = (c, m) => { if (!c) { falhas++; console.error('FALHOU:', m) } }

// ── DANFE: pedaços de texto com x/y (como o pdf.js entrega) ──
const L = (y, ...cols) => cols.map(([x, s, w]) => ({ s, x, y, w: w || s.length * 4 }))
const pag = [
  ...L(40, [400, 'NF-e Nº 000.000.777'], [600, 'Série 001']),
  ...L(60, [20, 'Emissão: 05/11/2026 Valor Total: 3.330,00']),
  ...L(80, [380, 'CHAVE DE ACESSO']),
  ...L(90, [380, '1111 2222 3333 4444 5555 6666 7777 8888 9999 0000 1234']),
  ...L(110, [450, 'CNPJ / CPF']), ...L(118, [450, '12.345.678/0001-90']),
  ...L(140, [20, 'DESTINATÁRIO / REMETENTE']), ...L(148, [450, '03.736.617/0001-68']),
  ...L(170, [20, 'BASE DE CÁLCULO DO ICMS', 90], [600, 'VALOR TOTAL DOS PRODUTOS', 100]),
  ...L(180, [100, '0,00', 16], [680, '3.330,00', 20]),
  ...L(200, [20, 'DADOS DOS PRODUTOS / SERVIÇOS']),
  ...L(210, [20, 'CÓDIGO'], [140, 'VALOR VALOR VALOR']),
  ...L(218, [80, 'DESCRIÇÃO DO PRODUTO / SERVIÇO'], [300, 'NCM/SH'], [360, 'CST'], [390, 'CFOP'], [420, 'UNID.'], [450, 'QTDE.']),
  ...L(226, [20, 'PRODUTO'], [480, 'UNITÁRIO']),
  ...L(240, [20, '1001'], [80, 'NOTEBOOK LENOVO THINKPAD E14 S/N: PF4ABC12'], [300, '84713012'], [360, '0102'], [390, '6102'], [420, 'UN'], [450, '1,00'], [480, '3.000,00'], [520, '0,00'], [560, '3.000,00']),
  ...L(250, [20, '1002'], [80, 'CABO HDMI 2 METROS'], [300, '85444200'], [360, '0102'], [390, '6102'], [420, 'UN'], [450, '2,00'], [480, '15,00'], [520, '0,00'], [560, '30,00']),
  ...L(260, [20, '1003'], [80, 'CADEIRA FIXA'], [300, '94017100'], [360, '0102'], [390, '6102'], [420, 'UN'], [450, '2,00'], [480, '150,00'], [520, '0,00'], [560, '300,00']),
  ...L(268, [80, 'ESTOFADA AZUL']),
  ...L(290, [20, 'DADOS ADICIONAIS']),
]
const nf = NF.lerTextoDanfe([pag])
ok(nf.itens.length === 3, '3 linhas no DANFE (veio ' + nf.itens.length + ')')
ok(nf.chave === '11112222333344445555666677778888999900001234', 'chave de acesso')
ok(nf.numero === '777' && nf.serie === '001' && nf.emissao === '2026-11-05', 'número, série e emissão')
ok(nf.cnpj_emitente === '12345678000190', 'CNPJ do emitente')
ok(nf.total_produtos === 3330 && nf.soma === 3330 && nf.avisos.length === 0, 'total dos produtos confere, sem avisos (' + nf.avisos.join(' | ') + ')')
ok(nf.itens[0].bem && nf.itens[0].categoria === 'informatica' && nf.itens[0].series[0] === 'PF4ABC12', 'notebook: bem, informática, série')
ok(!nf.itens[1].bem && /consumo/.test(nf.itens[1].motivo_consumo), 'cabo: consumo')
ok(nf.itens[2].bem && nf.itens[2].categoria === 'mobiliario' && nf.itens[2].descricao === 'CADEIRA FIXA ESTOFADA AZUL', 'cadeira: descrição de duas linhas, mobiliário')
ok(nf.itens[2].quantidade === 2 && nf.itens[2].valor_total === 300, 'quantidade e total da cadeira')

// soma que não bate gera aviso
const pag2 = pag.filter(p => p.s !== '1003' && !/CADEIRA|ESTOFADA|94017100/.test(p.s) && !(p.y === 260))
ok(NF.lerTextoDanfe([pag2]).avisos.some(a => /não bate/.test(a)), 'aviso quando falta linha')
let semTexto = false; try { NF.lerTextoDanfe([[]]) } catch (e) { semTexto = e.message === 'SEM_TEXTO' }
ok(semTexto, 'PDF sem texto é recusado')

// ── XML da NF-e ──
const det = (n, c, d, ncm, q, vu, vp, info) => `<det nItem="${n}"><prod><cProd>${c}</cProd><xProd>${d}</xProd><NCM>${ncm}</NCM><uCom>UN</uCom>` +
  `<qCom>${q}</qCom><vUnCom>${vu}</vUnCom><vProd>${vp}</vProd></prod>${info ? '<infAdProd>' + info + '</infAdProd>' : ''}</det>`
const xml = `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe11112222333344445555666677778888999900001234" versao="4.00">` +
  `<ide><serie>1</serie><nNF>777</nNF><dhEmi>2026-11-05T10:00:00-05:00</dhEmi></ide><emit><CNPJ>12345678000190</CNPJ><xNome>LOJA &amp; CIA</xNome></emit>` +
  det(1, '1001', 'CAIXA DE SOM ATIVA 15', '85182200', '2.0000', '1500.0000', '3000.00', 'SN: CX123456; SN: CX123457') +
  det(2, '1002', 'PILHA AA', '85061019', '10.0000', '3.0000', '30.00') +
  `<total><ICMSTot><vProd>3030.00</vProd><vNF>3030.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`
const x = NF.lerXml(xml)
ok(x.origem === 'xml' && x.itens.length === 2 && x.chave.length === 44 && x.numero === '777' && x.emitente === 'LOJA & CIA', 'XML: cabeçalho')
ok(x.itens[0].bem && x.itens[0].categoria === 'audio_video' && x.itens[0].series.join() === 'CX123456,CX123457', 'XML: caixa com 2 séries')
ok(!x.itens[1].bem, 'XML: pilha é consumo')
ok(x.soma === 3030 && x.avisos.length === 0, 'XML: soma confere')
let naoNfe = false; try { NF.lerXml('<a/>') } catch (e) { naoNfe = true }
ok(naoNfe, 'XML que não é NF-e é recusado')

if (falhas) { console.error(falhas + ' falha(s).'); process.exit(1) }
console.log('Leitor de nota fiscal: todos os testes passaram.')
