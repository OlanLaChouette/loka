import sys, math, glob, pymupdf as fitz
ts=sys.argv[1:]
W,H=1080,1920;s=0.25;cols=6;rows=math.ceil(len(ts)/cols)
d=fitz.open();pg=d.new_page(width=W*s*cols+8*(cols+1),height=H*s*rows+8*(rows+1))
for i,t in enumerate(ts):
    r,c=divmod(i,cols);x=8+c*(W*s+8);y=8+r*(H*s+8)
    pg.insert_image(fitz.Rect(x,y,x+W*s,y+H*s),filename=f'out/apercu_{t}.png')
pg.get_pixmap(dpi=100).save('out/planche.png')
