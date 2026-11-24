import sys,glob
from PIL import Image,ImageDraw
fs=sorted(glob.glob(sys.argv[1]))
W,H=800,500; c=4; r=(len(fs)+c-1)//c
out=Image.new('RGB',(W*c,(H+30)*r),'#222')
d=ImageDraw.Draw(out)
for i,f in enumerate(fs):
    im=Image.open(f).convert('RGB'); im.thumbnail((W,H))
    x,y=(i%c)*W,(i//c)*(H+30)
    out.paste(im,(x,y+30)); d.text((x+8,y+8),f.split('/')[-1],fill='white')
out.save(sys.argv[2])
