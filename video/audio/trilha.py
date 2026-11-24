"""Linha do tempo + trilha original + efeitos + mixagem (tudo sintetizado aqui, sem material de terceiros).

uso: python audio/trilha.py [build] [segundos-do-fecho]      (corte de 30 s: python audio/trilha.py build/corte30 3.6)
lê:  <build>/locucao.json, <build>/voz/*.wav
gera: <build>/linha.json (tempo de cada cena, lido pela animação), <build>/mix.wav (48 kHz estéreo)
"""
import json, os, subprocess, math, sys
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = os.path.join(RAIZ, sys.argv[1] if len(sys.argv) > 1 else 'build')
SEGURA = float(sys.argv[2]) if len(sys.argv) > 2 else 5.5
COMPACTO = 'compacto' in sys.argv          # corte curto: abertura menor, cenas mais juntas, música um pouco mais baixa
ABERTURA, FOLGA, MUS = (0.5, 0.12, 0.24) if COMPACTO else (1.0, 0.3, 0.42)
SR = 48000
BPM = 120; BEAT = 60 / BPM; BAR = 4 * BEAT
rng = np.random.default_rng(42)

# ── 1. Linha do tempo: cada cena começa num tempo do compasso ─────────────────
loc = json.load(open(os.path.join(B, 'locucao.json'), encoding='utf-8'))
PRE = {'gancho': 0.25, 'marca': 1.1, 'fecho': 0.9}          # respiro antes da voz (marca: revelação do logo)
if len(loc) > 1 and loc[1]['id'] != 'marca': PRE[loc[1]['id']] = 0.55   # corte sem a marca: o impacto cai na 1ª tela
cenas, t = [], ABERTURA                                      # abertura antes do gancho
for c in loc:
    ini = t
    voz = ini + PRE.get(c['id'], 0.3)
    fim_voz = voz + c['dur']
    t = math.ceil((fim_voz + FOLGA) / BEAT) * BEAT
    cenas.append({'id': c['id'], 'ini': round(ini, 3), 'voz': round(voz, 3), 'fim_voz': round(fim_voz, 3), 'fim': round(t, 3),
                  'texto': c['texto'], 'palavras': [{**p, 'ini': round(voz + p['ini'], 3), 'fim': round(voz + p['fim'], 3)} for p in c['palavras']]})
cenas[-1]['fim'] = round(cenas[-1]['fim_voz'] + SEGURA, 3)   # fecho segura logos e crédito
TOTAL = cenas[-1]['fim']
json.dump({'total': TOTAL, 'bpm': BPM, 'cenas': cenas}, open(os.path.join(B, 'linha.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('duração', TOTAL, 's')
C = {c['id']: c for c in cenas}
N = int(TOTAL * SR) + SR
tt = np.arange(N) / SR

# ── utilitários de síntese ───────────────────────────────────────────────────
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, b], 'band', fs=SR, output='sos'), x)
def saw(f, n, ph=0.0): return 2 * ((np.arange(n) * f / SR + ph) % 1.0) - 1
def put(buf, x, t0, g=1.0):
    i = int(t0 * SR); j = min(len(buf), i + len(x))
    if j > i: buf[i:j] += x[:j - i] * g
def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.2):
    e = np.full(n, s); na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na); e[na:na + nd] = np.linspace(1, s, nd)[:max(0, min(nd, n - na))]
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e
hz = lambda m: 440 * 2 ** ((m - 69) / 12)

# progressão vi–IV–I–V em Lá menor / Dó maior (2 compassos por acorde)
PROG = [(57, [57, 60, 64, 69]), (53, [53, 57, 60, 65]), (48, [55, 60, 64, 67]), (55, [55, 59, 62, 67])]
def acorde(t): return PROG[int(t // (2 * BAR)) % 4]

# seções: quanto de cada instrumento em cada instante (0–1)
def faixa(a, b, fade=0.05):
    e = np.zeros(N); i, j = int(a * SR), int(b * SR); e[i:j] = 1
    k = int(fade * SR)
    if k: e = np.convolve(e, np.ones(k) / k, 'same')
    return e
t_drop = cenas[1]['ini']; t_fim = C['fecho']['ini']
t_break = C['seguranca']['ini'] if 'seguranca' in C else t_fim - BAR      # sem a cena de segurança: um compasso de pausa antes do fecho
cheio = faixa(t_drop, t_break) + faixa(t_fim, min(TOTAL, t_fim + 2 * BAR)) * 0.9
intro = faixa(0, t_drop, 0.3) + faixa(t_break, t_fim, 0.3)

# ── 2. instrumentos ──────────────────────────────────────────────────────────
pad = np.zeros(N); bass = np.zeros(N); arp = np.zeros(N); drums = np.zeros(N)
seg = 2 * BAR
for s in np.arange(0, TOTAL + seg, seg):
    raiz, notas = acorde(s); n = int((seg + 0.6) * SR)
    x = np.zeros(n)
    for m in notas:
        for dt in (-0.11, -0.04, 0.04, 0.11):                       # supersaw: 4 vozes desafinadas
            x += saw(hz(m) * 2 ** (dt / 12), n, rng.random())
    x = lp(x, 2200) * env_adsr(n, 0.35, 0.3, 0.8, 0.6) * 0.06
    put(pad, x, s)
    # baixo: colcheias na fundamental (sub + serra filtrada)
    for k in range(int(seg / (BEAT / 2))):
        tb = s + k * BEAT / 2; nb = int(BEAT / 2 * 0.9 * SR); f = hz(raiz - 24)
        y = (np.sin(2 * np.pi * f * np.arange(nb) / SR) * 0.8 + lp(saw(f * 2, nb), 700) * 0.25) * env_adsr(nb, 0.005, 0.05, 0.8, 0.04)
        put(bass, y, tb, 0.32)
    # arpejo em semicolcheias: notas do acorde em duas oitavas
    ordem = [0, 1, 2, 3, 2, 1, 0, 2]
    for k in range(int(seg / (BEAT / 4))):
        ta = s + k * BEAT / 4; na = int(0.22 * SR)
        m = notas[ordem[k % 8]] + (12 if (k // 8) % 2 else 0) + 12
        q = np.sign(np.sin(2 * np.pi * hz(m) * np.arange(na) / SR)) * 0.6 + saw(hz(m) * 1.003, na) * 0.4
        put(arp, lp(q, 3200) * np.exp(-np.arange(na) / SR / 0.06), ta, 0.05 * (1.0 if k % 4 == 0 else 0.7))

def kick():
    n = int(0.42 * SR); t_ = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t_ / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t_ / 0.16) + hp(rng.standard_normal(n), 3000) * np.exp(-t_ / 0.004) * 0.3
def hat(d=0.04): n = int(0.12 * SR); return hp(rng.standard_normal(n), 7000) * np.exp(-np.arange(n) / SR / d)
def clap():
    n = int(0.25 * SR); x = bp(rng.standard_normal(n), 900, 2500) * np.exp(-np.arange(n) / SR / 0.06)
    for d in (0.012, 0.024): x[int(d * SR):] += bp(rng.standard_normal(n - int(d * SR)), 900, 2500) * np.exp(-np.arange(n - int(d * SR)) / SR / 0.01) * 0.6
    return x
K, H, CL = kick(), hat(), clap()
kicks = []
for b in np.arange(0, TOTAL, BEAT):
    lv = cheio[min(N - 1, int(b * SR))]
    if lv > 0.5:
        put(drums, K, b, 0.55); kicks.append(b)
        put(drums, H, b + BEAT / 2, 0.11)
        if int(round(b / BEAT)) % 2 == 1: put(drums, CL, b, 0.16)
    put(drums, H, b + BEAT / 4, 0.035 * lv); put(drums, H, b + 3 * BEAT / 4, 0.035 * lv)

# pump de sidechain no pad e no baixo
pump = np.ones(N)
for k in kicks:
    i = int(k * SR); m = min(N - i, int(0.4 * SR))
    pump[i:i + m] = np.minimum(pump[i:i + m], 1 - 0.55 * np.exp(-np.arange(m) / SR / 0.11))
mus = pad * (0.55 + 0.45 * cheio) * pump + bass * cheio * pump + arp * (0.55 * intro + cheio) + drums
mus += lp(pad, 900) * intro * 0.6                               # intro e pausa: pad mais escuro

# ── 3. efeitos ───────────────────────────────────────────────────────────────
sfx = np.zeros(N)
def whoosh(d=0.7, f0=300, f1=6000):
    n = int(d * SR); x = rng.standard_normal(n); y = np.zeros(n)
    fc = np.geomspace(f0, f1, n // 2).tolist() + np.geomspace(f1, f0 * 2, n - n // 2).tolist()
    lo = bd = 0.0; q = 0.35
    for i in range(n):                                         # filtro de estado variável com corte móvel
        f = 2 * math.sin(math.pi * fc[i] / SR)
        hi = x[i] - lo - q * bd; bd += f * hi; lo += f * bd; y[i] = bd
    e = np.sin(np.linspace(0, math.pi, n)) ** 1.5
    return y / (np.abs(y).max() + 1e-9) * e
def impact():
    n = int(2.6 * SR); t_ = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 70 * np.exp(-t_ / 0.08)) / SR) * np.exp(-t_ / 0.9)
    return boom + lp(rng.standard_normal(n), 2500) * np.exp(-t_ / 0.25) * 0.35
def riser(d):
    n = int(d * SR); t_ = np.arange(n) / SR
    x = hp(rng.standard_normal(n), 1500) * (t_ / d) ** 2.2 * 0.5
    x += np.sin(2 * np.pi * np.cumsum(np.geomspace(200, 1800, n)) / SR) * (t_ / d) ** 3 * 0.15
    return x
def tique(f=2400): n = int(0.05 * SR); return np.sin(2 * np.pi * f * np.arange(n) / SR) * np.exp(-np.arange(n) / SR / 0.008)

W = whoosh()
for c in cenas[2:-1]:
    put(sfx, W, c['ini'] - 0.35, 0.22)
put(sfx, riser(3.0), t_drop - 3.0, 0.5); put(sfx, impact(), t_drop, 0.75)
put(sfx, riser(2 * BAR), t_fim - 2 * BAR, 0.55); put(sfx, impact(), t_fim, 0.85)
for p in C['gancho']['palavras']:                                # tique em cada frase do gancho
    if p['w'].lower().startswith('cada'): put(sfx, tique(1800), p['ini'], 0.18)
json.dump({'whoosh': [c['ini'] for c in cenas[2:-1]]}, open(os.path.join(B, 'sfx.json'), 'w'))

# ── 4. voz: tratamento (ffmpeg) e posicionamento ─────────────────────────────
voz = np.zeros(N)
FILTRO = 'highpass=f=75,equalizer=f=220:t=q:w=1.2:g=-2,equalizer=f=3800:t=q:w=1.4:g=3,equalizer=f=9000:t=h:w=1:g=2,' \
         'acompressor=threshold=-21dB:ratio=3.5:attack=4:release=90:makeup=3,aresample=48000'
os.makedirs(os.path.join(B, 'voz48'), exist_ok=True)
for c in cenas:
    src = os.path.join(B, 'voz', c['id'] + '.wav'); dst = os.path.join(B, 'voz48', c['id'] + '.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', FILTRO, '-ac', '1', dst], check=True)
    a, _ = sf.read(dst, dtype='float32'); put(voz, a, c['voz'], 1.0)

# ducking: música abaixa onde há voz
ev = np.abs(voz); k = int(0.25 * SR)
ev = np.convolve(ev, np.ones(k) / k, 'same'); ev = np.clip(ev / (ev.max() * 0.15), 0, 1)
duck = 1 - 0.7 * ev

fade = np.ones(N); fo = int(2.5 * SR); fe = int(TOTAL * SR); fade[fe - fo:fe] = np.linspace(1, 0, fo); fade[fe:] = 0
fi = int(0.6 * SR); fade[:fi] *= np.linspace(0, 1, fi)
musica = (mus * duck * MUS + sfx * 0.6) * fade
_v = ev > 0.5
print('voz acima da música (dB, trechos com voz):', round(20 * math.log10(np.sqrt(np.mean(voz[_v] ** 2)) / np.sqrt(np.mean(musica[_v] ** 2))), 1))
# leve largura estéreo: arpejo e pad com atraso curto num canal
L = musica + voz; R_ = np.roll(musica, int(0.011 * SR)) * 0.96 + voz
mix = np.stack([L, R_], 1)[:int(TOTAL * SR)]
mix /= np.abs(mix).max() / 0.89
sf.write(os.path.join(B, 'mix_bruto.wav'), mix.astype(np.float32), SR)
sf.write(os.path.join(B, 'musica.wav'), (musica[:int(TOTAL * SR)] / np.abs(musica).max() * 0.89).astype(np.float32), SR)
# loudness de redes sociais (−14 LUFS integrado, pico −1 dBTP)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(B, 'mix_bruto.wav'),
                '-af', 'loudnorm=I=-14:TP=-1.0:LRA=9', '-ar', '48000', os.path.join(B, 'mix.wav')], check=True)
print('mix ok')
