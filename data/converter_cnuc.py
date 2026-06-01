#!/usr/bin/env python3
"""
Converte shapefile CNUC para GeoJSON filtrando apenas o Acre.
Gera: uc_acre.geojson com todas as esferas (federal, estadual, municipal)
"""
import shapefile, json, os, sys

SHP = os.path.join(os.path.dirname(__file__), "shp_cnuc_tmp", "cnuc_2025_08.shp")
OUT = os.path.join(os.path.dirname(__file__), "uc_acre.geojson")

sf = shapefile.Reader(SHP, encoding='latin-1')
campos = [f[0] for f in sf.fields[1:]]
print("Campos disponíveis:", campos)

# Ver primeiros 3 registros para entender os dados
for i, rec in enumerate(sf.records()[:3]):
    d = dict(zip(campos, rec))
    print(f"\nReg {i}:", json.dumps({k: str(v).strip() for k,v in d.items()}, ensure_ascii=False))

# Contar total
total = len(sf.shapes())
print(f"\nTotal de registros: {total}")

# Detectar campo de UF
uf_campos = [c for c in campos if 'uf' in c.lower() or 'estado' in c.lower() or 'sigla' in c.lower()]
print("Campos UF candidatos:", uf_campos)
