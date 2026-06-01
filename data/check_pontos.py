#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lista UCs do Acre no shapefile de pontos (sem polígono no CNUC)"""
import shapefile, json, os, sys
sys.stdout.reconfigure(encoding='utf-8')

def fix(v):
    if v is None: return ""
    try:
        s = str(v).strip()
        return s.encode('latin-1').decode('utf-8')
    except:
        return str(v).strip()

SHP = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "shp_cnuc_tmp", "cnuc_2025_08_pontos.shp")

sf = shapefile.Reader(SHP, encoding='latin-1', encodingErrors='replace')
campos = [f[0] for f in sf.fields[1:]]
print("Campos:", campos)
print()

pontos_ac = []
for sr in sf.iterShapeRecords():
    props = {c: fix(sr.record[i]) for i, c in enumerate(campos)}
    uf = props.get('uf', '').upper()
    if 'AC' not in uf:
        continue
    pontos_ac.append(props)

print(f"UCs no Acre SEM polígono (apenas ponto): {len(pontos_ac)}\n")
for p in sorted(pontos_ac, key=lambda x: x.get('esfera','') + x.get('nome_uc','')):
    print(f"  [{p.get('esfera','?'):8}] {p.get('categoria','?'):42} | {p.get('nome_uc','?')}")
