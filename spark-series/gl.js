// gl.js — tiny WebGL2 helper: run a fragment shader into a canvas.
'use strict';
const GLVS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
const GLCOMMON = `#version 300 es
precision highp float;
out vec4 o; uniform vec2 R; uniform float T;
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 6; i++){ v += a*vn(p); p = p*2.03 + 17.1; a *= .5; } return v; }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
`;

class GLRunner {
  constructor(w, h) {
    this.c = mk(w, h);
    this.gl = this.c.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
    if (!this.gl) throw new Error('WebGL2 unavailable');
    const gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.progs = new Map(); this.texs = new Map();
  }
  prog(src) {
    if (this.progs.has(src)) return this.progs.get(src);
    const gl = this.gl, p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, GLVS], [gl.FRAGMENT_SHADER, GLCOMMON + src]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p); this.progs.set(src, p); return p;
  }
  run(src, uni = {}, tex = {}, w = this.c.width, h = this.c.height) {
    const gl = this.gl;
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    gl.viewport(0, 0, w, h);
    const p = this.prog(src); gl.useProgram(p);
    const l = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(p, 'R'), w, h);
    for (const [k, v] of Object.entries(uni)) {
      const loc = gl.getUniformLocation(p, k); if (!loc) continue;
      if (typeof v === 'number') gl.uniform1f(loc, v); else gl['uniform' + v.length + 'fv'](loc, v);
    }
    let unit = 0;
    for (const [k, cv] of Object.entries(tex)) {
      let t = this.texs.get(cv);
      gl.activeTexture(gl.TEXTURE0 + unit);
      if (!t) {
        t = gl.createTexture(); this.texs.set(cv, t); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      } else gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(gl.getUniformLocation(p, k), unit++);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.c;
  }
}
