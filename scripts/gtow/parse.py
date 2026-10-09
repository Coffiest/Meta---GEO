import sys, json
from PIL import Image
R="AKQJT98765432"
def hand(i,j):
    if i==j: return R[i]*2
    return R[min(i,j)]+R[max(i,j)]+('s' if j>i else 'o')
def near(p,legend,th=3500):
    best=min(legend,key=lambda a:sum((p[k]-legend[a][k])**2 for k in range(3)))
    return best if sum((p[k]-legend[best][k])**2 for k in range(3))<th else None
XB=[5,52,102,150,198,247,295,343,390,440,487,536,583,633]
YB=[136,191,246,300,354,409,463,518,572,627,681,735,790,845]
def parse(path, legend, *a, **k):
    im=Image.open(path).convert('RGB'); px=im.load(); out={}
    for i in range(13):
        for j in range(13):
            cx0=XB[j]+1; cx1=XB[j+1]-1; cw=cx1-cx0
            cy0=YB[i]+1; cy1=YB[i+1]; ch=cy1-cy0-2
            # weight: colored run from bottom at side columns
            runs=[]
            for fx in (0.07,0.93):
                x=int(cx0+cw*fx); n=0
                started=False
                for y in range(int(cy1)-1,int(cy0)-1,-1):
                    if near(px[x,y],legend): n+=1; started=True
                    elif started or y<cy1-4: break
                runs.append(n)
            w=min(1.0,max(runs)/(ch+1)*1.0135)
            if max(runs)==0:
                out[hand(i,j)]={"weight":0}; continue
            cnt={a:0 for a in legend}; tot=0
            yb=int(cy1)-2
            for yy in ((yb,yb-1,yb+1,yb+2) if max(runs)<3 else (yb-1,yb-2)):
              for x in range(int(cx0),int(cx1)):
                b=near(px[x,yy],legend)
                if b: cnt[b]+=1; tot+=1
            d={a:round(cnt[a]/tot,3) for a in legend} if tot else {}
            d["weight"]=round(w,2)
            out[hand(i,j)]=d
    return out
