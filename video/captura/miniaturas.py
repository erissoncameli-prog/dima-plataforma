"""Cópias reduzidas (1000 px, LANCZOS) das telas para a "parede" do vídeo: textura pequena em perspectiva não cintila.
uso: python captura/miniaturas.py   → build/telas-mini/*.jpg"""
import os, glob
from PIL import Image
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
o = os.path.join(R, 'build', 'telas-mini'); os.makedirs(o, exist_ok=True)
for f in glob.glob(os.path.join(R, 'build', 'telas', '*.png')):
    im = Image.open(f).convert('RGB'); im.thumbnail((1000, 1000), Image.LANCZOS)
    im.save(os.path.join(o, os.path.basename(f)[:-4] + '.jpg'), quality=90)
print('ok')
