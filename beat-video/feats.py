# per-video-frame audio features
import numpy as np, wave
FPS=30; T0=2.0; DUR=27.6
w=wave.open('in/audio.wav'); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
N=int(DUR*FPS); n=2048
edges=np.geomspace(60,9000,25)
freqs=np.fft.rfftfreq(n,1/sr)
bands=np.zeros((N,24)); rms=np.zeros(N)
for i in range(N):
    c=int((T0+i/FPS)*sr); seg=x[max(0,c-n//2):c+n//2]
    if len(seg)<n: seg=np.pad(seg,(0,n-len(seg)))
    sp=np.abs(np.fft.rfft(seg*np.hanning(n)))
    for b in range(24):
        m=(freqs>=edges[b])&(freqs<edges[b+1]); bands[i,b]=sp[m].mean() if m.any() else 0
    rms[i]=np.sqrt((seg**2).mean())
lb=np.log1p(bands*20); 
lb=lb/np.percentile(lb,98,axis=0,keepdims=True).clip(1e-6); lb=lb.clip(0,1.2)
# attack/release smoothing
sm=np.zeros_like(lb)
for i in range(N):
    p=sm[i-1] if i else lb[0]*0
    sm[i]=np.where(lb[i]>p, p+(lb[i]-p)*0.8, p*0.82)
d=np.load('env.npz'); t=d['t']; flux=d['flux']
fl=np.interp(T0+np.arange(N)/FPS,t,np.convolve(flux,np.ones(5)/5,'same'))
fl=(fl/np.percentile(fl,97)).clip(0,1.5)
np.savez('vfeats.npz',bands=sm,rms=rms/np.percentile(rms,97),flux=fl)
print(sm.shape, sm.mean(0).round(2))
