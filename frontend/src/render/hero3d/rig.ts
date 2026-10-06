import type { GModel } from './glb';
import { ident, invert, mul, slerp, trs, type M4 } from './mat';

/** Height of the floor and of the ankle joint above the sole, in model metres. */
export const FLOOR = -0.6189;
const FOOT_H = 0.0877;

export interface PoseOpts {
  /** Remove the clip's travel (keeps the shape of the body, not where it is). */
  lockTravel: boolean;
  /** Skip the clip: use the rest (T) pose, for standing portraits. */
  rest?: boolean;
}

type V3 = [number, number, number];

/** Rotation by `a` radians about a world axis through the origin. */
export function axisRot(axis: 0 | 1 | 2, a: number): M4 {
  const m = ident();
  const c = Math.cos(a), s = Math.sin(a);
  if (axis === 0) { m[5] = c; m[6] = s; m[9] = -s; m[10] = c; }
  else if (axis === 1) { m[0] = c; m[2] = -s; m[8] = s; m[10] = c; }
  else { m[0] = c; m[1] = s; m[4] = -s; m[5] = c; }
  return m;
}

export class Rig {
  readonly n: number;
  readonly jointMats: Float32Array;
  readonly bind: Float32Array;
  readonly byName = new Map<string, number>();
  readonly names: string[] = [];
  private nodeToJoint = new Map<number, number>();
  private world: M4[];
  private hips: number;
  private hipsRest: number[];
  /** World-space rotations about a joint's own position, applied after the clip (arms down, waving...). */
  private worldRot = new Map<number, M4>();

  constructor(readonly m: GModel) {
    this.n = m.joints.length;
    this.jointMats = new Float32Array(this.n * 16);
    this.bind = new Float32Array(this.n * 3);
    this.world = m.nodes.map(() => ident());
    const tmp = ident();
    m.joints.forEach((node, j) => {
      this.nodeToJoint.set(node, j);
      const nm = m.nodes[node].name.replace('mixamorig:', '');
      this.names.push(nm);
      this.byName.set(nm, j);
      invert(tmp, m.ibm.subarray(j * 16, j * 16 + 16) as M4);
      this.bind.set([tmp[12], tmp[13], tmp[14]], j * 3);
    });
    this.hips = m.joints[this.joint('Hips')];
    this.hipsRest = m.nodes[this.hips].t.slice();
  }

  joint(name: string): number {
    const j = this.byName.get(name);
    if (j === undefined) throw new Error('no joint ' + name);
    return j;
  }

  bindPos(name: string): V3 { const j = this.joint(name); return [this.bind[j * 3], this.bind[j * 3 + 1], this.bind[j * 3 + 2]]; }

  /** A point given in bind-pose coordinates relative to a joint, carried along by the current pose. */
  point(name: string, d: V3 = [0, 0, 0]): V3 {
    const j = this.joint(name);
    const x = this.bind[j * 3] + d[0], y = this.bind[j * 3 + 1] + d[1], z = this.bind[j * 3 + 2] + d[2];
    const m = this.jointMats, b = j * 16;
    return [m[b] * x + m[b + 4] * y + m[b + 8] * z + m[b + 12], m[b + 1] * x + m[b + 5] * y + m[b + 9] * z + m[b + 13], m[b + 2] * x + m[b + 6] * y + m[b + 10] * z + m[b + 14]];
  }

  /** Replaces the post-clip rotations. Keys are joint names, values are world rotations. */
  setRotations(r: Record<string, M4>): void {
    this.worldRot.clear();
    for (const [k, v] of Object.entries(r)) this.worldRot.set(this.m.joints[this.joint(k)], v);
  }

  /** Evaluates the clip at `time` (blended with `time2` by k2) into jointMats, feet on the floor. */
  pose(time: number, o: PoseOpts, time2 = time, k2 = 0): void {
    const m = this.m;
    const T = m.nodes.map((n) => n.t.slice());
    const R = m.nodes.map((n) => n.r.slice());
    const S = m.nodes.map((n) => n.s.slice());
    if (!o.rest) {
      this.sample(time, T, R, S);
      if (k2 > 0 && time2 !== time) {
        const T2 = m.nodes.map((n) => n.t.slice());
        const R2 = m.nodes.map((n) => n.r.slice());
        const S2 = m.nodes.map((n) => n.s.slice());
        this.sample(time2, T2, R2, S2);
        for (let i = 0; i < T.length; i++) {
          for (let q = 0; q < 3; q++) { T[i][q] += (T2[i][q] - T[i][q]) * k2; S[i][q] += (S2[i][q] - S[i][q]) * k2; }
          slerp(R[i], R[i], R2[i], k2);
        }
      }
    }
    this.finish(T, R, S, o);
  }

  private sample(time: number, T: number[][], R: number[][], S: number[][]): void {
    const t = Math.min(Math.max(time, 0), this.m.duration);
    for (const c of this.m.channels) {
      const tt = c.times;
      let i = 0;
      while (i < tt.length - 2 && tt[i + 1] <= t) i++;
      const k = c.step || tt.length === 1 ? 0 : Math.min(1, Math.max(0, (t - tt[i]) / (tt[i + 1] - tt[i] || 1)));
      const w = c.path === 'rotation' ? 4 : 3;
      const j = Math.min(i + 1, tt.length - 1);
      const a = c.values.subarray(i * w, i * w + w);
      const b = c.values.subarray(j * w, j * w + w);
      const dst = c.path === 'translation' ? T[c.node] : c.path === 'rotation' ? R[c.node] : S[c.node];
      if (c.path === 'rotation') slerp(dst, a, b, k);
      else for (let q = 0; q < 3; q++) dst[q] = a[q] + (b[q] - a[q]) * k;
    }
  }

  private local = ident();
  private rot = ident();

  private finish(T: number[][], R: number[][], S: number[][], o: PoseOpts): void {
    const m = this.m;
    if (o.lockTravel && !o.rest) {
      // The Hips sit in a rotated armature: local x = sideways, y = forward, z = -up.
      T[this.hips][0] = this.hipsRest[0];
      T[this.hips][1] = this.hipsRest[1];
    }
    const walk = (i: number, parent: M4 | null): void => {
      trs(this.local, T[i], R[i], S[i]);
      if (parent) mul(this.world[i], parent, this.local);
      else this.world[i].set(this.local);
      const wr = this.worldRot.get(i);
      if (wr) {
        const w = this.world[i];
        const px = w[12], py = w[13], pz = w[14];
        const r = this.rot;
        r.set(wr);
        r[12] = px - (wr[0] * px + wr[4] * py + wr[8] * pz);
        r[13] = py - (wr[1] * px + wr[5] * py + wr[9] * pz);
        r[14] = pz - (wr[2] * px + wr[6] * py + wr[10] * pz);
        const tmp = new Float32Array(16);
        mul(tmp, r, w);
        w.set(tmp);
      }
      const j = this.nodeToJoint.get(i);
      if (j !== undefined) mul(this.jointMats.subarray(j * 16, j * 16 + 16) as M4, this.world[i], m.ibm.subarray(j * 16, j * 16 + 16) as M4);
      for (const c of m.nodes[i].children) walk(c, this.world[i]);
    };
    walk(m.root, null);
    // Feet on the floor: the game's physics decides the height, the clip only gives the shape.
    let sole = 9;
    for (const [n, off] of [['LeftToe_End', 0], ['RightToe_End', 0], ['LeftFoot', FOOT_H], ['RightFoot', FOOT_H]] as const) {
      const p = this.point(n);
      if (p[1] - off < sole) sole = p[1] - off;
    }
    const dy = FLOOR - sole;
    for (let j = 0; j < this.n; j++) this.jointMats[j * 16 + 13] += dy;
  }
}
