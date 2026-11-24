"""Imagens da apresentação: fundos, telas com moldura de navegador, celular e placa de patrimônio com QR.
uso: python apresentacao/imagens.py     → build/ppt/img/*.png
"""
import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import qrcode

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEL = os.path.join(R, 'build', 'telas'); OUT = os.path.join(R, 'build', 'ppt', 'img'); os.makedirs(OUT, exist_ok=True)

def fundo(nome, glows, base=(7, 19, 13), grade=False):
    W, H = 1920, 1080
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.zeros((H, W, 3), np.float32) + np.array(base, np.float32)
    for cx, cy, r, cor, a in glows:
        d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / r
        img += np.clip(1 - d, 0, 1)[..., None] ** 2 * np.array(cor, np.float32) * a
    if grade:
        g = ((x % 80 < 1.2) | (y % 80 < 1.2)) * np.clip((y - 600) / 480, 0, 1) * 10
        img += g[..., None] * np.array([.75, 1, .45])
    rng = np.random.default_rng(3); img += rng.normal(0, 1.6, img.shape)      # grão leve (evita faixas no degradê)
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(OUT, nome), optimize=True)

fundo('bg-escuro.png', [(-100, -150, 1100, (29, 107, 64), .9), (2000, 1150, 1000, (15, 77, 92), .8), (1300, -200, 700, (90, 107, 20), .35)])
fundo('bg-secao.png', [(300, 900, 1200, (29, 107, 64), 1.2), (1800, 100, 900, (15, 77, 92), .9), (1000, 400, 600, (120, 150, 30), .35)], grade=True)

def arred(im, r):
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], r, fill=255); im.putalpha(m); return im

def moldura(nome, saida, crop=None, largura=1800, url='plataforma de gestão de projetos'):
    s = Image.open(os.path.join(TEL, nome + '.png')).convert('RGB')
    if crop:
        W, H = s.size; s = s.crop((int(crop[0] * W), int(crop[1] * H), int(crop[2] * W), int(crop[3] * H)))
    h = round(s.size[1] * largura / s.size[0]); s = s.resize((largura, h), Image.LANCZOS)
    barra = 54
    jan = Image.new('RGB', (largura, h + barra), (17, 28, 22)); d = ImageDraw.Draw(jan)
    for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]): d.ellipse([26 + i * 30, 19, 42 + i * 30, 35], fill=c)
    d.rounded_rectangle([140, 13, min(largura - 30, 900), 41], 8, fill=(30, 44, 36))
    try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 17)
    except Exception: f = ImageFont.load_default()
    d.text((158, 17), url, fill=(160, 184, 168), font=f)
    jan.paste(s, (0, barra)); jan = arred(jan.convert('RGBA'), 22)
    # borda fina e sombra
    ImageDraw.Draw(jan).rounded_rectangle([0, 0, jan.size[0] - 1, jan.size[1] - 1], 22, outline=(255, 255, 255, 40), width=2)
    pad = 60; tela = Image.new('RGBA', (jan.size[0] + 2 * pad, jan.size[1] + 2 * pad), (0, 0, 0, 0))
    sombra = Image.new('RGBA', jan.size, (0, 0, 0, 150)); sombra.putalpha(jan.split()[3].point(lambda v: v * .6))
    tela.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(22)), (pad, pad + 18)); tela = tela.filter(ImageFilter.GaussianBlur(10))
    tela.alpha_composite(jan, (pad, pad))
    tela.save(os.path.join(OUT, saida), optimize=True)
    return tela.size

TELAS = {   # saída: (captura, recorte x0,y0,x1,y1 em fração, endereço na barra)
    'dashboard': ('dashboard-financiadores', (0, 0, 1, .82), 'Visão Geral · Financiadores'),
    'tarefas-vg': ('dashboard-tarefas', (.15, 0, 1, .72), 'Visão Geral · Minhas tarefas'),
    'kanban': ('tarefas', (.15, 0, 1, .82), 'Painel de Tarefas'),
    'atividades': ('atividades', (0, 0, 1, .82), 'Atividades'),
    'tdrs': ('tdrs', (.15, 0, 1, .72), 'TDRs · Termos de Referência'),
    'matriz': ('matriz', (.15, 0, 1, .82), 'Matriz de Resultados'),
    'remanej': ('remanejamentos-pedido', (.19, .12, .81, .89), 'Remanejamento · REM-2026-007'),
    'fornecedores': ('fornecedores', (.15, 0, 1, .7), 'Fornecedores'),
    'contratos': ('contratos', (.15, 0, 1, .75), 'Contratos'),
    'contrato-det': ('contrato-detalhe', (.15, .52, 1, 1), 'Contratos · detalhe'),
    'produto-av': ('produto-avaliacao', (.06, .02, .93, .985), 'Produtos Entregues · avaliar entrega'),
    'produtos': ('produtos', (.15, 0, 1, .6), 'Produtos Entregues'),
    'financeiro': ('financeiro', (.15, 0, 1, .82), 'Execução Financeira'),
    'acervo': ('acervo', (.15, 0, 1, .82), 'Acervo Digital'),
    'patrimonio': ('patrimonio', (.15, 0, 1, .7), 'Patrimônio'),
    'viagens': ('viagens', (.15, .3, 1, 1), 'Viagens e Diárias'),
    'diagnostico': ('diagnostico', (.15, 0, 1, .82), 'Diagnóstico Socioambiental · mesa'),
    'mapa': ('mapa', (.15, .05, 1, 1), 'Mapa Interativo'),
    'auditoria': ('auditoria', (.15, 0, 1, .82), 'Auditoria IA'),
    'relatorios': ('relatorios-m1', (.38, .17, 1, 1), 'Relatórios · Central'),
    'site-home': ('site-home', (0, 0, 1, 1), 'site público · início'),
    'site-galeria': ('site-galeria', (0, 0, 1, 1), 'site público · produtos'),
    'repositorio': ('repositorio', (.15, 0, 1, .82), 'Repositório de Referências'),
    'pulso': ('pulso', (.15, 0, 1, .8), 'Pulso da Equipe'),
    'usuarios': ('usuarios', (.15, 0, 1, .7), 'Usuários e acessos'),
    'ajuda': ('ajuda', (.15, 0, 1, .82), 'Manual do sistema'),
}
tam = {}
for k, (n, c, u) in TELAS.items(): tam[k] = moldura(n, f'tela-{k}.png', c, url=u)

# celular com o app de campo
s = Image.open(os.path.join(TEL, 'diag-app.png')).convert('RGB').resize((720, 1558), Image.LANCZOS)
cel = Image.new('RGBA', (780, 1640), (0, 0, 0, 0)); d = ImageDraw.Draw(cel)
d.rounded_rectangle([0, 0, 779, 1639], 110, fill=(32, 46, 38, 255)); d.rounded_rectangle([4, 4, 775, 1635], 106, outline=(255, 255, 255, 50), width=3)
tela = arred(s.convert('RGBA'), 84); cel.alpha_composite(tela, (30, 41))
d.rounded_rectangle([300, 62, 480, 108], 23, fill=(0, 0, 0, 255))
cel.save(os.path.join(OUT, 'celular.png'), optimize=True)

# placa de patrimônio com QR (endereço de demonstração)
q = qrcode.QRCode(border=0, box_size=14); q.add_data('https://exemplo.org/pages/patrimonio.html?bem=PAT-000143'); q.make()
qi = q.make_image(fill_color=(16, 37, 26), back_color='white').convert('RGB').resize((560, 560), Image.NEAREST)
pl = Image.new('RGBA', (720, 960), (0, 0, 0, 0)); d = ImageDraw.Draw(pl); d.rounded_rectangle([0, 0, 719, 959], 36, fill=(255, 255, 255, 255))
fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30); fn = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 74)
fr = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 28)
def centro(t, y, f, cor): w = d.textlength(t, font=f); d.text(((720 - w) / 2, y), t, font=f, fill=cor)
centro('PATRIMÔNIO DO PROJETO', 50, fb, (31, 78, 44)); pl.paste(qi, (80, 120)); centro('PAT-000143', 712, fn, (16, 37, 26)); centro('Adquirido com recurso do projeto', 830, fr, (58, 90, 71))
pl.save(os.path.join(OUT, 'placa.png'), optimize=True)
import json; json.dump({k: v for k, v in tam.items()}, open(os.path.join(OUT, 'tamanhos.json'), 'w'))
print('ok', len(tam), 'telas')
