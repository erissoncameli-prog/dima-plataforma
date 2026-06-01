#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Baixa geometrias dos 22 municípios do Acre via API IBGE e gera GeoJSON combinado."""
import json, os, sys, time
sys.stdout.reconfigure(encoding='utf-8')

try:
    import urllib.request as req
except ImportError:
    import urllib2 as req

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'municipios_acre.geojson')

# Pegar lista de municípios do Acre
print("Buscando lista de municípios do Acre...")
url_lista = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados/12/municipios'
import gzip, io
with req.urlopen(url_lista) as r:
    raw = r.read()
    try: raw = gzip.decompress(raw)
    except: pass
    municipios = json.loads(raw.decode('utf-8'))

print(f"Total: {len(municipios)} municípios")

features = []
for i, m in enumerate(municipios):
    cod  = m['id']
    nome = m['nome']
    print(f"  [{i+1:2d}/{len(municipios)}] {nome} ({cod})")
    url_geo = f'https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{cod}?formato=application/vnd.geo%2Bjson'
    try:
        with req.urlopen(url_geo) as r:
            raw2 = r.read()
            try: raw2 = gzip.decompress(raw2)
            except: pass
            geojson = json.loads(raw2.decode('utf-8'))
        for feat in geojson.get('features', []):
            feat['properties']['codibge'] = str(cod)
            feat['properties']['nome']    = nome
            features.append(feat)
    except Exception as e:
        print(f"    ⚠ Erro: {e}")
    time.sleep(0.1)  # respeitar rate limit

resultado = {'type': 'FeatureCollection', 'features': features}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(resultado, f, ensure_ascii=False, separators=(',', ':'))

size = os.path.getsize(OUT)
print(f"\n✓ Salvo: {OUT} ({size/1024:.0f} KB) — {len(features)} features")
