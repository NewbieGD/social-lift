// Small procedural shapes (bind-pose coordinates, smooth normals) for props, hair and face.
export interface Prim { pos: number[]; nrm: number[]; idx: number[]; }
type V3 = [number, number, number];

/** Super-ellipsoid: p=2 ellipsoid, p=4 rounded box, p=8 almost a box. `top` keeps only the upper half. */
export function superEllipsoid(c: V3, r: V3, p = 2, top = false, nu = 14, nv = 10): Prim {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  const vEnd = top ? Math.floor(nv / 2) : nv;
  for (let j = 0; j <= vEnd; j++) {
    const th = (j / nv) * Math.PI; // 0 = +y pole
    for (let i = 0; i <= nu; i++) {
      const ph = (i / nu) * Math.PI * 2;
      const d: V3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      const f = Math.pow(Math.pow(Math.abs(d[0] / r[0]), p) + Math.pow(Math.abs(d[1] / r[1]), p) + Math.pow(Math.abs(d[2] / r[2]), p), 1 / p) || 1;
      const q: V3 = [d[0] / f, d[1] / f, d[2] / f];
      pos.push(c[0] + q[0], c[1] + q[1], c[2] + q[2]);
      const n: V3 = [0, 1, 2].map((k) => Math.sign(q[k]) * Math.pow(Math.abs(q[k] / r[k]), p - 1) / r[k]) as V3;
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      nrm.push(n[0] / l, n[1] / l, n[2] / l);
    }
  }
  const rows = vEnd;
  for (let j = 0; j < rows; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, cc = a + nu + 1, d = cc + 1;
    idx.push(a, b, cc, b, d, cc);
  }
  return orient({ pos, nrm, idx });
}

/** Cylinder along an axis, flat caps. */
export function cylinder(axis: 0 | 1 | 2, c: V3, radius: number, len: number, seg = 14): Prim {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  const u = (axis + 1) % 3, w = (axis + 2) % 3;
  const mk = (a: number, rad: number, side: number, n: V3): void => {
    const p: V3 = [c[0], c[1], c[2]];
    p[axis] += a; p[u] += Math.cos(side) * rad; p[w] += Math.sin(side) * rad;
    pos.push(...p); nrm.push(...n);
  };
  for (let i = 0; i <= seg; i++) {
    const s = (i / seg) * Math.PI * 2;
    const n: V3 = [0, 0, 0]; n[u] = Math.cos(s); n[w] = Math.sin(s);
    mk(-len / 2, radius, s, n); mk(len / 2, radius, s, n);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  for (const sgn of [-1, 1]) {
    const base = pos.length / 3;
    const n: V3 = [0, 0, 0]; n[axis] = sgn;
    const ctr: V3 = [c[0], c[1], c[2]]; ctr[axis] += (sgn * len) / 2;
    pos.push(...ctr); nrm.push(...n);
    for (let i = 0; i <= seg; i++) { const s = (i / seg) * Math.PI * 2; mk((sgn * len) / 2, radius, s, n); }
    for (let i = 0; i < seg; i++) idx.push(base, base + 1 + i, base + 2 + i);
  }
  return orient({ pos, nrm, idx });
}

/** Makes triangle winding agree with the stored normals (so back-face culling and the outline hull work). */
function orient(p: Prim): Prim {
  for (let t = 0; t < p.idx.length; t += 3) {
    const [a, b, c] = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
    const ax = p.pos[b * 3] - p.pos[a * 3], ay = p.pos[b * 3 + 1] - p.pos[a * 3 + 1], az = p.pos[b * 3 + 2] - p.pos[a * 3 + 2];
    const bx = p.pos[c * 3] - p.pos[a * 3], by = p.pos[c * 3 + 1] - p.pos[a * 3 + 1], bz = p.pos[c * 3 + 2] - p.pos[a * 3 + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const dot = nx * p.nrm[a * 3] + ny * p.nrm[a * 3 + 1] + nz * p.nrm[a * 3 + 2];
    if (dot < 0) { p.idx[t + 1] = c; p.idx[t + 2] = b; }
  }
  return p;
}

export function merge(list: Prim[]): Prim {
  const o: Prim = { pos: [], nrm: [], idx: [] };
  for (const p of list) { const b = o.pos.length / 3; o.pos.push(...p.pos); o.nrm.push(...p.nrm); for (const i of p.idx) o.idx.push(i + b); }
  return o;
}
