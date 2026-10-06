// Tiny WebGL1 toon renderer: GPU skinning, 3 flat light bands, inverted-hull outline.
import type { M4 } from './mat';

export const MAX_BONES = 24;
type V3 = [number, number, number];

const VS = `
attribute vec3 a_pos; attribute vec3 a_nrm; attribute vec4 a_j; attribute vec4 a_w;
uniform mat4 u_vp; uniform mat4 u_bones[${MAX_BONES}]; uniform mat4 u_model;
uniform float u_out; uniform float u_shell; uniform float u_skin;
uniform vec3 u_pc; uniform vec3 u_ps; uniform vec3 u_po;
varying vec3 v_n;
void main(){
  vec3 p = u_pc + (a_pos - u_pc) * u_ps + u_po;
  vec4 wp; vec3 n;
  if (u_skin > 0.5) {
    mat4 m = u_bones[int(a_j.x + 0.5)] * a_w.x + u_bones[int(a_j.y + 0.5)] * a_w.y
           + u_bones[int(a_j.z + 0.5)] * a_w.z + u_bones[int(a_j.w + 0.5)] * a_w.w;
    wp = m * vec4(p, 1.0); n = (m * vec4(a_nrm, 0.0)).xyz;
  } else {
    wp = u_model * vec4(p, 1.0); n = (u_model * vec4(a_nrm, 0.0)).xyz;
  }
  n = normalize(n);
  v_n = n;
  gl_Position = u_vp * vec4(wp.xyz + n * (u_shell + u_out), 1.0);
}`;
const FS = `
precision mediump float;
varying vec3 v_n; uniform vec3 u_col; uniform vec3 u_light; uniform float u_flat;
void main(){
  float d = dot(normalize(v_n), u_light);
  float s = d > 0.30 ? 1.0 : (d > -0.25 ? 0.82 : 0.66);
  gl_FragColor = vec4(u_flat > 0.5 ? u_col : u_col * s, 1.0);
}`;

export interface Geom { pb: WebGLBuffer; nb: WebGLBuffer; jb: WebGLBuffer; wb: WebGLBuffer; }
export interface Draw {
  geom: Geom; ib: WebGLBuffer; count: number;
  color: V3; outline: boolean; shell: number; visible: boolean;
  skinned: boolean; model: Float32Array; pc: V3; ps: V3; po: V3;
}

export const hex = (h: string): V3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

export class ToonGL {
  readonly gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private a: Record<string, number> = {};

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) as WebGLRenderingContext | null;
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    const mk = (t: number, s: string): WebGLShader => {
      const sh = gl.createShader(t)!;
      gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
      return sh;
    };
    this.prog = gl.createProgram()!;
    gl.attachShader(this.prog, mk(gl.VERTEX_SHADER, VS));
    gl.attachShader(this.prog, mk(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) throw new Error('link failed');
    gl.useProgram(this.prog);
    for (const n of ['u_vp', 'u_bones', 'u_model', 'u_out', 'u_shell', 'u_skin', 'u_pc', 'u_ps', 'u_po', 'u_col', 'u_light', 'u_flat']) this.u[n] = gl.getUniformLocation(this.prog, n);
    for (const n of ['a_pos', 'a_nrm', 'a_j', 'a_w']) this.a[n] = gl.getAttribLocation(this.prog, n);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  private buf(data: Float32Array | Uint16Array, target: number): WebGLBuffer {
    const gl = this.gl;
    const b = gl.createBuffer()!;
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  }

  geom(pos: Float32Array, nrm: Float32Array, joints: Float32Array, weights: Float32Array): Geom {
    const gl = this.gl;
    return { pb: this.buf(pos, gl.ARRAY_BUFFER), nb: this.buf(nrm, gl.ARRAY_BUFFER), jb: this.buf(joints, gl.ARRAY_BUFFER), wb: this.buf(weights, gl.ARRAY_BUFFER) };
  }

  index(idx: Uint16Array): WebGLBuffer { return this.buf(idx, this.gl.ELEMENT_ARRAY_BUFFER); }

  resize(px: number): void {
    if (this.canvas.width !== px) { this.canvas.width = px; this.canvas.height = px; }
  }

  draw(list: Draw[], bones: Float32Array, vp: M4, light: V3, line: V3, lineW: number): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(this.u.u_vp, false, vp);
    gl.uniformMatrix4fv(this.u.u_bones, false, bones);
    gl.uniform3fv(this.u.u_light, light);
    const pass = (d: Draw, outline: boolean): void => {
      const g = d.geom;
      const attr = (name: string, b: WebGLBuffer, n: number): void => {
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.enableVertexAttribArray(this.a[name]);
        gl.vertexAttribPointer(this.a[name], n, gl.FLOAT, false, 0, 0);
      };
      attr('a_pos', g.pb, 3); attr('a_nrm', g.nb, 3); attr('a_j', g.jb, 4); attr('a_w', g.wb, 4);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.ib);
      gl.cullFace(outline ? gl.FRONT : gl.BACK);
      gl.uniform1f(this.u.u_out, outline ? lineW : 0);
      gl.uniform1f(this.u.u_shell, d.shell);
      gl.uniform1f(this.u.u_skin, d.skinned ? 1 : 0);
      gl.uniformMatrix4fv(this.u.u_model, false, d.model);
      gl.uniform3fv(this.u.u_pc, d.pc); gl.uniform3fv(this.u.u_ps, d.ps); gl.uniform3fv(this.u.u_po, d.po);
      gl.uniform1f(this.u.u_flat, outline ? 1 : 0);
      gl.uniform3fv(this.u.u_col, outline ? line : d.color);
      gl.drawElements(gl.TRIANGLES, d.count, gl.UNSIGNED_SHORT, 0);
    };
    for (const d of list) if (d.visible && d.outline) pass(d, true);
    for (const d of list) if (d.visible) pass(d, false);
  }
}

/** Orthographic view: looks at the character rotated by `yaw` about the vertical axis. */
export function ortho(out: M4, yaw: number, cx: number, cy: number, cz: number, halfH: number): M4 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const k = 1 / halfH, sz = -1 / 4;
  out.fill(0);
  out[0] = c * k; out[8] = s * k;
  out[5] = k;
  out[2] = -s * sz; out[10] = c * sz;
  out[12] = -(c * cx + s * cz) * k;
  out[13] = -cy * k;
  out[14] = -(-s * cx + c * cz) * sz;
  out[15] = 1;
  return out;
}
