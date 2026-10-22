import sys, json
from PIL import Image
R="AKQJT98765432"
LEG={"allIn":(105,17,137),"raise":(222,107,42),"call":(135,226,109),"fold":(65,144,201)}
def hand(i,j):
    if i==j: return R[i]*2
    return R[min(i,j)]+R[max(i,j)]+('s' if j>i else 'o')
def near(p,th=3500):
    b=min(LEG,key=lambda a:sum((p[k]-LEG[a][k])**2 for k in range(3)))
    return b if sum((p[k]-LEG[b][k])**2 for k in range(3))<th else None
def lines(vals,n):
    # vals: list of darkness fraction per index; pick n+1 separators
    c=[i for i,v in enumerate(vals) if v>0.4]
    groups=[];
    for i in c:
        if groups and i-groups[-1][-1]<=2: groups[-1].append(i)
        else: groups.append([i])
    return [sum(g)/len(g) for g in groups]
def detect(px,W,H):
    # grid assumed in left 62% of width, between y 160..H
    x0,x1,y0,y1=0,int(W*0.6),int(H*0.18),H
    L=lambda x,y: sum(px[x,y])
    def dk(a,b,c): return a<0.6*min(b,c) and min(b,c)>150
    colv=[sum(dk(L(x,y),L(x-3,y),L(x+3,y)) for y in range(y0,y1,3))/((y1-y0)/3) if 3<=x<W-3 else 0 for x in range(x0,x1)]
    rowv=[sum(dk(L(x,y),L(x,y-3),L(x,y+3)) for x in range(x0,x1,3))/((x1-x0)/3) if 3<=y<H-3 else 0 for y in range(y0,y1)]
    xs=[x0+v for v in lines(colv,13)]; ys=[y0+v for v in lines(rowv,13)]
    return xs,ys
def parse(path):
    im=Image.open(path).convert('RGB'); px=im.load(); W,H=im.size
    xs,ys=detect(px,W,H)
    # keep 14 lines spaced ~evenly
    def pick(v):
        # find 12 evenly spaced inner lines, then extrapolate outer edges
        for s in range(len(v)-11):
            seg=v[s:s+12]; d=[seg[k+1]-seg[k] for k in range(11)]
            if min(d)>20 and max(d)-min(d)<4:
                st=(seg[-1]-seg[0])/11
                return [seg[0]-st]+seg+[seg[-1]+st]
        best=None
        for s in range(len(v)-13):
            seg=v[s:s+14]; d=[seg[k+1]-seg[k] for k in range(13)]
            if min(d)>20 and max(d)-min(d)<6: best=seg
        return best
    XB,YB=pick(xs),pick(ys)
    assert XB and YB,(xs,ys)
    out={}
    for i in range(13):
        for j in range(13):
            cx0=int(XB[j])+2; cx1=int(XB[j+1])-1
            cy0=int(YB[i])+2; cy1=int(YB[i+1])-1; ch=cy1-cy0
            runs=[]
            for fx in (0.04,0.96):
                x=int(cx0+(cx1-cx0)*fx); n=0; st=False
                for y in range(cy1-1,cy0-1,-1):
                    if near(px[x,y]): n+=1; st=True
                    elif st or y<cy1-4: break
                runs.append(n)
            w=min(1.0,max(runs)/ch)
            if max(runs)==0: out[hand(i,j)]={"weight":0}; continue
            cnt={a:0 for a in LEG}; tot=0
            for yy in (cy1-1,cy1-2):
                for x in range(cx0,cx1):
                    b=near(px[x,yy])
                    if b: cnt[b]+=1; tot+=1
            d={a:round(cnt[a]/tot,3) for a in LEG} if tot else {}
            d["weight"]=round(w,2); out[hand(i,j)]=d
    return out,XB,YB
def combos(h): return 6 if len(h)==2 else (4 if h[2]=='s' else 12)
if __name__=="__main__":
    d,XB,YB=parse(sys.argv[1])
    W=sum(d[h]["weight"]*combos(h) for h in d)
    print({a:round(100*sum(d[h].get(a,0)*d[h]["weight"]*combos(h) for h in d)/W,1) for a in LEG},"combos",round(W,1),"grid",[round(x) for x in XB[::13]],[round(y) for y in YB[::13]])
    if len(sys.argv)>2: json.dump(d,open(sys.argv[2],'w'))
