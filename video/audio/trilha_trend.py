"""Corte de 30 s no estilo "trailer ao pôr do sol" (trend das redes): trilha synthwave original + montagem por batida.

uso: python audio/trilha_trend.py
lê:  build/corte30/voz/{gancho,fecho}.wav e build/corte30/locucao.json (as duas falas de Alex, já conferidas)
gera: build/trend/linha.json (tempos das partes, lidos por cenas/trend.js) e build/trend/mix.wav
Tudo sintetizado aqui; nenhuma música ou som de terceiros.
"""
import json, os, subprocess, math
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(RAIZ, 'build', 'corte30'); B = os.path.join(RAIZ, 'build', 'trend'); os.makedirs(B, exist_ok=True)
SR = 48000; BPM = 100; BEAT = 60 / BPM; BAR = 4 * BEAT          # 0,6 s por tempo; 2,4 s por compasso
rng = np.random.default_rng(7)

# ── montagem por compasso ───────────────────────────────────────────────────
loc = {c['id']: c for c in json.load(open(os.path.join(SRC, 'locucao.json'), encoding='utf-8'))}
P = [('gancho', 0.0), ('paineis', 2 * BAR), ('visao', 4 * BAR), ('remanej', 5.5 * BAR), ('mapa', 7 * BAR), ('auditoria', 8.5 * BAR), ('fecho', 10 * BAR)]
TOTAL = 29.9
VOZ = {'gancho': 0.75, 'fecho': 10 * BAR + 0.9}
cenas = []
for i, (cid, ini) in enumerate(P):
    fim = P[i + 1][1] if i + 1 < len(P) else TOTAL
    c = {'id': cid, 'ini': round(ini, 3), 'fim': round(fim, 3)}
    if cid in VOZ:
        v = VOZ[cid]; c.update(voz=v, fim_voz=round(v + loc[cid]['dur'], 3), texto=loc[cid]['texto'],
                               palavras=[{**p, 'ini': round(v + p['ini'], 3), 'fim': round(v + p['fim'], 3)} for p in loc[cid]['palavras']])
    cenas.append(c)
json.dump({'total': TOTAL, 'bpm': BPM, 'cenas': cenas}, open(os.path.join(B, 'linha.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
T = {c['id']: c['ini'] for c in cenas}
N = int((TOTAL + 3) * SR)

def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, b], 'band', fs=SR, output='sos'), x)
def saw(f, n, ph=0.0): return 2 * ((np.arange(n) * f / SR + ph) % 1.0) - 1
def put(buf, x, t0, g=1.0):
    i = int(t0 * SR); j = min(len(buf), i + len(x))
    if 0 <= i < j: buf[i:j] += x[:j - i] * g
def env(n, a=.01, r=.2):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR); e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e
hz = lambda m: 440 * 2 ** ((m - 69) / 12)

# Lá menor → Fá → Dó → Sol, um acorde por compasso
PROG = [(45, [57, 60, 64, 69]), (41, [53, 57, 60, 65]), (48, [55, 60, 64, 67]), (43, [55, 59, 62, 67])]
def faixa(a, b, fade=.04):
    e = np.zeros(N); e[int(a * SR):int(b * SR)] = 1; k = int(fade * SR); return np.convolve(e, np.ones(k) / k, 'same')
batida = faixa(T['paineis'], T['fecho'])          # bateria e baixo pulsante
intro = faixa(0, T['paineis'], .3) + faixa(T['fecho'], TOTAL + 3, .3)

pad = np.zeros(N); bass = np.zeros(N); arp = np.zeros(N); sino = np.zeros(N); dr = np.zeros(N)
for b in range(int(TOTAL / BAR) + 2):
    t0 = b * BAR; raiz, notas = PROG[b % 4]; n = int((BAR + .8) * SR)
    x = np.zeros(n)
    for m in notas:
        for d in (-.09, .0, .09): x += saw(hz(m) * 2 ** (d / 12), n, rng.random())
    put(pad, lp(x, 1600) * env(n, .25, .7) * .05, t0)
    for k in range(8):                                     # baixo synthwave: oitavas em colcheia
        nb = int(BEAT / 2 * .85 * SR); f = hz(raiz - 12 + (12 if k % 2 else 0))
        y = lp(saw(f, nb), 900) * .7 + np.sin(2 * np.pi * f * np.arange(nb) / SR) * .5
        put(bass, y * env(nb, .004, .05), t0 + k * BEAT / 2, .3)
    for k in range(16):                                    # arpejo em semicolcheia
        na = int(.2 * SR); m = notas[[0, 2, 1, 3][k % 4]] + 12
        q = lp(np.sign(np.sin(2 * np.pi * hz(m) * np.arange(na) / SR)), 2600) * np.exp(-np.arange(na) / SR / .07)
        put(arp, q, t0 + k * BEAT / 4, .035)
    MEL = [[76, 74, 72, 76], [72, 69, 72, 77], [76, 79, 76, 72], [74, 71, 74, 79]][b % 4]   # sino FM: melodia simples
    for k, m in enumerate(MEL):
        ns = int(1.1 * SR); tt = np.arange(ns) / SR; f = hz(m)
        y = np.sin(2 * np.pi * f * tt + 2.2 * np.exp(-tt / .25) * np.sin(2 * np.pi * f * 3.5 * tt)) * np.exp(-tt / .45)
        put(sino, y, t0 + k * BEAT, .05)

def kick():
    n = int(.4 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(48 + 120 * np.exp(-t / .03)) / SR) * np.exp(-t / .15)
def caixa_gate():                                          # caixa anos 80: corpo + ruído com reverberação "cortada"
    n = int(.34 * SR); t = np.arange(n) / SR
    corpo = np.sin(2 * np.pi * 190 * t) * np.exp(-t / .05)
    rui = bp(rng.standard_normal(n), 900, 7000) * (np.where(t < .26, 1, 0) * (.55 + .45 * np.exp(-t / .03)))
    return corpo * .7 + rui * .55
def chimbal(): n = int(.06 * SR); return hp(rng.standard_normal(n), 8000) * np.exp(-np.arange(n) / SR / .012)
def tom(f):
    n = int(.35 * SR); t = np.arange(n) / SR; return np.sin(2 * np.pi * np.cumsum(f * (1 + .6 * np.exp(-t / .04))) / SR) * np.exp(-t / .16)
K, S, HH = kick(), caixa_gate(), chimbal()
kicks = []
for k in range(int(TOTAL / BEAT) + 1):
    t = k * BEAT
    if batida[min(N - 1, int(t * SR) + 10)] > .5:
        if k % 4 in (0, 2): put(dr, K, t, .6); kicks.append(t)
        if k % 4 in (1, 3): put(dr, S, t, .32)
        for j in range(4): put(dr, HH, t + j * BEAT / 4, .05 if j % 2 else .08)
for j, f in enumerate((180, 140, 105)):                    # virada de tons antes do "drop"
    put(dr, tom(f), T['paineis'] - BEAT + j * BEAT / 3, .45)

pump = np.ones(N)
for k in kicks:
    i = int(k * SR); m = min(N - i, int(.35 * SR)); pump[i:i + m] = np.minimum(pump[i:i + m], 1 - .5 * np.exp(-np.arange(m) / SR / .1))
mus = (pad * (.6 + .4 * batida) + lp(pad, 700) * intro * .5) * pump + bass * batida * pump + arp * (.4 * intro + batida) + sino * (.5 + .5 * intro) + dr

# ── efeitos: pancadas nos cortes, subida e reverso ──────────────────────────
sfx = np.zeros(N)
def pancada():
    n = int(1.6 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(36 + 80 * np.exp(-t / .06)) / SR) * np.exp(-t / .5) + lp(rng.standard_normal(n), 3000) * np.exp(-t / .12) * .4
def estalo(): n = int(.18 * SR); return bp(rng.standard_normal(n), 1200, 9000) * np.exp(-np.arange(n) / SR / .03)
def subida(d):
    n = int(d * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 2000) * (t / d) ** 2.5 * .45 + np.sin(2 * np.pi * np.cumsum(np.geomspace(150, 1400, n)) / SR) * (t / d) ** 3 * .12
put(sfx, subida(2 * BAR - .1), .1, .45); put(sfx, pancada(), T['paineis'], .8)
for j in range(4): put(sfx, estalo(), T['paineis'] + j * BEAT, .35)          # cada painel entra com um estalo
for cid in ('visao', 'remanej', 'mapa', 'auditoria'): put(sfx, pancada(), T[cid], .5); put(sfx, estalo(), T[cid], .45)
rev = subida(1.2)[::-1][::-1]; put(sfx, subida(1.2), T['fecho'] - 1.2, .5); put(sfx, pancada(), T['fecho'], .85)

# ── vozes (mesmo tratamento das outras versões) e mixagem ───────────────────
voz = np.zeros(N)
FILTRO = 'highpass=f=75,equalizer=f=220:t=q:w=1.2:g=-2,equalizer=f=3800:t=q:w=1.4:g=3,equalizer=f=9000:t=h:w=1:g=2,' \
         'acompressor=threshold=-21dB:ratio=3.5:attack=4:release=90:makeup=3,aresample=48000'
for cid, v in VOZ.items():
    dst = os.path.join(B, cid + '.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(SRC, 'voz', cid + '.wav'), '-af', FILTRO, '-ac', '1', dst], check=True)
    a, _ = sf.read(dst, dtype='float32'); put(voz, a, v)
ev = np.convolve(np.abs(voz), np.ones(int(.25 * SR)) / int(.25 * SR), 'same'); ev = np.clip(ev / (ev.max() * .15), 0, 1)
fade = np.ones(N); fe = int(TOTAL * SR); fo = int(1.2 * SR); fade[fe - fo:fe] = np.linspace(1, 0, fo); fade[fe:] = 0
musica = (mus * (1 - .7 * ev) * .5 + sfx * .6) * fade
_v = ev > .5
print('voz acima da música (dB):', round(20 * math.log10(np.sqrt(np.mean(voz[_v] ** 2)) / np.sqrt(np.mean(musica[_v] ** 2))), 1))
mix = np.stack([musica + voz, np.roll(musica, int(.012 * SR)) * .96 + voz], 1)[:fe]
mix /= np.abs(mix).max() / .89
sf.write(os.path.join(B, 'mix_bruto.wav'), mix.astype(np.float32), SR)
BUS = 'acompressor=threshold=-16dB:ratio=2.5:attack=8:release=160:makeup=2,alimiter=limit=0.85:level=false'
# loudnorm em duas passadas (mede e depois aplica): a pancada e a caixa limitam a passada única
med = subprocess.run(['ffmpeg', '-hide_banner', '-i', os.path.join(B, 'mix_bruto.wav'), '-af', BUS + ',loudnorm=I=-14:TP=-1.0:LRA=9:print_format=json', '-f', 'null', '-'],
                     capture_output=True, text=True).stderr
m = json.loads(med[med.rindex('{'):med.rindex('}') + 1])
LN = f"loudnorm=I=-14:TP=-1.0:LRA=9:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(B, 'mix_bruto.wav'), '-af', BUS + ',' + LN, '-ar', '48000', os.path.join(B, 'mix.wav')], check=True)
print('ok', TOTAL, 's', [(c['id'], c['ini']) for c in cenas])
