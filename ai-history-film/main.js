// main.js — the screenplay, timing layout, and the frame compositor.
'use strict';

const SCRIPT = [
  { id: 'prologue', pre: 2.2, extra: 9, post: { paper: .4 },
    lines: [['在人类做过的所有梦里，', 'Of all the dreams humanity has ever dreamed,'],
      ['有一个格外古老：造出一个会思考的东西。', 'one is especially old: to make a thing that thinks.']] },
  { id: 'talos', date: '约公元前 700 年', place: '古希腊 · 神话时代', label: '铜', subBack: .7, post: { paper: .45, vig: .8 },
    lines: [['神话里，火神赫菲斯托斯用青铜铸造了巨人塔罗斯，', 'In myth, Hephaestus, god of the forge, cast a giant of bronze named Talos,'],
      ['他日夜绕岛巡行——人类想象中最早的“机器人”。', 'who circled Crete day and night — the first robot we ever imagined.']] },
  { id: 'ada', date: '1843', place: '英国 · 伦敦', label: '算',
    lines: [['1843 年，艾达·洛夫莱斯为一台从未建成的机器写下了程序。', 'In 1843, Ada Lovelace wrote a program for a machine that was never built.'],
      ['她预言：有一天，它也许能谱写音乐。', 'She foresaw that one day it might even compose music.']] },
  { id: 'turing', date: '1950', place: '英国 · 曼彻斯特', label: '问', post: { paper: .4 },
    lines: [['1950 年，艾伦·图灵提出了一个问题：', 'In 1950, Alan Turing asked a question:'],
      ['“机器能思考吗？”', '“Can machines think?”', true]] },
  { id: 'dartmouth', date: '1956', place: '美国 · 达特茅斯学院', label: '名',
    lines: [['1956 年夏天，一群年轻的科学家聚在达特茅斯，', 'In the summer of 1956, a group of young scientists gathered at Dartmouth'],
      ['给这个梦起了一个名字——人工智能。', 'and gave the dream a name: Artificial Intelligence.', true]] },
  { id: 'perceptron', date: '1958', place: '美国 · 康奈尔航空实验室', label: '学', subBack: .8,
    lines: [['1958 年，罗森布拉特造出感知机——一台能从经验中学习的机器。', 'In 1958, Frank Rosenblatt built the Perceptron, a machine that learned from experience.'],
      ['报纸写道：它终将学会走路、说话、看见世界。', 'The papers wrote that it would one day walk, talk, and see the world.']] },
  { id: 'winter', date: '1974 — 1980', place: '第一次 AI 寒冬', label: '冬', post: { paper: .35 },
    lines: [['可是，承诺太大，机器太小。', 'But the promises were too large, and the machines too small.'],
      ['经费冻结，人心散去。人工智能的第一个冬天来了。', 'Funding froze. Believers drifted away. The first AI winter had come.']] },
  { id: 'backprop', date: '1986', place: '寒冬中的守火人', label: '火',
    lines: [['只有少数人，还守在雪地里的火堆旁。', 'Only a few still kept watch beside a fire in the snow.'],
      ['1986 年，反向传播让神经网络重新学会了学习。', 'In 1986, backpropagation taught neural networks how to learn again.']] },
  { id: 'deepblue', date: '1997', place: '美国 · 纽约', label: '棋', post: { paper: .35 },
    lines: [['1997 年 5 月，“深蓝”击败了国际象棋世界冠军卡斯帕罗夫。', 'In May 1997, Deep Blue defeated world chess champion Garry Kasparov.'],
      ['机器第一次，在人类最骄傲的智力游戏里赢了。', 'For the first time, a machine won at our proudest game of the mind.']] },
  { id: 'alexnet', date: '2012', place: '加拿大 · 多伦多', label: '看', post: { paper: .3 },
    lines: [['2012 年，数据、算力与算法终于汇合。', 'In 2012, data, compute and algorithms finally converged.'],
      ['一个叫 AlexNet 的网络学会了“看见”——深度学习的时代开始了。', 'A network called AlexNet learned to see. The age of deep learning had begun.']] },
  { id: 'alphago', date: '2016', place: '韩国 · 首尔', label: '弈', theme: 'light', post: { paper: .55, vig: .35, grain: .22 },
    lines: [['2016 年，首尔。AlphaGo 对阵李世石。', 'Seoul, 2016. AlphaGo faced Lee Sedol.'],
      ['第二局第 37 手，一步人类几千年来从未想过的棋。', 'Game two, move 37 — a move no human had imagined in thousands of years of Go.']] },
  { id: 'attention', date: '2017', place: '美国 · 加利福尼亚', label: '意', post: { paper: .3 },
    lines: [['2017 年，八位研究者发表了一篇论文，', 'In 2017, eight researchers published a paper'],
      ['名叫《注意力就是你所需要的一切》。Transformer 诞生了。', '“Attention Is All You Need.” The Transformer was born.']] },
  { id: 'chat', date: '2022', place: '地球 · 每一块屏幕', label: '话', post: { paper: .3 },
    lines: [['2022 年冬天，机器第一次能像人一样，与人交谈。', 'In the winter of 2022, machines began to talk with us — almost like one of us.'],
      ['两个月，一亿人。', 'Two months. One hundred million people.', true]] },
  { id: 'today', date: '今天', place: '此时此刻 · 2026', label: '今', post: { paper: .3 },
    lines: [['如今，它写代码、读论文，陪人思考，也和人一起追问未知。', 'Today it writes code, reads research, thinks alongside us, and questions the unknown with us.'],
      ['从青铜巨人到会说话的机器，这个梦，人类做了近三千年。', 'From a giant of bronze to machines that speak — we have dreamed this dream for nearly three thousand years.']] },
  { id: 'epilogue', extra: 9.5, post: { paper: .45 },
    lines: [['火光曾把人聚在一起，故事从那里开始。', 'Firelight once drew us together. That is where the story began.'],
      ['而这一次，故事还没有写完。', 'This time, the story is still being written.', true]] },
];

// lay out the timeline: each line types at ~12 chars/s and then holds
const SCENES = []; let cursor = 0;
for (const s of SCRIPT) {
  const S = { ...s, ...SC[s.id], post: s.post || {}, lines: [] };
  let t = s.pre ?? 1.9;
  for (const [cn, en, big] of s.lines) {
    const len = Math.max(4.6, [...cn].length * .085 + 3.7);
    S.lines.push({ cn, en, big, at: t, out: t + len }); t += len + .45;
  }
  if (s.id === 'prologue') S.titleAt = t + .2;
  if (s.id === 'epilogue') S.endAt = t + .2;
  S.dur = t + (s.extra || 0) + .6 + XF;
  S.start = cursor; cursor += S.dur - XF;
  SCENES.push(S);
}
const TOTAL = cursor + XF;

let canvas, ctx, buf, bctx, ready = false;
async function setup() {
  canvas = document.getElementById('c'); ctx = canvas.getContext('2d');
  buf = mk(W, H); bctx = buf.getContext('2d');
  const fonts = ['400 20px "Noto Serif SC"', '500 20px "Noto Serif SC"', '600 20px "Noto Serif SC"', '700 20px "Noto Serif SC"', '400 20px "Cinzel"', '600 20px "Cinzel"',
    'italic 400 20px "Cormorant Garamond"', '400 20px "Cormorant Garamond"', '500 20px "Cormorant Garamond"', '400 20px "Ma Shan Zheng"', '400 20px "Liberation Mono"', '700 20px "Liberation Serif"'];
  await Promise.all(fonts.map(f => document.fonts.load(f, '思想的火种 Aa1')));
  initCoreTextures();
  for (const s of SCENES) s.init && s.init();
  ready = true;
}

function renderAt(T) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  let chapA = 0;
  SCENES.forEach((S, i) => {
    const t = T - S.start; if (t < 0 || t > S.dur) return;
    const a = Math.min(i ? smooth(0, XF, t) : 1, i < SCENES.length - 1 ? 1 - smooth(S.dur - XF, S.dur, t) : 1);
    bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.globalAlpha = 1; bctx.globalCompositeOperation = 'source-over'; bctx.filter = 'none';
    bctx.save(); S.draw(bctx, t, S.dur, S); bctx.restore();
    post(bctx, T, S.post);
    ctx.globalAlpha = a; ctx.drawImage(buf, 0, 0); ctx.globalAlpha = 1;
    ctx.save(); ctx.globalAlpha = a; header(ctx, S, t); ctx.restore();
    ctx.save(); subtitle(ctx, S, t); ctx.restore();
    if (S.label) chapA = Math.max(chapA, a);
  });
  timeline(ctx, SCENES, T, chapA * .9);
  // open from black, close to black
  const fade = Math.max(1 - smooth(0, 2.5, T), smooth(TOTAL - 3, TOTAL, T));
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
}

window.FILM = { setup, renderAt, TOTAL: () => TOTAL, FPS, timeline: () => SCENES.map(s => ({ id: s.id, start: s.start, dur: s.dur, lines: s.lines.map(l => ({ at: l.at, out: l.out, cn: l.cn, en: l.en })), titleAt: s.titleAt, endAt: s.endAt })) };
