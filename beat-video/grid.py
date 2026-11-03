import numpy as np, json
d=np.load('env.npz'); t=d['t']; flux=d['flux']; fps=float(d['fps']); rms=d['rms']
o=flux-np.convolve(flux,np.ones(64)/64,'same'); o=np.maximum(o,0)
o=np.convolve(o,[0.25,0.5,1,0.5,0.25],'same')
def score(bpm,ph):
    P=60/bpm
    ts=np.arange(ph,28,P); ts=ts[ts>2.5]
    return np.interp(ts,t,o).mean()
res=[]
for bpm in np.arange(89,91.01,0.02):
    P=60/bpm
    for ph in np.linspace(0,P,200,endpoint=False):
        res.append((score(bpm,ph),bpm,ph))
res.sort(reverse=True); s,bpm,ph=res[0]; print(res[:3])
P=60/bpm
# 16th profile
sub=np.zeros(16)
beats=np.arange(ph,29,P)
first=beats[beats>2.0][0]
print('first beat',first)
for k in range(16):
    ts=np.arange(first+k*P/4,28,4*P)
    sub[k]=np.interp(ts,t,o).mean()
print('16th profile over bar (from first beat):',np.round(sub/sub.max(),2))
# per-bar energy
bars=np.arange(first,29,4*P)
for b in bars:
    sel=(t>=b)&(t<b+4*P)
    print(round(b,2), round(float(rms[sel].mean()),3))
json.dump({'bpm':bpm,'phase':ph,'first':first},open('grid.json','w'))
