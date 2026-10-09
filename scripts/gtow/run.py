import sys,json
from parse import parse
from PIL import Image
def combos(h): return 6 if len(h)==2 else (4 if h[2]=='s' else 12)
def legend_from(path, names, x0=640, x1=1090):
    im=Image.open(path).convert('RGB'); px=im.load()
    cols=[]
    for y in (400,700):
        for c in segcols(px,y,x0,x1):
            if not any(sum((c[k]-o[k])**2 for k in range(3))<300 for o in cols): cols.append(c)
    assert len(cols)==len(names),cols
    return dict(zip(names,cols))
def segcols(px,y,x0,x1):
    segs=[];cur=None
    for x in range(x0,x1):
        p=px[x,y]; dark=sum(p)<120
        if not dark and cur is None: cur=[x,x]
        elif not dark: cur[1]=x
        elif cur: segs.append(cur);cur=None
    if cur: segs.append(cur)
    segs=[s for s in segs if s[1]-s[0]>8]
    return [px[(s[0]+s[1])//2,y] for s in segs]
if __name__=="__main__":
    path=sys.argv[1]; names=sys.argv[2].split(',')
    lg=legend_from(path,names)
    d=parse(path,lg,x0=5,x1=633,y0=136,y1=844)
    out=sys.argv[3]
    json.dump(d,open(out,'w'))
    W=sum(d[h]["weight"]*combos(h) for h in d)
    print({a:round(100*sum(d[h].get(a,0)*d[h]["weight"]*combos(h) for h in d)/W,1) for a in names}, "combos",round(W,1))
