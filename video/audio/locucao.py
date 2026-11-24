"""Gera a locução de cada cena (Kokoro-82M, voz neural pt-BR, offline) e mede as palavras com o Whisper.

uso: python audio/locucao.py <pasta-dos-modelos>
saída: build/voz/<cena>.wav e build/locucao.json (duração e tempo de cada palavra, para as legendas)
"""
import json, sys, os, re, unicodedata
from math import gcd
import numpy as np, soundfile as sf
from scipy.signal import resample_poly

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
M = sys.argv[1]
OUT = os.path.join(RAIZ, 'build', 'voz'); os.makedirs(OUT, exist_ok=True)
R = json.load(open(os.path.join(RAIZ, 'roteiro.json'), encoding='utf-8'))
VEL = {'alex': 1.0, 'dora': 1.06}

# vozes do Kokoro (onnx-community) → npz que o kokoro-onnx lê
vz = {v: np.fromfile(f'{M}/{v}.bin', dtype=np.float32).reshape(-1, 1, 256) for v in R['vozes'].values()}
np.savez(f'{M}/voices.npz', **vz)
from kokoro_onnx import Kokoro
k = Kokoro(f'{M}/kokoro-v1.0.onnx', f'{M}/voices.npz')

def aparar(a, sr, lim=0.012, folga=0.06):
    idx = np.where(np.abs(a) > lim)[0]
    if not len(idx): return a
    i0 = max(0, idx[0] - int(folga * sr)); i1 = min(len(a), idx[-1] + int(folga * 2 * sr))
    return a[i0:i1]

from faster_whisper import WhisperModel
asr = WhisperModel('small', device='cpu', compute_type='int8')
norm = lambda s: re.sub(r'[^a-z0-9 ]', '', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode())

saida = []
for c in R['cenas']:
    a, sr = k.create(c['texto'], voice=R['vozes'][c['voz']], speed=VEL[c['voz']], lang='pt-br')
    a = aparar(a.astype(np.float32), sr)
    arq = os.path.join(OUT, c['id'] + '.wav'); sf.write(arq, a, sr)
    g = gcd(sr, 16000); a16 = resample_poly(a, 16000 // g, sr // g).astype(np.float32)
    segs, _ = asr.transcribe(a16, language='pt', beam_size=5, word_timestamps=True, initial_prompt=c['texto'])
    pal = [{'w': w.word.strip(), 'ini': round(w.start, 3), 'fim': round(w.end, 3)} for s in segs for w in s.words]
    ouvido = ' '.join(p['w'] for p in pal)
    # palavras do texto original (com acento e pontuação certos) sobre os tempos medidos
    orig = c['texto'].split()
    if len(orig) == len(pal):
        for p, o in zip(pal, orig): p['w'] = o
    ok = norm(ouvido) == norm(c['texto'])
    saida.append({'id': c['id'], 'voz': c['voz'], 'texto': c['texto'], 'arquivo': f"voz/{c['id']}.wav", 'dur': round(len(a) / sr, 3), 'palavras': pal, 'conferido': ok})
    print(f"{'✓' if ok else '≠'} {c['id']:11s} {len(a)/sr:5.2f}s  {ouvido}")

json.dump(saida, open(os.path.join(RAIZ, 'build', 'locucao.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('total', round(sum(s['dur'] for s in saida), 1), 's')
