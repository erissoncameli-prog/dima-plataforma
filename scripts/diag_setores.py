#!/usr/bin/env python3
"""Converte o shapefile dos setores de campo de uma APA em SQL de carga
(Diagnóstico Socioambiental · setores de campo, migração diag_21).

  uso: python3 -I scripts/diag_setores.py <arquivo.shp> --sigla SF \
           --comunidade "APA São Francisco" --ibge 1200401 > saida.sql
       python3 -I scripts/diag_setores.py --autoteste

Travas (nada é gerado se alguma falhar):
  · .prj tem de ser geográfico SIRGAS 2000 (ou WGS 84) — sem reprojeção;
  · cada feição é polígono válido, com SETOR e META;
  · setores não se sobrepõem;
  · área calculada (geodésica, GRS 80) bate com AREA_HA do arquivo em 1%.
Depende de pyshp e shapely (pip install pyshp shapely pyproj).
"""
import argparse, json, math, os, re, sys

def ler(caminho):
    import shapefile
    from shapely.geometry import shape, mapping
    from pyproj import Geod
    prj = os.path.splitext(caminho)[0] + '.prj'
    if not os.path.exists(prj):
        sys.exit('ERRO: falta o .prj (sem ele não se sabe o datum)')
    txt = open(prj, encoding='utf-8', errors='replace').read()
    if not txt.startswith('GEOGCS') or not re.search(r'SIRGAS|WGS', txt):
        sys.exit('ERRO: o .prj não é geográfico SIRGAS 2000/WGS 84: ' + txt[:80])
    cpg = os.path.splitext(caminho)[0] + '.cpg'
    enc = open(cpg).read().strip() if os.path.exists(cpg) else 'latin-1'
    if enc.upper() in ('UTF-8', 'UTF8'): enc = 'utf-8'
    geod = Geod(ellps='GRS80')
    r = shapefile.Reader(caminho, encoding=enc)
    setores = []
    for sr in r.shapeRecords():
        a = sr.record.as_dict()
        g = shape(sr.shape.__geo_interface__)
        if g.geom_type not in ('Polygon', 'MultiPolygon') or not g.is_valid:
            sys.exit('ERRO: feição inválida no setor %r' % a.get('SETOR'))
        area_ha = abs(geod.geometry_area_perimeter(g)[0]) / 1e4
        setores.append({'attr': a, 'geom': g, 'area_ha': area_ha})
    return setores

def validar(setores):
    for s in setores:
        a = s['attr']
        if not str(a.get('SETOR') or '').strip(): sys.exit('ERRO: feição sem SETOR')
        if not a.get('META') or int(a['META']) < 1: sys.exit('ERRO: setor %r sem META' % a['SETOR'])
        ref = a.get('AREA_HA')
        if ref and abs(s['area_ha'] - float(ref)) / float(ref) > 0.01:
            sys.exit('ERRO: área de %r = %.1f ha, arquivo diz %.1f' % (a['SETOR'], s['area_ha'], ref))
    # sobra de digitalização na divisa (faixas de poucos m²) é tolerada e registrada;
    # sobreposição de verdade (≥ 0,5 ha ou ≥ 0,1% do menor setor) para tudo
    from pyproj import Geod
    geod = Geod(ellps='GRS80')
    lascas = []
    for i in range(len(setores)):
        for j in range(i + 1, len(setores)):
            x = setores[i]['geom'].intersection(setores[j]['geom'])
            if x.is_empty or x.area <= 1e-12: continue
            ha = abs(geod.geometry_area_perimeter(x)[0]) / 1e4
            menor = min(setores[i]['area_ha'], setores[j]['area_ha'])
            par = (setores[i]['attr']['SETOR'], setores[j]['attr']['SETOR'])
            if ha >= 0.5 or ha >= menor * 0.001:
                sys.exit('ERRO: setores %r e %r se sobrepõem em %.2f ha' % (par[0], par[1], ha))
            lascas.append('%s × %s: %.0f m²' % (par[0], par[1], ha * 1e4))
    return lascas

def arred(c):
    if isinstance(c, (list, tuple)):
        if c and isinstance(c[0], (int, float)): return [round(c[0], 6), round(c[1], 6)]
        return [arred(x) for x in c]
    return c

def num_nome(rotulo):
    m = re.match(r'\s*(\d+)\s*[·\-.:]?\s*(.*)$', rotulo)
    return (int(m.group(1)), m.group(2).strip() or rotulo.strip()) if m else (None, rotulo.strip())

def q(s):
    return "'" + str(s).replace("'", "''") + "'" if s is not None and str(s).strip() != '' else 'null'

def gerar_sql(setores, sigla, comunidade, ibge, origem, lascas=()):
    from shapely.geometry import mapping
    linhas = ['-- gerado por scripts/diag_setores.py a partir de ' + origem] + \
             ['-- sobra de digitalização na divisa (tolerada, ponto ali conta para o 1º setor): ' + l for l in lascas] + ['do $$', 'declare v_com uuid;', 'begin',
              "  select id into v_com from public.diag_comunidades where municipio_ibge = %d and lower(btrim(nome)) = lower(btrim(%s));" % (ibge, q(comunidade)),
              "  if v_com is null then raise notice 'diag_setores: comunidade %% não cadastrada — nada carregado', %s; return; end if;" % q(comunidade)]
    for s in sorted(setores, key=lambda s: num_nome(s['attr']['SETOR'])[0] or 0):
        a = s['attr']; n, nome = num_nome(a['SETOR'])
        codigo = '%s%s' % (sigla, n if n is not None else len(linhas))
        gj = mapping(s['geom']); gj = {'type': gj['type'], 'coordinates': arred(gj['coordinates'])}
        meta = int(a['META'])
        cel = max(50, int(round(math.sqrt(s['area_ha'] * 1e4 / meta) / 10.0)) * 10)
        b = s['geom'].bounds
        atrib = {k.lower(): v for k, v in a.items() if k in ('APOIO', 'ACESSO', 'REFERENC', 'APA') and str(v).strip()}
        linhas.append(
            "  perform public.fn_diag_setor_carregar(v_com, %s, %s, %s, %s, %d, %.1f, %d, '%s'::jsonb, '%s'::jsonb, array[%s]::numeric[]);" % (
                q(codigo), n if n is not None else 'null', q(nome), q(str(a.get('TIPO') or '').strip().lower() or None),
                meta, s['area_ha'], cel, json.dumps(gj, separators=(',', ':')), json.dumps(atrib, ensure_ascii=False).replace("'", "''"),
                ','.join('%.6f' % v for v in b)))
    linhas += ['end $$;']
    return '\n'.join(linhas) + '\n'

def autoteste():
    from shapely.geometry import Polygon
    a = Polygon([(-68, -10), (-67.99, -10), (-67.99, -9.99), (-68, -9.99)])
    s = [{'attr': {'SETOR': '1 · Teste', 'META': 10, 'AREA_HA': 121.9, 'TIPO': 'Rural'}, 'geom': a, 'area_ha': 121.9}]
    validar(s)
    sql = gerar_sql(s, 'TT', "APA d'Teste", 1200401, 'autoteste')
    assert "APA d''Teste" in sql and "'TT1', 1, 'Teste', 'rural', 10" in sql, sql
    assert num_nome('5 · Corredor urbano') == (5, 'Corredor urbano')
    print('autoteste ok')

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('shp', nargs='?'); ap.add_argument('--sigla'); ap.add_argument('--comunidade'); ap.add_argument('--ibge', type=int)
    ap.add_argument('--autoteste', action='store_true')
    x = ap.parse_args()
    if x.autoteste: autoteste(); sys.exit(0)
    if not (x.shp and x.sigla and x.comunidade and x.ibge): ap.error('informe shp, --sigla, --comunidade e --ibge')
    st = ler(x.shp); lascas = validar(st)
    for l in lascas: sys.stderr.write('aviso: sobra na divisa ' + l + '\n')
    sys.stdout.write(gerar_sql(st, x.sigla.upper(), x.comunidade, x.ibge, os.path.basename(x.shp), lascas))
    sys.stderr.write('%d setores, %d entrevistas no total\n' % (len(st), sum(int(s['attr']['META']) for s in st)))
