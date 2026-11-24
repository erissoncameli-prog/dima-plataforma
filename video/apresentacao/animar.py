"""Transições e animações de entrada na apresentação gerada pelo montar.js.

uso: python apresentacao/animar.py build/ppt/plataforma-gestao-projetos-base.pptx build/ppt/plataforma-gestao-projetos.pptx

- Transição: capa = esmaecer; divisórias de seção = empurrar para cima; demais = Morph (PowerPoint 2019/365),
  com "esmaecer" de reserva para versões antigas.
- Animação: objetos com nome "A<ordem><efeito><atraso>_..." entram sozinhos depois da transição.
  Efeitos: F esmaecer · S subir · Z zoom suave · L entrar da esquerda. Grupos em sequência; atraso = degraus de 0,12 s.
"""
import re, sys, zipfile, shutil

ENT, SAI = sys.argv[1], sys.argv[2]
NOME = re.compile(r'^A(\d+)([FSZL])(\d+)_')
DUR = {'F': 600, 'S': 650, 'Z': 700, 'L': 600}
PRESET = {'F': (10, 0), 'S': (42, 0), 'Z': (53, 16), 'L': (2, 8)}

MORPH = ('<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
         '<mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159">'
         '<p:transition spd="slow"><p159:morph option="byObject"/></p:transition></mc:Choice>'
         '<mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>')
FADE = '<p:transition spd="med"><p:fade/></p:transition>'
PUSH = '<p:transition spd="slow"><p:push dir="u"/></p:transition>'


class Ids:
    def __init__(self): self.n = 2
    def __call__(self): self.n += 1; return self.n


def anim(ids, spid, attr, de, ate, dur):
    return (f'<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{ids()}" dur="{dur}" decel="100000" fill="hold"/>'
            f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>{attr}</p:attrName></p:attrNameLst></p:cBhvr>'
            f'<p:tavLst><p:tav tm="0"><p:val><p:strVal val="{de}"/></p:val></p:tav>'
            f'<p:tav tm="100000"><p:val><p:strVal val="{ate}"/></p:val></p:tav></p:tavLst></p:anim>')


def efeito(ids, spid, ef, inicio, primeiro, com_texto):
    pid, sub = PRESET[ef]; dur = DUR[ef]
    grp = ' grpId="0"' if com_texto else ''
    corpo = (f'<p:set><p:cBhvr><p:cTn id="{ids()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
             f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>'
             f'<p:to><p:strVal val="visible"/></p:to></p:set>'
             f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{ids()}" dur="{dur}"/><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:animEffect>')
    if ef == 'S': corpo += anim(ids, spid, 'ppt_y', '#ppt_y+0.06', '#ppt_y', dur)
    if ef == 'L': corpo += anim(ids, spid, 'ppt_x', '#ppt_x-0.06', '#ppt_x', dur)
    if ef == 'Z':
        corpo += anim(ids, spid, 'ppt_w', '#ppt_w*0.82', '#ppt_w', dur) + anim(ids, spid, 'ppt_h', '#ppt_h*0.82', '#ppt_h', dur)
    a, b = ids(), ids()
    tipo = 'afterEffect' if primeiro else 'withEffect'
    return (f'<p:par><p:cTn id="{a}" fill="hold"><p:stCondLst><p:cond delay="{inicio}"/></p:stCondLst><p:childTnLst>'
            f'<p:par><p:cTn id="{b}" presetID="{pid}" presetClass="entr" presetSubtype="{sub}" fill="hold"{grp} nodeType="{tipo}">'
            f'<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>{corpo}</p:childTnLst></p:cTn></p:par>'
            f'</p:childTnLst></p:cTn></p:par>')


def timing(objs):
    """objs: [(spid, ordem, efeito, atraso, com_texto)]"""
    if not objs: return ''
    ids = Ids()
    grupos = sorted({o[1] for o in objs}); t, inicio = 250, {}
    for g in grupos:
        inicio[g] = t
        ult = max(o[3] for o in objs if o[1] == g)
        t += ult * 120 + 420
    pars = []
    for i, (spid, g, ef, atr, tx) in enumerate(sorted(objs, key=lambda o: (o[1], o[3]))):
        pars.append(efeito(ids, spid, ef, inicio[g] + atr * 120, i == 0, tx))
    bld = ''.join(f'<p:bldP spid="{o[0]}" grpId="0" animBg="1"/>' for o in objs if o[4])
    return ('<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
            '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
            f'<p:par><p:cTn id="{ids()}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst>'
            f'<p:childTnLst>{"".join(pars)}</p:childTnLst></p:cTn></p:par>'
            '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
            '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
            '</p:childTnLst></p:cTn></p:par></p:tnLst>' + (f'<p:bldLst>{bld}</p:bldLst>' if bld else '') + '</p:timing>')


zin = zipfile.ZipFile(ENT)
arq = {n: zin.read(n) for n in zin.namelist()}
layouts = {}
for n, d in arq.items():
    m = re.match(r'ppt/slideLayouts/(slideLayout\d+)\.xml$', n)
    if m: layouts[m.group(1)] = re.search(rb'<p:cSld name="([^"]*)"', d).group(1).decode()
ordem = [int(x) for x in re.findall(rb'<p:sldId [^>]*r:id="rId(\d+)"', arq['ppt/presentation.xml'])]
rels_pres = arq['ppt/_rels/presentation.xml.rels'].decode()
total_anim = 0
for n in sorted(arq):
    m = re.match(r'ppt/slides/slide(\d+)\.xml$', n)
    if not m: continue
    num = int(m.group(1)); x = arq[n].decode('utf-8')
    rel = arq[f'ppt/slides/_rels/slide{num}.xml.rels'].decode()
    lay = layouts.get(re.search(r'slideLayouts/(slideLayout\d+)\.xml', rel).group(1), '')
    objs = []
    for mm in re.finditer(r'<p:(sp|pic|graphicFrame)>\s*<p:nv(?:Sp|Pic|GraphicFrame)Pr>\s*<p:cNvPr id="(\d+)" name="([^"]*)"', x):
        tipo, spid, nome = mm.groups(); a = NOME.match(nome)
        if not a: continue
        objs.append((spid, int(a.group(1)), a.group(2), int(a.group(3)), tipo == 'sp'))
    trans = FADE if num == 1 else PUSH if lay == 'SECAO' else MORPH
    bloco = trans + timing(objs)
    total_anim += len(objs)
    if '</p:clrMapOvr>' in x: x = x.replace('</p:clrMapOvr>', '</p:clrMapOvr>' + bloco, 1)
    else: x = x.replace('</p:cSld>', '</p:cSld>' + bloco, 1)
    arq[n] = x.encode('utf-8')

with zipfile.ZipFile(SAI, 'w', zipfile.ZIP_DEFLATED) as z:
    for n in zin.namelist(): z.writestr(n, arq[n])
print('ok', SAI, '·', total_anim, 'objetos animados')
