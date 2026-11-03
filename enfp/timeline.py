"""Shared beat grid for the ENFP draft (90 BPM, 4/4)."""
BPM = 90
B = 60 / BPM          # one beat  = 0.667 s
BAR = 4 * B           # one bar   = 2.667 s

T = {
    "intro": 0.0,
    "arrive": 1 * BAR,            # spark flies in
    "warm": 2 * BAR,              # rings warm the crowd
    "gather": 3 * BAR,            # everything pulls in
    "silence": 4 * BAR - B / 2,   # half-beat of black
    "drop": 4 * BAR,              # 10.67  explosion + title
    "e": 5 * BAR,                 # 13.33  E
    "e_light0": 5 * BAR + B,      # first person lights up
    "n": 5 * BAR + 6 * B,         # 17.33  N
    "f": 5 * BAR + 12 * B,        # 21.33  F
    "f_touch": 5 * BAR + 14 * B,  # 22.67  touch
    "p": 5 * BAR + 18 * B,        # 25.33  P
    "end": 5 * BAR + 24 * B,      # 29.33  slow ending
    "pop": 5 * BAR + 26 * B,      # 30.67  small firework
    "outro": 12 * BAR,            # 32.00  logo
}
DUR = 13 * BAR                    # 34.67 s
