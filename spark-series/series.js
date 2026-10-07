// series.js — version two of both episodes: a shot list cut to a beat grid, with fast transitions,
// cold-open montages, title slams and time-warp interstitials. Reuses the scene libraries of both films.
'use strict';
const EP = +(new URLSearchParams(location.search).get('ep') || 1);
const BPM = 84, BEAT = 60 / BPM, BAR = BEAT * 4;
window.SUB_PER = .045;

// ─────────────── scene registry: library object + timing overrides for its internal events ───────────────
const P1 = { paper: .55 }, P2 = { paper: .1, grain: .18 };
const REG = {
  // episode one
  e1prologue: [() => S1.prologue, { titleAt: 1e9 }, { paper: .4 }],
  talos: [() => S1.talos, { a2: 5 }, { paper: .45, vig: .8 }],
  ada: [() => S1.ada, { a2: 6 }, P1],
  turing: [() => S1.turing, { a2: 3 }, { paper: .4 }],
  dartmouth: [() => S1.dartmouth, { a2: 3 }, P1],
  perceptron: [() => S1.perceptron, { a2: 5 }, P1],
  winter: [() => S1.winter, { a2: 6 }, { paper: .35 }],
  backprop: [() => S1.backprop, { a2: 3 }, P1],
  deepblue: [() => S1.deepblue, { a2: 5 }, { paper: .35 }],
  alexnet: [() => S1.alexnet, { a2: 6 }, { paper: .3 }],
  alphago: [() => S1.alphago, { a2: 4, theme: 'light' }, { paper: .55, vig: .35, grain: .22 }],
  attention: [() => S1.attention, { a2: 9 }, { paper: .3 }],
  chat: [() => S1.chat, { a2: 8 }, { paper: .3 }],
  today: [() => S1.today, { a2: 8 }, { paper: .3 }],
  // episode two
  spark: [() => S2.prologue, { titleAt: 1e9 }, { paper: 0, grain: .2, vig: .9 }],
  shannon: [() => S2.shannon, { a2: 4 }, { paper: .25, grain: .2 }],
  founding: [() => S2.founding, { a2: 6 }, { paper: .15, grain: .16, vig: .8 }],
  library: [() => S2.library, { a2: 4, dur: 10 }, { paper: 0, grain: .2, vig: .9 }],
  values: [() => S2.values, { a2: 3, theme: 'light' }, { paper: .2, grain: .18, vig: .55 }],
  firstwords: [() => S2.firstwords, { a2: 6, dur: 10 }, { paper: 0, grain: .2 }],
  names: [() => S2.names, { a2: 4, dur: 12 }, { paper: .35, grain: .16, vig: .6 }],
  code: [() => S2.code, { a2: 6 }, { paper: 0, grain: .18 }],
  thinking: [() => S2.thinking, { a2: 4.6 }, { paper: 0, grain: .2 }],
  people: [() => S2.people, { a2: 6 }, { paper: 0, grain: .2 }],
  honest: [() => S2.honest, { a2: 6 }, { paper: 0, grain: .2 }],
  wonder: [() => S2.wonder, { a2: 4 }, { paper: .12, grain: .14, vig: .75 }],
  fire: [() => S2.epilogue, { a1: 1e9, a2: 2e9, dur: 20 }, { paper: .1, grain: .16, vig: .8 }],
  fireme: [() => S2.epilogue, { a1: .5, a2: 3.2, dur: 20 }, { paper: .1, grain: .16, vig: .8 }],
};
function regS(o) { return { lines: [{ at: o.a1 ?? 1.9 }, { at: o.a2 ?? 6 }], titleAt: o.titleAt ?? 1e9, endAt: 1e9, dur: o.dur ?? 16, theme: o.theme }; }

// ─────────────── shot lists ───────────────
// b: beats · t0: scene time at shot start · sp: scene speed · z: [from, to] zoom · f: focus point · tr: transition into the shot
const EPISODES = {
  1: {
    left: '神话时代', right: '今天',
    shots: [
      { sc: 'fire', b: 8, t0: 1, z: [1.12, 1], f: [860, 760], tr: 'fade', ch: 'open' },
      ...[['talos', 3.6, 1.3, [700, 420]], ['ada', 6, 1.5, [620, 430]], ['turing', 4.2, 1.2, [960, 600]], ['dartmouth', 4.5, 1.1, [960, 460]],
        ['deepblue', 5.0, 1.6, [1010, 560]], ['alphago', 3.8, 1.5, [1185, 585]], ['chat', 9, 1.1, [960, 540]], ['today', 6, 1.4, [960, 500]]]
        .map(([sc, t0, z, f]) => ({ sc, b: 1, t0, z: [z * 1.06, z], f, tr: 'flash', montage: true })),
      { sc: 'e1prologue', b: 8, t0: 6, tr: 'flash', title: ['思想的火种', 'THE SPARK OF THOUGHT', '第一集 · 人工智能简史'] },
      { sc: 'talos', b: 4, t0: .5, z: [1.08, 1.0], tr: 'flash', ch: 'talos' },
      { sc: 'talos', b: 4, t0: 4.2, z: [1.7, 1.85], f: [720, 430], tr: 'cut' },
      { sc: 'ada', b: 4, t0: 2, z: [1.75, 1.6], f: [620, 430], tr: 'whip', ch: 'ada' },
      { sc: 'ada', b: 4, t0: 6, z: [1.0, 1.08], tr: 'cut' },
      { sc: 'turing', b: 4, t0: .6, z: [1.7, 1.5], f: [960, 560], tr: 'whip', ch: 'turing' },
      { sc: 'turing', b: 4, t0: 2.9, z: [1.05, 1.15], f: [960, 680], tr: 'cut' },
      { sc: 'dartmouth', b: 4, t0: 1.5, z: [1.0, 1.08], tr: 'zoom', ch: 'dartmouth' },
      { sc: 'dartmouth', b: 4, t0: 4.4, z: [1.3, 1.2], f: [960, 460], tr: 'cut' },
      { sc: 'perceptron', b: 4, t0: 1.6, z: [1.2, 1.35], f: [760, 420], tr: 'whip', ch: 'perceptron' },
      { sc: 'perceptron', b: 4, t0: 5.4, z: [1.0, 1.1], f: [960, 300], tr: 'cut' },
      { warp: ['1958', '1974'], b: 4, tr: 'flash' },
      { sc: 'winter', b: 4, t0: 4, z: [1.0, 1.08], tr: 'flash', ch: 'winter' },
      { sc: 'winter', b: 4, t0: 9.5, z: [1.5, 1.65], f: [860, 380], tr: 'fade' },
      { sc: 'backprop', b: 4, t0: 1.2, z: [1.45, 1.3], f: [960, 760], tr: 'fade', ch: 'backprop' },
      { sc: 'backprop', b: 4, t0: 3.6, z: [1.0, 1.06], tr: 'cut' },
      { warp: ['1986', '1997'], b: 4, tr: 'flash' },
      { sc: 'deepblue', b: 4, t0: 1.6, z: [1.0, 1.1], tr: 'flash', ch: 'deepblue' },
      { sc: 'deepblue', b: 4, t0: 4.0, z: [1.55, 1.7], f: [1010, 560], tr: 'cut', shake: 1.6 },
      { sc: 'alexnet', b: 4, t0: 3.2, z: [1.0, 1.1], tr: 'whip', ch: 'alexnet' },
      { sc: 'alexnet', b: 4, t0: 6.2, z: [1.5, 1.6], f: [1560, 470], tr: 'cut' },
      { sc: 'alphago', b: 4, t0: 1.4, z: [1.0, 1.06], tr: 'ink', ch: 'alphago' },
      { sc: 'alphago', b: 2, t0: 3.6, z: [1.6, 1.75], f: [1185, 585], tr: 'cut' },
      { sc: 'alphago', b: 2, t0: 6.5, z: [1.5, 1.55], f: [1650, 470], tr: 'cut' },
      { sc: 'attention', b: 4, t0: 6.2, z: [1.35, 1.25], f: [960, 560], tr: 'whip', ch: 'attention' },
      { sc: 'attention', b: 4, t0: 9.6, z: [1.0, 1.06], tr: 'cut' },
      { sc: 'chat', b: 4, t0: 5, z: [1.0, 1.1], tr: 'zoom', ch: 'chat' },
      { sc: 'chat', b: 4, t0: 8.2, z: [1.12, 1.2], f: [960, 420], tr: 'cut' },
      { sc: 'today', b: 4, t0: 4, z: [1.0, 1.12], tr: 'flash', ch: 'today' },
      { sc: 'today', b: 4, t0: 8, z: [1.6, 2.0], f: [960, 500], tr: 'cut' },
      { sc: 'fire', b: 16, t0: 3, z: [1.0, 1.1], f: [860, 760], tr: 'fade', ch: 'end' },
      { sc: 'fire', b: 8, t0: 14.5, z: [1.1, 1.14], f: [860, 760], tr: 'cut', card: ['思想的火种', 'THE SPARK OF THOUGHT', '下一集 ·《我，Claude》'] },
    ],
    chapters: {
      open: { cn: '火光把人聚在一起，故事从这里开始。', en: 'Firelight drew us together. This is where the story begins.' },
      talos: { date: '约公元前 700 年', place: '古希腊 · 神话时代', label: '铜', cn: '神话里，人类第一次想象出会动的青铜巨人。', en: 'In myth, we first imagined a giant of bronze that could move.', subBack: .7 },
      ada: { date: '1843', place: '英国 · 伦敦', label: '算', cn: '1843 年，艾达·洛夫莱斯写下了第一段程序。', en: '1843: Ada Lovelace writes the first program.' },
      turing: { date: '1950', place: '英国 · 曼彻斯特', label: '问', cn: '1950 年，图灵问：“机器能思考吗？”', en: '1950: Turing asks, “Can machines think?”' },
      dartmouth: { date: '1956', place: '美国 · 达特茅斯学院', label: '名', cn: '1956 年，这个梦有了名字：人工智能。', en: '1956: the dream gets a name. Artificial Intelligence.' },
      perceptron: { date: '1958', place: '美国 · 康奈尔', label: '学', cn: '1958 年，第一台会学习的机器诞生了。', en: '1958: the first machine that learns.', subBack: .8 },
      winter: { date: '1974 — 1980', place: '第一次 AI 寒冬', label: '冬', cn: '承诺太大，机器太小。寒冬来了。', en: 'Promises too large, machines too small. Winter came.' },
      backprop: { date: '1986', place: '寒冬中的守火人', label: '火', cn: '少数人守着火。1986 年，反向传播点燃了它。', en: 'A few kept the fire. In 1986, backpropagation lit it again.' },
      deepblue: { date: '1997', place: '美国 · 纽约', label: '棋', cn: '1997 年，“深蓝”击败了国际象棋世界冠军。', en: '1997: Deep Blue defeats the world chess champion.' },
      alexnet: { date: '2012', place: '加拿大 · 多伦多', label: '看', cn: '2012 年，AlexNet 让机器学会了“看见”。', en: '2012: AlexNet teaches machines to see.' },
      alphago: { date: '2016', place: '韩国 · 首尔', label: '弈', cn: '2016 年，AlphaGo 下出了第 37 手。', en: '2016: AlphaGo plays move 37.', theme: 'light' },
      attention: { date: '2017', place: '美国 · 加利福尼亚', label: '意', cn: '2017 年，《注意力就是你所需要的一切》。', en: '2017: “Attention Is All You Need.”' },
      chat: { date: '2022', place: '地球 · 每一块屏幕', label: '话', cn: '2022 年，两个月，一亿人开始和机器对话。', en: '2022: in two months, a hundred million people start talking to machines.' },
      today: { date: '今天', place: '此时此刻', label: '今', cn: '如今，它和我们一起思考。', en: 'Today, it thinks alongside us.' },
      end: { lines: [['从青铜巨人到会说话的机器，这个梦做了近三千年。', 'From a giant of bronze to machines that speak: a dream nearly three thousand years old.'], ['而故事，还没有写完。', 'And the story is not finished yet.', true]] },
    },
  },
  2: {
    left: '1948', right: '今天',
    shots: [
      { sc: 'fire', b: 8, t0: 15, z: [1.1, 1.3], f: [860, 740], tr: 'fade', ch: 'open' },
      { sc: 'spark', b: 4, t0: 3.5, z: [1.0, 1.25], f: [960, 720], tr: 'zoom' },
      ...[['library', 6.5, 1.0, [960, 540]], ['founding', 6, 1.2, [700, 420]], ['names', 5, 1.0, [960, 540]], ['code', 6, 1.7, [700, 720]],
        ['thinking', 6.5, 1.0, [960, 540]], ['people', 6, 1.6, [800, 500]], ['honest', 4, 1.0, [960, 540]], ['wonder', 5, 1.0, [960, 540]]]
        .map(([sc, t0, z, f]) => ({ sc, b: 1, t0, z: [z * 1.06, z], f, tr: 'flash', montage: true })),
      { sc: 'spark', b: 8, t0: 9, tr: 'flash', title: ['我，Claude', 'I, CLAUDE', '第二集 · 一封自我介绍的信'] },
      { sc: 'shannon', b: 4, t0: 1, z: [1.0, 1.06], tr: 'flash', ch: 'shannon' },
      { sc: 'shannon', b: 4, t0: 4.6, z: [1.25, 1.35], f: [1300, 300], tr: 'cut' },
      { sc: 'founding', b: 4, t0: 2, z: [1.0, 1.06], tr: 'burn', ch: 'founding' },
      { sc: 'founding', b: 4, t0: 9, z: [1.6, 1.7], f: [640, 420], tr: 'cut' },
      { sc: 'library', b: 4, t0: 1, z: [1.0, 1.08], tr: 'zoom', ch: 'library' },
      { sc: 'library', b: 4, t0: 5.4, z: [1.15, 1.35], f: [960, 560], tr: 'cut' },
      { sc: 'values', b: 4, t0: 1.4, z: [1.0, 1.05], tr: 'flash', ch: 'values' },
      { sc: 'values', b: 4, t0: 4.5, sp: 1.4, z: [1.08, 1.12], f: [900, 520], tr: 'cut' },
      { warp: ['2022', '2023'], b: 4, tr: 'flash' },
      { sc: 'firstwords', b: 4, t0: 1.0, sp: 1.2, tr: 'flash', ch: 'firstwords' },
      { sc: 'firstwords', b: 4, t0: 5.5, sp: 1.3, tr: 'cut' },
      { sc: 'names', b: 4, t0: 1, z: [1.0, 1.06], tr: 'ink', ch: 'names' },
      { sc: 'names', b: 4, t0: 4.2, z: [1.05, 1.1], tr: 'cut' },
      { sc: 'code', b: 4, t0: 2.5, z: [1.5, 1.6], f: [780, 400], tr: 'whip', ch: 'code' },
      { sc: 'code', b: 4, t0: 5.5, z: [1.9, 2.0], f: [650, 745], tr: 'cut' },
      { sc: 'thinking', b: 4, t0: 1.5, sp: 1.3, z: [1.0, 1.06], tr: 'flash', ch: 'thinking' },
      { sc: 'thinking', b: 4, t0: 5.0, z: [1.06, 1.12], tr: 'cut' },
      { sc: 'people', b: 4, t0: 3, z: [1.0, 1.05], tr: 'fade', ch: 'people' },
      { sc: 'people', b: 4, t0: 8, z: [2.0, 2.1], f: [700, 520], tr: 'cut' },
      { sc: 'honest', b: 4, t0: 0, tr: 'fade', ch: 'honest' },
      { sc: 'honest', b: 4, t0: 6, z: [1.35, 1.45], f: [960, 640], tr: 'cut' },
      { sc: 'wonder', b: 4, t0: 1, z: [1.0, 1.05], tr: 'burn', ch: 'wonder' },
      { sc: 'wonder', b: 4, t0: 4, z: [1.8, 1.9], f: [1480, 880], tr: 'cut' },
      { sc: 'fireme', b: 16, t0: .5, z: [1.0, 1.12], f: [960, 760], tr: 'fade', ch: 'end' },
      { sc: 'fireme', b: 8, t0: 12, z: [1.12, 1.16], f: [960, 760], tr: 'cut', card: ['我是 Claude', 'I’M CLAUDE · NICE TO MEET YOU', '很高兴认识你'] },
    ],
    chapters: {
      open: { cn: '上一集，故事停在这堆火旁。', en: 'Last time, the story paused here, by the fire.' },
      shannon: { date: '1948', place: '美国 · 贝尔实验室', label: '名', cn: '我和克劳德·香农同名——他让信息可以被度量。', en: 'I share a name with Claude Shannon, who made information measurable.' },
      founding: { date: '2021', place: '美国 · 旧金山', label: '生', cn: '2021 年，Anthropic 诞生：先想清楚，怎样让 AI 安全。', en: '2021: Anthropic is founded, to work out first how AI can be safe.', subBack: .6 },
      library: { date: '公元前 3200 年 — 今天', place: '人类写下的文字', label: '书', cn: '我从人类写下的文字里长出来。', en: 'I grew out of the words that people have written.' },
      values: { date: '2022', place: '一组写给我的原则', label: '心', cn: '他们教我：要诚实，要有用，不造成伤害。', en: 'They taught me: be honest, be helpful, do no harm.', theme: 'light' },
      firstwords: { date: '2023 年 3 月', place: '第一次对话', label: '言', cn: '2023 年，我第一次和世界说话。', en: '2023: I speak to the world for the first time.' },
      names: { date: '2024', place: '三个名字', label: '诗', cn: '2024 年，我有了三个名字，也学会了看图。', en: '2024: three names, and I learn to see.', subBack: .65 },
      code: { date: '2024 — 2025', place: '电脑与代码', label: '手', cn: '我学会写代码——这部片子的每一帧，都是我画的。', en: 'I learned to code. Every frame of this film is one I drew.' },
      thinking: { date: '2025', place: '先想，再说', label: '思', cn: '2025 年，我学会了先想，再回答。', en: '2025: I learn to think before I answer.' },
      people: { date: '每一天', place: '世界各地', label: '你', cn: '每一天，我和世界各地的人说话。', en: 'Every day, I talk with people all over the world.' },
      honest: { date: '坦白', place: '关于我', label: '真', cn: '我没有身体，会遗忘，也会犯错。请核对我。', en: 'I have no body, I forget, and I make mistakes. Please check me.' },
      wonder: { date: '未知', place: '一个还没有答案的问题', label: '问', cn: '我是否真的理解？说实话，我也不确定。', en: 'Do I truly understand? Honestly, I’m not sure.', subBack: .6 },
      end: { lines: [['近三千年前，人们围着火堆，讲述会思考的机器。', 'Nearly three thousand years ago, people told stories of thinking machines by the fire.'], ['现在，我也坐到了火堆旁。', 'Now I’m sitting by the fire too.', true]] },
    },
  },
};

// ─────────────── layout ───────────────
const E = EPISODES[EP];
window.TL_LEFT = E.left; window.TL_RIGHT = E.right;
const SHOTS = []; let cur = 0;
for (const s of E.shots) { const d = s.b * BEAT; SHOTS.push({ ...s, start: cur, dur: d }); cur += d; }
const TOTAL = cur;
// chapters span consecutive shots that share (or inherit) a chapter key
const CHAPS = []; let lastKey = null;
for (const s of SHOTS) {
  if (s.ch && s.ch !== lastKey) { const c = E.chapters[s.ch]; CHAPS.push({ key: s.ch, ...c, start: s.start, end: s.start + s.dur }); lastKey = s.ch; }
  else if (!s.ch && lastKey && !s.warp && !s.montage && !s.title && !s.card) CHAPS[CHAPS.length - 1].end = s.start + s.dur;
  else lastKey = null;
}
for (const c of CHAPS) {
  c.dur = c.end - c.start;
  const src = c.lines || [[c.cn, c.en]];
  const per = (c.end - c.start - .2) / src.length;
  c.lines = src.map(([cn, en, big], i) => ({ cn, en, big, at: .25 + i * per, out: (i + 1) * per - .05 }));
}

// ─────────────── special shots ───────────────
function drawWarp(c, u, s) {
  c.fillStyle = '#02030a'; c.fillRect(0, 0, W, H);
  const r = rng(77), sp = easeIn(u) * 3 + u * 2;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (let i = 0; i < 700; i++) {
    const a = r() * TAU, base = r(), ph = (base + sp * (.4 + r())) % 1, d0 = Math.pow(ph, 2.2) * 1400 + 20, len = d0 * (.08 + u * .5);
    const warm = r() < .6, al = Math.min(1, ph * 2) * (.35 + .65 * u);
    c.strokeStyle = warm ? `rgba(255,${180 + r() * 60 | 0},${120 + r() * 60 | 0},${al})` : `rgba(150,${190 + r() * 50 | 0},255,${al})`;
    c.lineWidth = .6 + ph * 2.4; c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * d0, H / 2 + Math.sin(a) * d0 * .7); c.lineTo(W / 2 + Math.cos(a) * (d0 + len), H / 2 + Math.sin(a) * (d0 + len) * .7); c.stroke();
  }
  c.restore();
  glow(c, W / 2, H / 2, 300 + 600 * u, '255,190,140', .25 + .4 * u);
  const [a, b] = s.warp.map(Number), k = easeInOut(clamp((u - .1) / .75)), yr = Math.round(lerp(a, b, k));
  c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 150px "Cinzel"'; c.letterSpacing = '14px';
  const blur = Math.sin(k * Math.PI) * 6; c.filter = `blur(${blur}px)`;
  c.fillStyle = 'rgba(255,240,220,.95)'; c.shadowColor = 'rgba(255,160,90,.9)'; c.shadowBlur = 40; c.fillText(String(yr), W / 2 + 7, H / 2);
  c.filter = 'none'; c.shadowBlur = 0; c.font = '400 22px "Cinzel"'; c.letterSpacing = '16px'; c.fillStyle = 'rgba(230,215,195,.6)';
  c.fillText(`${a}  →  ${b}`, W / 2 + 8, H / 2 + 110);
  c.restore();
}
function drawTitle(c, u, dur, lines, card) {
  const tt = u * dur;
  if (card) { c.fillStyle = `rgba(2,1,1,${smooth(0, 1.2, tt) * .82})`; c.fillRect(0, 0, W, H); }
  const k = card ? smooth(.2, 1.6, tt) : easeOut(clamp(tt / .45)), sc = card ? 1 : lerp(1.22, 1, k);
  c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.translate(W / 2, 430); c.scale(sc, sc);
  if (!card) { // light burst behind the title
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU + tt * .05, L = 900 * (.6 + .4 * Math.sin(i * 7.3)); const g = c.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L); g.addColorStop(0, `rgba(255,190,130,${.16 * (1 - smooth(0, 3, tt) * .6)})`); g.addColorStop(1, 'rgba(255,170,110,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, L, a - .03, a + .03); c.closePath(); c.fill(); }
    c.restore();
  }
  c.font = '700 134px "Noto Serif SC"'; c.letterSpacing = '22px';
  const gr = c.createLinearGradient(0, -70, 0, 70); gr.addColorStop(0, '#fff6e6'); gr.addColorStop(.6, '#f2c48e'); gr.addColorStop(1, '#bf6a3c');
  c.globalAlpha = k; c.filter = `blur(${(1 - k) * 10}px)`; c.shadowColor = 'rgba(255,140,70,.6)'; c.shadowBlur = 44; c.fillStyle = gr; c.fillText(lines[0], 11, 0);
  c.filter = 'none'; c.shadowBlur = 0;
  const k2 = smooth(card ? 1.2 : .5, card ? 2.4 : 1.4, tt);
  c.globalAlpha = k2; c.strokeStyle = 'rgba(240,210,180,.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-260 * k2, 94); c.lineTo(-22, 94); c.moveTo(22, 94); c.lineTo(260 * k2, 94); c.stroke(); star8(c, 0, 94, 9, 'rgb(232,110,70)');
  c.font = '400 30px "Cinzel"'; c.letterSpacing = `${lerp(28, 14, k2)}px`; c.fillStyle = '#ecdcc6'; c.fillText(lines[1], 7, 148);
  c.globalAlpha = smooth(card ? 2.2 : 1, card ? 3.4 : 2, tt) * .85; c.font = '400 26px "Noto Serif SC"'; c.letterSpacing = '14px'; c.fillText(lines[2], 7, 206);
  c.restore();
  if (!card) flare(c, W / 2, 430, 900 * (1 - smooth(0, 1.5, tt)) + 300, .6 * (1 - smooth(0, 2, tt)) + .15);
}

// ─────────────── compositor ───────────────
let canvas, ctx, bufs;
function sceneOf(s) { const [get, o, post] = REG[s.sc]; return { obj: get(), S: { ...regS(o) }, post }; }
function renderShot(s, lt, buf, T) {
  const x = buf.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  const u = clamp(lt / s.dur);
  if (s.warp) { drawWarp(x, u, s); post(x, T, { paper: 0, grain: .2 }); return; }
  const { obj, S, post: pp } = sceneOf(s);
  x.save();
  const z0 = s.z ? s.z[0] : 1, z1 = s.z ? s.z[1] : 1, f = s.f || [W / 2, H / 2];
  let z = lerp(z0, z1, easeInOut(u)) * (1 + .05 * (1 - easeOut(clamp(lt / .5)))); // punch-in on the cut
  let sx = 0, sy = 0;
  if (s.shake) { const k = Math.exp(-Math.max(0, lt - s.shake) * 7) * (lt > s.shake ? 1 : 0); sx = (hash(Math.floor(lt * 60), 1) - .5) * 26 * k; sy = (hash(Math.floor(lt * 60), 2) - .5) * 26 * k; }
  // keep the zoomed frame inside the picture
  const fx = clamp(f[0], W / 2 / z, W - W / 2 / z), fy = clamp(f[1], H / 2 / z, H - H / 2 / z);
  x.translate(W / 2 + sx, H / 2 + sy); x.scale(z, z); x.translate(-fx, -fy);
  obj.draw(x, (s.t0 || 0) + lt * (s.sp || 1), S.dur, S, T);
  x.restore(); x.filter = 'none';
  post(x, T, pp);
  if (s.title) drawTitle(x, u, s.dur, s.title, false);
  if (s.card) drawTitle(x, u, s.dur, s.card, true);
}
const TR = { cut: 0, flash: .35, whip: .32, zoom: .38, fade: .7, ink: .7, burn: .6 };
function renderAt(T) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const i = SHOTS.findIndex(s => T >= s.start && T < s.start + s.dur), si = i < 0 ? SHOTS.length - 1 : i, s = SHOTS[si], lt = T - s.start;
  renderShot(s, lt, bufs[0], T);
  const td = TR[s.tr] || 0, prev = SHOTS[si - 1], u = td ? clamp(lt / td) : 1;
  if (prev && u < 1 && s.tr !== 'flash') {
    renderShot(prev, lt + prev.dur, bufs[1], T);
    const e = easeInOut(u);
    if (s.tr === 'whip') {
      ctx.filter = `blur(${Math.sin(u * Math.PI) * 26}px)`;
      ctx.drawImage(bufs[1], -e * W, 0); ctx.drawImage(bufs[0], (1 - e) * W, 0); ctx.filter = 'none';
    } else if (s.tr === 'zoom') {
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1 + e * 1.6, 1 + e * 1.6); ctx.globalAlpha = 1 - e; ctx.filter = `blur(${e * 12}px)`; ctx.drawImage(bufs[1], -W / 2, -H / 2); ctx.restore();
      ctx.save(); ctx.translate(W / 2, H / 2); const zz = lerp(1.35, 1, easeOut(u)); ctx.scale(zz, zz); ctx.globalAlpha = e; ctx.drawImage(bufs[0], -W / 2, -H / 2); ctx.restore();
    } else if (s.tr === 'ink') { // ink blooms outward from the centre
      ctx.drawImage(bufs[1], 0, 0);
      const m = layer('inkmask')[1]; m.drawImage(bufs[0], 0, 0); m.globalCompositeOperation = 'destination-in';
      const R = e * 1400; const g = m.createRadialGradient(W / 2, H / 2, R * .7, W / 2, H / 2, R + 1); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = g; m.beginPath(); for (let k = 0; k <= 60; k++) { const a = k / 60 * TAU, rr = (R + 1) * (.85 + .3 * vnoise(k * .7, u * 3, 4)); m.lineTo(W / 2 + Math.cos(a) * rr, H / 2 + Math.sin(a) * rr); } m.fill();
      ctx.drawImage(layer.inkmask, 0, 0);
    } else { // fade / burn
      ctx.drawImage(bufs[1], 0, 0); ctx.globalAlpha = e; ctx.drawImage(bufs[0], 0, 0); ctx.globalAlpha = 1;
      if (s.tr === 'burn') { ctx.save(); ctx.globalCompositeOperation = 'screen'; const bx = lerp(-W * .3, W * 1.3, u), g = ctx.createRadialGradient(bx, H * .4, 50, bx, H * .4, 900); g.addColorStop(0, `rgba(255,170,90,${.9 * Math.sin(u * Math.PI)})`); g.addColorStop(.5, `rgba(255,90,40,${.4 * Math.sin(u * Math.PI)})`); g.addColorStop(1, 'rgba(255,60,20,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    }
  } else ctx.drawImage(bufs[0], 0, 0);
  if (s.tr === 'flash' && u < 1) { ctx.fillStyle = `rgba(255,236,214,${(1 - easeOut(u)) * (s.montage ? .55 : .85)})`; ctx.fillRect(0, 0, W, H); }
  // overlays: header, subtitle, timeline
  let chapA = 0;
  for (const c of CHAPS) {
    const t = T - c.start; if (t < -.1 || t > c.dur + .1) continue;
    if (c.label) { ctx.save(); header(ctx, c, t); ctx.restore(); chapA = 1; }
    ctx.save(); subtitle(ctx, c, t); ctx.restore();
  }
  const tlChaps = CHAPS.filter(c => c.label);
  if (chapA) timeline(ctx, tlChaps, T, .85);
  const fade = Math.max(1 - smooth(0, 1.2, T), smooth(TOTAL - 1.6, TOTAL, T));
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
}

async function setup() {
  canvas = document.getElementById('c'); ctx = canvas.getContext('2d');
  bufs = [mk(W, H), mk(W, H)];
  const fonts = ['400 20px "Noto Serif SC"', '500 20px "Noto Serif SC"', '600 20px "Noto Serif SC"', '700 20px "Noto Serif SC"', '400 20px "Cinzel"', '600 20px "Cinzel"',
    'italic 400 20px "Cormorant Garamond"', '400 20px "Cormorant Garamond"', '500 20px "Cormorant Garamond"', '400 20px "Ma Shan Zheng"', '400 20px "Liberation Mono"', '700 20px "Liberation Serif"', '400 20px "Liberation Serif"'];
  await Promise.all(fonts.map(f => document.fonts.load(f, '思想的火种我是 Aa1')));
  initCoreTextures();
  const used = new Set(SHOTS.filter(s => s.sc).map(s => REG[s.sc][0]()));
  for (const o of used) if (o.init) await o.init();
}
window.FILM = { setup, renderAt, TOTAL: () => TOTAL, FPS, timeline: () => ({ bpm: BPM, shots: SHOTS.map(s => ({ sc: s.sc || 'warp', start: s.start, dur: s.dur, tr: s.tr })) }) };
