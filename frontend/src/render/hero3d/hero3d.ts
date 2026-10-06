// Cartoon 3D hero: skinned mannequin + clothing shells + props, drawn by a tiny GPU toon renderer.
// All coordinates here are model metres unless a name says "hero" (game units, feet at 0,0, y down).
import type { AttachPoint, Outfit } from '../hero';
import { parseGlb, type GModel } from './glb';
import { ToonGL, MAX_BONES, hex, ortho, type Draw, type Geom } from './gl';
import { ident, type M4 } from './mat';
import { cylinder, merge, superEllipsoid, type Prim } from './prims';
import { FLOOR, Rig } from './rig';

type V3 = [number, number, number];
export type FaceId = 'normal' | 'grin' | 'scared' | 'squint';

/** Game units per model metre: the 3D body is as tall as the old flat hero (head top at about -61). */
export const UNITS_PER_M = 33.5;
const CX = 0.0534, CZ = 1.40;
const HALF = 1.12;
/** Where the render canvas sits in hero coordinates (feet at 0,0). */
export const DRAW_RECT = { x: -HALF * UNITS_PER_M, y: -(0.95 + HALF) * UNITS_PER_M, w: 2 * HALF * UNITS_PER_M, h: 2 * HALF * UNITS_PER_M };

const LINE = '#3A2A30';
const SKIN = '#F0BE94';
const HAIR = '#3B2A22';
const SUIT = '#E9EEF5';

export interface FrameOpts {
  yaw: number;
  size: number;
  /** Clip phase (a blended toward b by k). Without it the rest pose is used. */
  clip?: { a: number; b: number; k: number };
  /** Post-clip world rotations by joint name (arms down, waving...). */
  rotations?: Record<string, M4>;
  /** Screen angle (hero coords, y down) the held flashlight points at. */
  torchAim?: number;
}
export interface Frame {
  canvas: HTMLCanvasElement;
  points: Record<AttachPoint, { x: number; y: number }>;
  torchTip: { x: number; y: number };
}

interface Shell { id: string; e: number; draws: Draw[]; }
interface Prop { draw: Draw; centre: V3 }

export class Hero3D {
  readonly rig: Rig;
  private gl: ToonGL;
  private geoms: Geom[] = [];
  private body: Draw[] = [];
  private shells = new Map<string, Shell>();
  private props = new Map<string, Prop>();
  private keep: number[] = [];
  private bone = new Map<string, number>();
  private bones = new Float32Array(MAX_BONES * 16);
  private vp = ident();
  private surfIdx: number;
  private outfit: Outfit | null = null;
  private yaw = 0.9;
  private torchKey = '';

  constructor(readonly model: GModel, size = 256) {
    this.rig = new Rig(model);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    this.gl = new ToonGL(canvas);
    this.surfIdx = Math.max(0, model.meshes.findIndex((m) => m.name === 'Beta_Surface'));
    this.buildBones();
    this.buildBody();
    this.buildShells();
    this.buildProps();
    this.look({ feet: 'bare', legs: 'shorts', top: 'tank', watch: false, newTorch: false, tie: false, phone: false, luxury: false, suit: false, cap: false }, 'normal');
  }

  static async load(url: string, size = 256): Promise<Hero3D> {
    const r = await fetch(url);
    if (!r.ok) throw new Error('hero model: HTTP ' + r.status);
    return new Hero3D(parseGlb(await r.arrayBuffer()), size);
  }

  get canvas(): HTMLCanvasElement { return this.gl.canvas; }

  // ---------- skeleton: 65 joints are folded to 22 (fingers -> hand, tips -> parent) ----------
  private target(name: string): string {
    if (/^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)\d$/.test(name)) return name.replace(/Hand.*$/, 'Hand');
    if (name === 'HeadTop_End') return 'Head';
    if (/Toe_End$/.test(name)) return name.replace('Toe_End', 'ToeBase');
    return name;
  }

  private jointRemap: Float32Array = new Float32Array(0);
  private buildBones(): void {
    const r = this.rig;
    const map = new Float32Array(r.n);
    for (let j = 0; j < r.n; j++) {
      const t = this.target(r.names[j]);
      if (!this.bone.has(t)) { this.bone.set(t, this.keep.length); this.keep.push(r.joint(t)); }
      map[j] = this.bone.get(t)!;
    }
    if (this.keep.length > MAX_BONES) throw new Error('too many bones: ' + this.keep.length);
    this.jointRemap = map;
  }

  private mkDraw(geom: Geom, ib: WebGLBuffer, count: number, color: string, outline: boolean): Draw {
    return { geom, ib, count, color: hex(color), outline, shell: 0, visible: true, skinned: true, model: ident(), pc: [0, 0, 0], ps: [1, 1, 1], po: [0, 0, 0] };
  }

  private buildBody(): void {
    this.model.meshes.forEach((m, mi) => {
      const n = m.pos.length / 3;
      const j = new Float32Array(n * 4);
      for (let i = 0; i < n * 4; i++) j[i] = this.jointRemap[m.joints[i]];
      const g = this.gl.geom(m.pos, m.nrm, j, m.weights);
      this.geoms.push(g);
      const idx = Uint16Array.from(m.idx);
      const surf = mi === this.surfIdx;
      // The joint rings fill the gaps of the surface: same skin colour, no outline of their own.
      this.body.push(this.mkDraw(g, this.gl.index(idx), idx.length, SKIN, surf));
    });
  }

  // ---------- clothing: parts of the body surface pushed out along the normal ----------
  private buildShells(): void {
    const names = this.rig.names;
    const meta: Record<string, { e: number; color: string }> = {};
    this.model.meshes.forEach((m, mi) => {
      const n = m.pos.length / 3;
      const dom: string[] = new Array(n);
      for (let i = 0; i < n; i++) {
        let bk = 0;
        for (let k = 1; k < 4; k++) if (m.weights[i * 4 + k] > m.weights[i * 4 + bk]) bk = k;
        dom[i] = names[m.joints[i * 4 + bk]];
      }
      const H = (i: number): number => m.pos[i * 3 + 1] - FLOOR;
      const SD = (i: number): number => Math.abs(m.pos[i * 3] - CX);
      const Z = (i: number): number => m.pos[i * 3 + 2];
      const torso = (i: number): boolean => dom[i] === 'Spine1' || dom[i] === 'Spine2' || dom[i] === 'Hips' || dom[i] === 'Spine';
      const shoulder = (i: number): boolean => dom[i] === 'LeftShoulder' || dom[i] === 'RightShoulder';
      const arm = (i: number): boolean => dom[i] === 'LeftArm' || dom[i] === 'RightArm';
      const fore = (i: number): boolean => dom[i] === 'LeftForeArm' || dom[i] === 'RightForeArm';
      const leg = (i: number): boolean => dom[i] === 'LeftUpLeg' || dom[i] === 'RightUpLeg';
      const shin = (i: number): boolean => dom[i] === 'LeftLeg' || dom[i] === 'RightLeg';
      const foot = (i: number): boolean => /^(Left|Right)(Foot|ToeBase)$/.test(dom[i]);
      const noNeck = (i: number): boolean => !(SD(i) < 0.075 && H(i) > 1.46);
      const defs: [string, number, string, (i: number) => boolean][] = [
        ['tank', 0.010, '#F1ECDF', (i) => torso(i) && H(i) >= 1.03 && H(i) <= 1.47 && SD(i) < 0.17 && noNeck(i)],
        ['shirt', 0.012, '#CFE3F5', (i) => ((torso(i) && H(i) >= 0.98 && H(i) <= 1.50 && SD(i) < 0.17) || shoulder(i) || (arm(i) && SD(i) < 0.40)) && H(i) <= 1.52 && noNeck(i)],
        ['jacket', 0.020, '#24315C', (i) => ((torso(i) && H(i) >= 0.93 && H(i) <= 1.50) || shoulder(i) || arm(i) || (fore(i) && SD(i) < 0.68)) && H(i) <= 1.52 && noNeck(i)],
        ['shorts', 0.012, '#4A6694', (i) => (leg(i) || dom[i] === 'Hips') && H(i) >= 0.64 && H(i) <= 1.02],
        ['sweats', 0.018, '#6E7685', (i) => (leg(i) || shin(i) || dom[i] === 'Hips') && H(i) >= 0.10 && H(i) <= 1.02],
        ['trousers', 0.011, '#2D3242', (i) => (leg(i) || shin(i) || dom[i] === 'Hips') && H(i) >= 0.10 && H(i) <= 1.02],
        ['slippers', 0.008, '#C9D2DD', (i) => foot(i) && H(i) <= 0.055],
        ['shoes', 0.011, '#2F6FD8', (i) => (foot(i) || shin(i)) && H(i) <= (foot(i) ? 0.13 : 0.15)],
        ['hair', 0.014, HAIR, (i) => dom[i] === 'Head' && (H(i) > 1.75 || (H(i) > 1.64 && Z(i) < 1.36))],
      ];
      for (const [id, e, color, test] of defs) {
        meta[id] = { e, color };
        const idx: number[] = [];
        for (let t = 0; t < m.idx.length; t += 3) {
          const a = m.idx[t], b = m.idx[t + 1], c = m.idx[t + 2];
          if (test(a) && test(b) && test(c)) idx.push(a, b, c);
        }
        if (!idx.length) continue;
        let sh = this.shells.get(id);
        if (!sh) { sh = { id, e, draws: [] }; this.shells.set(id, sh); }
        // Same vertex buffer as the body: the shell only chooses triangles and moves them out in the shader.
        const d = this.mkDraw(this.geoms[mi], this.gl.index(Uint16Array.from(idx)), idx.length, color, true);
        d.shell = e;
        d.visible = false;
        sh.draws.push(d);
      }
    });
  }

  // ---------- props: rigid shapes on one bone ----------
  private front(x: number, y: number, rad = 0.03): number {
    const m = this.model.meshes[this.surfIdx];
    let best = -9;
    for (let i = 0; i < m.pos.length; i += 3) {
      if (Math.abs(m.pos[i] - x) < rad && Math.abs(m.pos[i + 1] - y) < rad * 1.3 && m.pos[i + 2] > best) best = m.pos[i + 2];
    }
    return best > -9 ? best : 1.5;
  }

  private addProp(id: string, joint: string | null, prim: Prim, color: string, outline = true): void {
    const b = joint === null ? 0 : this.bone.get(this.target(joint))!;
    const n = prim.pos.length / 3;
    const j = new Float32Array(n * 4);
    const w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { j[i * 4] = b; w[i * 4] = 1; }
    const g = this.gl.geom(Float32Array.from(prim.pos), Float32Array.from(prim.nrm), j, w);
    const c: V3 = [0, 0, 0];
    for (let i = 0; i < prim.pos.length; i += 3) { c[0] += prim.pos[i]; c[1] += prim.pos[i + 1]; c[2] += prim.pos[i + 2]; }
    const d = this.mkDraw(g, this.gl.index(Uint16Array.from(prim.idx)), prim.idx.length, color, outline);
    d.visible = false;
    d.skinned = joint !== null;
    this.props.set(id, { draw: d, centre: [c[0] / n, c[1] / n, c[2] / n] });
  }

  private buildProps(): void {
    const E = superEllipsoid;
    const eyeY = 1.066;
    const zfL = this.front(CX + 0.034, eyeY), zfR = this.front(CX - 0.034, eyeY);
    const zn = this.front(CX, 1.03, 0.012), zm = this.front(CX, 0.975, 0.02);
    for (const [s, zf, tag] of [[1, zfL, 'L'], [-1, zfR, 'R']] as [number, number, string][]) {
      const x = CX + s * 0.034;
      this.addProp('eye' + tag, 'Head', E([x, eyeY, zf - 0.002], [0.018, 0.023, 0.010], 2), '#FFFFFF', false);
      this.addProp('pupil' + tag, 'Head', E([x + s * 0.001, eyeY - 0.002, zf + 0.005], [0.009, 0.014, 0.006], 2), '#1E140F', false);
      this.addProp('brow' + tag, 'Head', E([x, eyeY + 0.037, zf + 0.001], [0.022, 0.0055, 0.007], 2), HAIR, false);
    }
    this.addProp('nose', 'Head', E([CX, 1.03, zn + 0.003], [0.011, 0.016, 0.014], 2), '#E6AA84', false);
    this.addProp('mouth', 'Head', E([CX, 0.975, zm + 0.001], [0.021, 0.0065, 0.006], 2), '#5A2A24', false);
    this.addProp('cap', 'Head', E([CX, 1.112, 1.395], [0.112, 0.102, 0.152], 2, true, 16, 12), '#C8263C');
    this.addProp('capBrim', 'Head', E([CX, 1.112, 1.395 + 0.13], [0.08, 0.007, 0.072], 4), '#9E1B2E');
    this.addProp('helmet', 'Head', E([CX, 1.07, 1.40], [0.118, 0.132, 0.158], 2, false, 18, 14), '#E9EEF5');
    this.addProp('visor', 'Head', E([CX, 1.075, 1.40 + 0.152], [0.08, 0.042, 0.02], 3), '#1B2A3A');
    this.addProp('glassesL', 'Head', E([CX + 0.036, eyeY + 0.002, zfL + 0.013], [0.027, 0.022, 0.006], 4), '#121214');
    this.addProp('glassesR', 'Head', E([CX - 0.036, eyeY + 0.002, zfR + 0.013], [0.027, 0.022, 0.006], 4), '#121214');
    this.addProp('glassesB', 'Head', E([CX, eyeY + 0.008, zfL + 0.013], [0.014, 0.003, 0.004], 2), '#121214');
    const zt = this.front(CX, 0.74, 0.03);
    this.addProp('tieKnot', 'Spine2', E([CX, 0.84, zt + 0.022], [0.017, 0.014, 0.011], 3), '#C8263C');
    this.addProp('tieBlade', 'Spine2', E([CX, 0.71, zt + 0.021], [0.020, 0.088, 0.007], 4), '#C8263C');
    // The front arm (the one toward the run direction, left) holds the flashlight and wears the watch, over a sleeve or on bare skin.
    for (const jacket of [0, 1]) {
      const r = jacket ? 0.068 : 0.050;
      this.addProp('watchBand' + jacket, 'LeftForeArm', cylinder(0, [CX + 0.625, 0.822, 1.341], r, 0.034), '#C9CED8');
      this.addProp('watchFace' + jacket, 'LeftForeArm', E([CX + 0.625, 0.822 + r + 0.003, 1.341], [0.019, 0.007, 0.019], 4), '#F7F7F7');
    }
    this.addProp('phone', 'RightHand', E([CX - 0.78, 0.822, 1.341], [0.055, 0.013, 0.034], 6), '#121214');
    this.addProp('phoneScr', 'RightHand', E([CX - 0.78, 0.834, 1.341], [0.047, 0.002, 0.028], 6), '#5AA8FF', false);
    // Flashlights are built along +x with the grip at the origin; the frame moves them to the hand every frame.
    this.addProp('torch', null, merge([cylinder(0, [0.015, 0, 0], 0.022, 0.11), cylinder(0, [0.082, 0, 0], 0.031, 0.03)]), '#3B3F4A');
    this.addProp('torchNew', null, merge([cylinder(0, [0.02, 0, 0], 0.026, 0.12), cylinder(0, [0.09, 0, 0], 0.037, 0.035)]), '#DDE2EA');
  }

  // ---------- outfit / face ----------
  look(o: Outfit, face: string): void {
    const key = JSON.stringify(o) + face;
    if (key === this.torchKey) return;
    this.torchKey = key;
    this.outfit = o;
    const on = (id: string, v: boolean): void => {
      const s = this.shells.get(id);
      if (s) for (const d of s.draws) d.visible = v;
      const p = this.props.get(id);
      if (p) p.draw.visible = v;
    };
    const paint = (id: string, c: string): void => {
      const s = this.shells.get(id);
      if (s) for (const d of s.draws) d.color = hex(c);
      const p = this.props.get(id);
      if (p) p.draw.color = hex(c);
    };
    for (const id of ['tank', 'shirt', 'jacket', 'shorts', 'sweats', 'trousers', 'slippers', 'shoes']) on(id, false);
    on(o.top, true); on(o.legs, true);
    if (o.feet !== 'bare') on(o.feet, true);
    const skin = o.suit ? SUIT : SKIN;
    for (const d of this.body) d.color = hex(skin);
    paint('jacket', o.suit ? SUIT : o.luxury ? '#1B1D27' : '#24315C');
    paint('shirt', o.suit ? SUIT : '#CFE3F5');
    paint('tank', o.suit ? SUIT : '#F1ECDF');
    paint('shorts', o.suit ? SUIT : '#4A6694');
    paint('sweats', o.suit ? SUIT : '#6E7685');
    paint('trousers', o.suit ? SUIT : o.luxury ? '#17181F' : '#2D3242');
    paint('shoes', o.suit ? SUIT : o.luxury ? '#1B1B1F' : '#2F6FD8');
    paint('slippers', o.suit ? SUIT : '#C9D2DD');
    const gold = o.luxury ? '#E8C060' : null;
    paint('tieKnot', gold ?? '#C8263C'); paint('tieBlade', gold ?? '#C8263C');
    paint('watchBand0', gold ?? '#C9CED8'); paint('watchBand1', gold ?? '#C9CED8');
    on('hair', !o.suit);
    on('cap', o.cap && !o.suit); on('capBrim', o.cap && !o.suit);
    on('helmet', o.suit); on('visor', o.suit);
    for (const g of ['glassesL', 'glassesR', 'glassesB']) on(g, o.luxury && !o.suit);
    on('tieKnot', o.tie); on('tieBlade', o.tie);
    const jk = o.top === 'jacket' ? 1 : 0;
    on('watchBand0', o.watch && !jk); on('watchFace0', o.watch && !jk);
    on('watchBand1', o.watch && !!jk); on('watchFace1', o.watch && !!jk);
    on('phone', o.phone); on('phoneScr', o.phone);
    on('torch', !o.newTorch); on('torchNew', o.newTorch);
    const f: FaceId = face === 'grin' || face === 'scared' || face === 'squint' ? face : 'normal';
    for (const id of ['eyeL', 'eyeR', 'pupilL', 'pupilR', 'browL', 'browR', 'nose', 'mouth']) this.props.get(id)!.draw.visible = !o.suit;
    const set = (id: string, sc: V3, off: V3 = [0, 0, 0]): void => { const d = this.props.get(id)!.draw; d.ps = sc; d.po = off; };
    const eyes = f === 'scared' ? [1.2, 1.25] : f === 'squint' ? [1.1, 0.2] : f === 'grin' ? [1.05, 0.75] : [1, 1];
    for (const t of ['L', 'R']) {
      set('eye' + t, [eyes[0], eyes[1], 1]);
      set('pupil' + t, [f === 'scared' ? 0.7 : 1, f === 'squint' ? 0.2 : f === 'scared' ? 0.7 : 1, 1]);
      set('brow' + t, [1, 1, 1], [0, f === 'scared' ? 0.014 : f === 'squint' ? -0.008 : 0, 0]);
    }
    set('mouth', f === 'grin' ? [1.7, 2.3, 1] : f === 'scared' ? [0.7, 3.2, 1] : f === 'squint' ? [1.3, 0.8, 1] : [1, 1, 1], [0, f === 'grin' ? 0.002 : 0, 0]);
  }

  // ---------- frame ----------
  /** Projects a model-space point to hero coordinates (feet at 0,0, y down). */
  private toHero(p: V3): { x: number; y: number } {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: (c * (p[0] - CX) + s * (p[2] - CZ)) * UNITS_PER_M, y: -(p[1] - FLOOR) * UNITS_PER_M };
  }

  render(o: FrameOpts): Frame {
    const rig = this.rig;
    this.yaw = o.yaw;
    this.gl.resize(o.size);
    rig.setRotations(o.rotations ?? {});
    if (o.clip) rig.pose(o.clip.a, { lockTravel: true }, o.clip.b, o.clip.k);
    else rig.pose(0, { lockTravel: true, rest: true });
    for (let c = 0; c < this.keep.length; c++) this.bones.set(rig.jointMats.subarray(this.keep[c] * 16, this.keep[c] * 16 + 16), c * 16);

    // Flashlight in the front (left) hand, turned to the beam direction.
    const grip = rig.point('LeftHand', [0.05, 0, 0]);
    const cy = Math.cos(o.yaw), sy = Math.sin(o.yaw);
    const aim = o.torchAim ?? 0.42;
    const f: V3 = [Math.cos(aim) * cy, -Math.sin(aim), Math.cos(aim) * sy];
    const fl = Math.hypot(f[0], f[1], f[2]);
    f[0] /= fl; f[1] /= fl; f[2] /= fl;
    // side = up x f (up = +y), then up2 = f x side
    let sd: V3 = [f[2], 0, -f[0]];
    const sl = Math.hypot(sd[0], sd[1], sd[2]) || 1;
    sd = [sd[0] / sl, 0, sd[2] / sl];
    const up2: V3 = [f[1] * sd[2] - f[2] * sd[1], f[2] * sd[0] - f[0] * sd[2], f[0] * sd[1] - f[1] * sd[0]];
    for (const id of ['torch', 'torchNew']) {
      const m = this.props.get(id)!.draw.model;
      m.set([f[0], f[1], f[2], 0, up2[0], up2[1], up2[2], 0, sd[0], sd[1], sd[2], 0, grip[0], grip[1], grip[2], 1]);
    }
    const len = this.outfit?.newTorch ? 0.125 : 0.105;
    const tip = this.toHero([grip[0] + f[0] * len, grip[1] + f[1] * len, grip[2] + f[2] * len]);

    ortho(this.vp, o.yaw, CX, FLOOR + 0.95, CZ, HALF);
    const list: Draw[] = [...this.body];
    for (const s of this.shells.values()) list.push(...s.draws);
    for (const p of this.props.values()) list.push(p.draw);
    this.gl.draw(list, this.bones, this.vp, [0.35, 0.65, 0.65], hex(LINE), 0.0055);

    const P = (name: string, d: V3 = [0, 0, 0]): { x: number; y: number } => this.toHero(rig.point(name, d));
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const hips = P('Hips', [0, 0.02, 0]);
    const chest = P('Spine2', [0, 0.05, 0]);
    const points: Record<AttachPoint, { x: number; y: number }> = {
      head: P('Head', [0, 0.09, 0]),
      headTop: P('Head', [0, 0.2, 0]),
      face: P('Head', [0, 0.09, 0.11]),
      neck: P('Neck', [0, 0.04, 0]),
      torso: mid(hips, chest),
      waist: hips,
      back: P('Spine2', [0, 0, -0.13]),
      frontShoulder: P('LeftArm'),
      backShoulder: P('RightArm'),
      frontHand: P('LeftHand', [0.05, 0, 0]),
      backHand: P('RightHand', [-0.05, 0, 0]),
      wrist: P('LeftHand', [-0.09, 0, 0]),
      frontFoot: P('LeftFoot', [0, -0.05, 0.06]),
      backFoot: P('RightFoot', [0, -0.05, 0.06]),
    };
    return { canvas: this.gl.canvas, points, torchTip: tip };
  }
}
