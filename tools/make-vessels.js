// Builds data/vessels.json from half-profiles (right side, top to bottom).
// Each item: ['L', halfWidth, y, cornerRadius?]  or  ['C', hw1,y1, hw2,y2, hw,y].
// Every vessel shares the same mouth: lip half-width 19 (y 54-60), neck half-width 15.
const fs = require('fs');
const LIP = [['L', 19, 54, 2.2], ['L', 19, 60, 2.2], ['L', 15, 62.5, 1]];
const V = [
  { id: 'round-flask', name: 'Round Alchemical Flask', slots: 1,
    p: [['L', 15, 85, 4], ['C', 17, 101, 61, 112, 61, 162], ['C', 61, 200, 38, 227, 21, 227]] },
  { id: 'square-vial', name: 'Apothecary Square Vial', slots: 1, faceted: true,
    p: [['L', 15, 82, 3], ['L', 47, 100, 7], ['L', 47, 227, 6]] },
  { id: 'assassin-phial', name: "Tapered Assassin's Phial", slots: 0.5,
    p: [['L', 15, 82, 2.5], ['L', 31, 97, 7], ['C', 31, 152, 15, 200, 11, 221], ['C', 9.5, 229, 4, 231, 0, 231]] },
  { id: 'teardrop-ampoule', name: 'Bulbous Tear-Drop Ampoule', slots: 1,
    p: [['L', 15, 84, 3], ['C', 15, 104, 58, 138, 58, 184], ['C', 58, 213, 34, 228, 17, 228]] },
  { id: 'hexagonal-decanter', name: 'Faceted Hexagonal Decanter', slots: 1.5, faceted: true,
    p: [['L', 15, 80, 2.5], ['L', 51, 108, 5], ['L', 51, 196, 5], ['L', 29, 227, 4]] },
  { id: 'gourd-bottle', name: 'Double-Bulb Gourd Vessel', slots: 1,
    p: [['L', 15, 78, 2], ['C', 36, 81, 40, 105, 23, 118], ['C', 50, 127, 64, 177, 49, 209], ['C', 42, 224, 27, 228, 16, 228]] },
  { id: 'gothic-reliquary', name: 'Gothic Arch Reliquary', slots: 1,
    p: [['L', 15, 80, 2], ['C', 35, 88, 46, 112, 46, 146], ['L', 46, 217, 2], ['L', 50.5, 220, 1.5], ['L', 50.5, 228, 2.5]] },
  { id: 'diamond-flagon', name: 'Diamond-Cut Flagon', slots: 1, faceted: true,
    p: [['L', 15, 82, 2.5], ['L', 58, 152, 6], ['L', 27, 228, 4]] },
  { id: 'erlenmeyer-cone', name: 'Conical Alembic Flask', slots: 1,
    p: [['L', 15, 90, 6], ['L', 61, 227, 10]] },
  { id: 'chalice-ampoule', name: 'Broad-Shoulder Chalice Vial', slots: 1.5,
    p: [['L', 15, 80, 2.5], ['L', 60, 97, 8], ['C', 60, 150, 38, 197, 24, 226], ['L', 24, 228, 1.5]] },
  { id: 'onion-bottle', name: 'Long-Necked Onion Bottle', slots: 1,
    p: [['L', 15, 104, 4], ['C', 21, 119, 65, 128, 65, 173], ['C', 65, 207, 44, 228, 23, 228]] },
  { id: 'apothecary-jar', name: 'Squat Apothecary Jar', slots: 1.5,
    p: [['L', 15, 78, 2.5], ['C', 50, 81, 60, 98, 60, 122], ['L', 60, 201, 0], ['C', 60, 220, 51, 228, 39, 228]] },
  { id: 'heart-phial', name: 'Heart-Shaped Philter', slots: 1,
    p: [['L', 13, 86, 0], ['C', 27, 73, 63, 84, 61, 126], ['C', 59, 166, 23, 197, 0, 230]] },
  { id: 'hourglass-phial', name: 'Twin-Chamber Hourglass Phial', slots: 1,
    p: [['L', 15, 80, 2], ['C', 46, 88, 46, 122, 20, 148], ['C', 46, 176, 50, 204, 45, 220], ['L', 45, 228, 5]] }
];
const f = (n) => +n.toFixed(2);
function build(profile) {
  const items = [...LIP, ...profile];
  // nodes of the right half (absolute coordinates) with how each is reached
  const right = [];
  let prev = null;
  for (const it of items) {
    if (it[0] === 'L') right.push({ x: 100 + it[1], y: it[2], r: it[3] || 0, how: 'L' });
    else right.push({ x: 100 + it[5], y: it[6], r: 0, how: 'C', c1: [100 + it[1], it[2]], c2: [100 + it[3], it[4]] });
  }
  // full closed outline: top centre -> right half down -> left half up
  const nodes = [{ x: 100, y: items[0][2], r: 0, how: 'L' }, ...right];
  const mx = (x) => 200 - x;
  for (let i = right.length - 1; i >= 0; i--) {
    const n = right[i];
    const arrive = i === right.length - 1 ? { how: 'L' } : right[i + 1].how === 'C'
      ? { how: 'C', c1: [mx(right[i + 1].c2[0]), right[i + 1].c2[1]], c2: [mx(right[i + 1].c1[0]), right[i + 1].c1[1]] }
      : { how: 'L' };
    if (i === right.length - 1 && n.x === 100) continue; // profile ended on the axis
    nodes.push({ x: mx(n.x), y: n.y, r: n.r, ...arrive });
  }
  // the node after an on-axis end must take the mirrored curve of that end
  const last = right[right.length - 1];
  if (last.x === 100 && last.how === 'C') {
    const idx = nodes.findIndex((n, k) => k > right.length && true);
    const tgt = nodes[right.length + 1];
    tgt.how = 'C'; tgt.c1 = [mx(last.c2[0]), last.c2[1]]; tgt.c2 = [mx(last.c1[0]), last.c1[1]];
  }
  let d = `M${f(nodes[0].x)},${f(nodes[0].y)}`;
  const N = nodes.length;
  for (let k = 1; k <= N; k++) {
    const n = nodes[k % N], p = nodes[(k - 1) % N], q = nodes[(k + 1) % N];
    if (k === N) { d += ' Z'; break; }
    if (n.how === 'C') { d += ` C${f(n.c1[0])},${f(n.c1[1])} ${f(n.c2[0])},${f(n.c2[1])} ${f(n.x)},${f(n.y)}`; continue; }
    if (n.r > 0 && q.how === 'L') {
      const l1 = Math.hypot(n.x - p.x, n.y - p.y), l2 = Math.hypot(q.x - n.x, q.y - n.y);
      const r = Math.min(n.r, l1 / 2, l2 / 2);
      const a = [n.x - ((n.x - p.x) / l1) * r, n.y - ((n.y - p.y) / l1) * r];
      const b = [n.x + ((q.x - n.x) / l2) * r, n.y + ((q.y - n.y) / l2) * r];
      d += ` L${f(a[0])},${f(a[1])} Q${f(n.x)},${f(n.y)} ${f(b[0])},${f(b[1])}`;
    } else d += ` L${f(n.x)},${f(n.y)}`;
  }
  return d;
}
const out = V.map((v) => {
  const o = { id: v.id, name: v.name, slots: v.slots };
  if (v.faceted) o.faceted = true;
  o.glass = build(v.p);
  return o;
});
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2) + '\n');
// quick preview sheet
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 520" width="1400" height="520"><rect width="1400" height="520" fill="#151515"/>`;
out.forEach((v, i) => { svg += `<g transform="translate(${(i % 7) * 200},${Math.floor(i / 7) * 260})"><path d="${v.glass}" fill="#2a3a36" stroke="#cfd8dc" stroke-width="2"/><text x="100" y="250" fill="#aaa" font-size="11" text-anchor="middle">${v.id}</text></g>`; });
fs.writeFileSync(process.argv[3], svg + '</svg>');
console.log(out.length, 'vessels');
