#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys, os
sys.stdout.reconfigure(encoding='utf-8')

f = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uc_acre.geojson")
with open(f, encoding='utf-8') as fh:
    d = json.load(fh)

print(f"Total features: {len(d['features'])}\n")
for ft in d["features"]:
    p = ft["properties"]
    print(f"{p['esfera']:12} | {p['grupo']:2} | {p['categoria'][:40]:40} | {p['nome']}")
