import numpy as np, wave, sys, json
w=wave.open('in/audio.wav'); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
hop=256; n=1024
frames=np.lib.stride_tricks.sliding_window_view(x,n)[::hop]*np.hanning(n)
S=np.abs(np.fft.rfft(frames,axis=1))
freqs=np.fft.rfftfreq(n,1/sr)
logS=np.log1p(100*S)
flux=np.maximum(0,np.diff(logS,axis=0)).sum(1); flux=np.r_[0,flux]
low=np.maximum(0,np.diff(logS[:,freqs<150],axis=0)).sum(1); low=np.r_[0,low]
fps=sr/hop
t=np.arange(len(flux))/fps
rms=np.sqrt((frames**2).mean(1))
# tempo via autocorr
o=flux-np.convolve(flux,np.ones(32)/32,'same'); o=np.maximum(o,0)
ac=np.correlate(o,o,'full')[len(o)-1:]
lags=np.arange(len(ac))/fps
bpms=60/lags[1:]; m=(bpms>70)&(bpms<180)
best=np.argmax(ac[1:][m]); bpm=bpms[m][best]
print('bpm',bpm)
# loudness per second
for s in range(33):
    sel=(t>=s)&(t<s+1)
    print(s, round(float(rms[sel].mean()),3), round(float(low[sel].mean()),1), round(float(flux[sel].mean()),1))
np.savez('env.npz',t=t,flux=flux,low=low,rms=rms,fps=fps)
