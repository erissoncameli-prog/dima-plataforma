#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Converte shapefile CNUC 2025_08 para GeoJSON filtrando o Acre.
Saída: uc_acre.geojson com federal + estadual + municipal
"""
import shapefile, json, os, sys

SHP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shp_cnuc_tmp", "cnuc_2025_08.shp")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uc_acre.geojson")

def safe_str(v):
    if v is None:
        return ""
    try:
        s = str(v).strip()
        return s
    except Exception:
        return ""

def coords_to_geojson(shape):
    """Converte shape do pyshp para geometry GeoJSON."""
    if shape.shapeType == 0:
        return None
    pts = list(shape.points)
    parts = list(shape.parts) + [len(pts)]

    if shape.shapeType in (5, 15, 25):  # Polygon / PolygonZ / PolygonM
        rings = []
        for i in range(len(parts) - 1):
            ring = [[p[0], p[1]] for p in pts[parts[i]:parts[i+1]]]
            rings.append(ring)
        # Se só 1 anel -> Polygon, senão -> MultiPolygon simplificado
        if len(rings) == 1:
            return {"type": "Polygon", "coordinates": rings}
        # Determinar exterior vs buracos pelo sentido do anel
        polys = []
        current_exterior = None
        for ring in rings:
            # Shoelace para determinar orientação
            n = len(ring)
            area = sum(ring[i][0] * ring[(i+1)%n][1] - ring[(i+1)%n][0] * ring[i][1] for i in range(n))
            if area < 0:  # clockwise = exterior em shapefile
                if current_exterior is not None:
                    polys.append(current_exterior)
                current_exterior = [ring]
            else:
                if current_exterior is not None:
                    current_exterior.append(ring)
        if current_exterior:
            polys.append(current_exterior)
        if not polys:
            polys = [[rings[0]]]
        if len(polys) == 1:
            return {"type": "Polygon", "coordinates": polys[0]}
        return {"type": "MultiPolygon", "coordinates": polys}
    elif shape.shapeType in (3, 13, 23):  # Polyline
        lines = []
        for i in range(len(parts) - 1):
            line = [[p[0], p[1]] for p in pts[parts[i]:parts[i+1]]]
            lines.append(line)
        return {"type": "MultiLineString", "coordinates": lines}
    elif shape.shapeType in (1, 11, 21):  # Point
        return {"type": "Point", "coordinates": [pts[0][0], pts[0][1]]}
    return None

sf = shapefile.Reader(SHP, encoding='utf-8')
campos = [f[0] for f in sf.fields[1:]]

features = []
total = 0
skipped_geo = 0

for shape_rec in sf.iterShapeRecords():
    rec = shape_rec.record
    shp = shape_rec.shape
    props = {c: safe_str(rec[i]) for i, c in enumerate(campos)}

    uf = props.get('uf', '').strip().upper()
    # Filtrar apenas registros que incluem AC
    if 'AC' not in uf:
        continue

    total += 1
    geom = coords_to_geojson(shp)
    if geom is None:
        skipped_geo += 1
        continue

    features.append({
        "type": "Feature",
        "geometry": geom,
        "properties": {
            "nome":      props.get('nome_uc', ''),
            "categoria": props.get('categoria', ''),
            "grupo":     props.get('grupo', ''),
            "esfera":    props.get('esfera', '').lower(),
            "uf":        props.get('uf', ''),
            "municipio": props.get('municipio', ''),
            "ano_cria":  props.get('cria_ano', ''),
            "area_ha":   props.get('ha_total', ''),
            "situacao":  props.get('situacao', ''),
            "cd_cnuc":   props.get('cd_cnuc', ''),
            "org_gestor":props.get('org_gestor', ''),
        }
    })

geojson = {"type": "FeatureCollection", "features": features}

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(geojson, f, ensure_ascii=False, separators=(',', ':'))

print(f"UCs no Acre encontradas: {total}")
print(f"Sem geometria (puladas): {skipped_geo}")
print(f"Features salvas: {len(features)}")

# Resumo por esfera
from collections import Counter
esf = Counter(feat['properties']['esfera'] for feat in features)
cat = Counter(feat['properties']['categoria'] for feat in features)
print("\nPor esfera:", dict(esf))
print("\nPor categoria:")
for k, v in sorted(cat.items()):
    print(f"  {v:3d}x {k}")

size = os.path.getsize(OUT)
print(f"\nArquivo: {OUT}")
print(f"Tamanho: {size/1024:.0f} KB")
