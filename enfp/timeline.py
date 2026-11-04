"""Beat grid for the ENFP draft, locked to the reference BGM (90 BPM, 4/4).

Beat k of the music lands at bt(k) = T0 + k * B. The music's full groove (the drop)
comes in on beat 12, and the track fades out at about 29.2 s.
"""
BPM = 90
B = 60 / BPM          # one beat  = 0.667 s
BAR = 4 * B           # one bar   = 2.667 s
T0 = 0.15             # first beat of the BGM, seconds from video start


def bt(k):
    return T0 + k * B


T = {
    "intro": 0.0,
    "arrive": bt(2),              # spark flies in
    "warm": bt(4),                # rings warm the crowd, one per beat (4..7)
    "gather": bt(8),              # everything swirls in
    "silence": bt(11.5),          # half-beat of black
    "drop": bt(12),               # 8.15  explosion + title
    "e": bt(16),                  # 10.82 E: one person lights up per beat (16..19)
    "e_light0": bt(16),
    "n": bt(20),                  # 13.48 N: tree splits every half-beat
    "f": bt(24),                  # 16.15 F
    "f_touch": bt(26),            # 17.48 touch (strong hit), warm rings 26..29
    "p": bt(30),                  # 20.15 P: a new doodle every half-beat
    "end": bt(34),                # 22.82 ending
    "pop": bt(38),                # 25.48 small firework
    "outro": bt(40),              # 26.82 logo
}
E_PEOPLE = 4
N_STEP = B / 2
P_STEP = B / 2
DUR = 29.2
