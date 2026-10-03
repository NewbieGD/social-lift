// Minimal GLB reader: nodes, one skin, skinned meshes and the first animation.

export interface GNode { name: string; parent: number; children: number[]; t: number[]; r: number[]; s: number[]; }
export interface GMesh { name: string; pos: Float32Array; nrm: Float32Array; joints: Uint16Array; weights: Float32Array; idx: Uint32Array; color: number[]; }
export interface GChannel { node: number; path: 'translation' | 'rotation' | 'scale'; times: Float32Array; values: Float32Array; step: boolean; }
export interface GModel { nodes: GNode[]; root: number; joints: number[]; ibm: Float32Array; meshes: GMesh[]; channels: GChannel[]; duration: number; }

const SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function parseGlb(buf: ArrayBuffer): GModel {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  let off = 12;
  let json: any = null;
  let bin = new Uint8Array(0);
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(buf, off + 8, len);
    off += 8 + len;
  }
  const read = (i: number): Float32Array | Uint16Array | Uint32Array | Uint8Array => {
    const a = json.accessors[i];
    const v = json.bufferViews[a.bufferView];
    const n = COMP[a.type];
    const csz = SIZE[a.componentType];
    const base = bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
    const stride = v.byteStride || csz * n;
    const Ctor = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : a.componentType === 5123 ? Uint16Array : Uint8Array;
    const out = new Ctor(a.count * n);
    const src = new DataView(bin.buffer);
    for (let k = 0; k < a.count; k++) {
      for (let c = 0; c < n; c++) {
        const p = base + k * stride + c * csz;
        out[k * n + c] = a.componentType === 5126 ? src.getFloat32(p, true) : a.componentType === 5125 ? src.getUint32(p, true) : a.componentType === 5123 ? src.getUint16(p, true) : src.getUint8(p);
      }
    }
    return out;
  };

  const nodes: GNode[] = json.nodes.map((n: any) => ({
    name: n.name || '', parent: -1, children: n.children || [],
    t: n.translation || [0, 0, 0], r: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1],
  }));
  nodes.forEach((n, i) => n.children.forEach((c) => (nodes[c].parent = i)));
  const skin = json.skins[0];
  const ibm = read(skin.inverseBindMatrices) as Float32Array;

  const meshes: GMesh[] = [];
  for (const nd of json.nodes) {
    if (nd.mesh === undefined) continue;
    const m = json.meshes[nd.mesh];
    const p = m.primitives[0];
    const mat = json.materials?.[p.material];
    meshes.push({
      name: m.name,
      pos: read(p.attributes.POSITION) as Float32Array,
      nrm: read(p.attributes.NORMAL) as Float32Array,
      joints: Uint16Array.from(read(p.attributes.JOINTS_0)),
      weights: read(p.attributes.WEIGHTS_0) as Float32Array,
      idx: Uint32Array.from(read(p.indices)),
      color: mat?.pbrMetallicRoughness?.baseColorFactor || [0.8, 0.8, 0.8, 1],
    });
  }

  const anim = json.animations?.[0];
  const channels: GChannel[] = [];
  let duration = 0;
  if (anim) {
    for (const ch of anim.channels) {
      const s = anim.samplers[ch.sampler];
      const times = read(s.input) as Float32Array;
      duration = Math.max(duration, times[times.length - 1]);
      channels.push({ node: ch.target.node, path: ch.target.path, times, values: read(s.output) as Float32Array, step: s.interpolation === 'STEP' });
    }
  }
  const root = json.scenes[json.scene || 0].nodes[0];
  return { nodes, root, joints: skin.joints, ibm, meshes, channels, duration };
}
