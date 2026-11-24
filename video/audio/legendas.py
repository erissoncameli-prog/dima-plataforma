"""Gera saida/legendas.srt a partir de build/linha.json (frases da locução, com os tempos reais da voz)."""
import json, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
L = json.load(open(os.path.join(R, 'build', 'linha.json'), encoding='utf-8'))
def tc(s): h, s = divmod(s, 3600); m, s = divmod(s, 60); return f'{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}'.replace(',1000', ',999')
out = []
for i, c in enumerate(L['cenas'], 1):
    out.append(f"{i}\n{tc(c['voz'])} --> {tc(c['fim_voz'] + .3)}\n{c['texto']}\n")
os.makedirs(os.path.join(R, 'saida'), exist_ok=True)
open(os.path.join(R, 'saida', 'legendas.srt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok', len(out))
