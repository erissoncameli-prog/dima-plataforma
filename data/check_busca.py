#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Busca UCs específicas do Acre no shapefile completo pelo nome"""
import shapefile, os, sys
sys.stdout.reconfigure(encoding='utf-8')

def fix(v):
    if v is None: return ""
    try:
        s = str(v).strip()
        return s.encode('latin-1').decode('utf-8')
    except:
        return str(v).strip()

SHP = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "shp_cnuc_tmp", "cnuc_2025_08.shp")

# UCs conhecidas do Acre que podem estar faltando
BUSCA = [
    'gregorio', 'gregório', 'ouro preto', 'caipora', 'antimary',
    'moa', 'juruá', 'jurua', 'riozinho', 'tarauacá', 'cazumba',
    'chandless', 'macaua', 'macauã', 'acre',
]

sf = shapefile.Reader(SHP, encoding='latin-1', encodingErrors='replace')
campos = [f[0] for f in sf.fields[1:]]

print(f"{'Nome UC':50} {'Esfera':10} {'Categoria':35} {'UF':15}")
print('-'*115)

for sr in sf.iterShapeRecords():
    props = {c: fix(sr.record[i]) for i, c in enumerate(campos)}
    nome = props.get('nome_uc', '').lower()
    if any(b in nome for b in BUSCA):
        print(f"{props.get('nome_uc','?')[:50]:50} {props.get('esfera','?'):10} {props.get('categoria','?')[:35]:35} {props.get('uf','?')}")
