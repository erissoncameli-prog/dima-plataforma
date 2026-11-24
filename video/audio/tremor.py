"""Mede a fluidez do movimento num trecho do vídeo: deslocamento quadro a quadro (correlação de fase) numa região
do fundo. Movimento fluido = deslocamentos quase iguais; tremor = idas e vindas (2ª diferença alta).
uso: python audio/tremor.py video.mp4 inicio fim [x0 y0 x1 y1]
"""
import sys, subprocess, numpy as np
arq, ini, fim = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
x0, y0, x1, y1 = map(int, sys.argv[4:8]) if len(sys.argv) > 7 else (60, 60, 700, 420)
W, H = 1920, 1080
p = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(ini), '-to', str(fim), '-i', arq, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True)
q = np.frombuffer(p.stdout, np.uint8).reshape(-1, H, W)[:, y0:y1, x0:x1].astype(np.float32)
jan = np.outer(np.hanning(q.shape[1]), np.hanning(q.shape[2]))
def desloc(a, b):
    A, Bf = np.fft.fft2((a - a.mean()) * jan), np.fft.fft2((b - b.mean()) * jan)
    R = A * np.conj(Bf); R /= np.abs(R) + 1e-9
    c = np.fft.ifft2(R).real; i = np.unravel_index(np.argmax(c), c.shape)
    dy, dx = [v if v < s / 2 else v - s for v, s in zip(i, c.shape)]
    # refino subpixel (parábola)
    def par(m, z, p_): return 0.5 * (m - p_) / (m - 2 * z + p_) if (m - 2 * z + p_) != 0 else 0
    ly, lx = i
    sy = par(c[(ly - 1) % c.shape[0], lx], c[ly, lx], c[(ly + 1) % c.shape[0], lx]); sx = par(c[ly, (lx - 1) % c.shape[1]], c[ly, lx], c[ly, (lx + 1) % c.shape[1]])
    return dx + sx, dy + sy
d = np.array([desloc(q[i], q[i + 1]) for i in range(len(q) - 1)])
v = np.hypot(d[:, 0], d[:, 1]); a2 = np.abs(np.diff(d, axis=0)).sum(1)
print(f'quadros {len(q)} · deslocamento médio {v.mean():.2f} px/quadro · tremor (variação média entre quadros) {a2.mean():.2f} px · pior {a2.max():.2f} px')
