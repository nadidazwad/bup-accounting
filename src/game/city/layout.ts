// BROKER CITY: a GTA 2 Downtown-style block grid, generated deterministically.
// Pure data: no Phaser. The scene turns it into a tilemap, buildings and graphs.

export const CELL = 32;
export const ROAD = 4;            // road width in cells (two 64 px lanes)
export const BLOCK = 12;          // block size in cells, including the 1-cell pavement ring
export const PERIOD = ROAD + BLOCK;
export const BLOCKS = 7;
export const SIZE = ROAD + BLOCKS * PERIOD; // 116 cells
export const WORLD = SIZE * CELL;           // 3712 px
export const FLOOR = 22;          // world px per storey

export const enum Ground { Road, Pavement, Building, Grass, Path, Lot, Tree, Plaza, Water }

// Tileset indices (the texture generator draws exactly these).
export const Tile = {
  asphalt: 0, roadVL: 1, roadVR: 2, roadHT: 3, roadHB: 4, zebraV: 5, zebraH: 6, manhole: 7, asphalt2: 8,
  pavement: 16, // + kerb mask (N=1, E=2, S=4, W=8)
  grass: 32, grass2: 33, path: 34, lot: 35, lotLineV: 36, lotLineH: 37, base: 38, plaza: 39, water: 40, flowers: 41,
} as const;
export const TILE_COUNT = 42;

export type Rect = { x: number; y: number; w: number; h: number };
export type RoofDetail = { kind: "box" | "vent" | "sky" | "pad" | "tank"; x: number; y: number; w: number; h: number };
export type Building = Rect & { height: number; style: number; details: RoofDetail[]; sign?: string; tower?: boolean };
export type Billboard = { x: number; y: number; w: number; h: number; height: number; text: string; color: number };
export type TreeSpot = { x: number; y: number; r: number };
export type Point = { x: number; y: number };
export type ParkSpot = Point & { angle: number };
export type Dir = 0 | 1 | 2 | 3; // up, right, down, left
export const dirVec: readonly Point[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

export type PedNode = Point & { id: number; links: number[]; crossing: boolean[] };

export type CityLayout = {
  ground: Uint8Array;        // Ground per cell
  tiles: number[][];         // tileset index per cell
  solid: Uint8Array;         // 1 = blocks movement
  buildings: Building[];
  billboards: Billboard[];
  trees: TreeSpot[];
  lamps: Point[];
  parked: ParkSpot[];
  nodes: PedNode[];
  spawn: Point;
  spawnCar: ParkSpot;
  goal: Rect;
  tower: Building;
};

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const isRoadCell = (cx: number, cy: number) => cx % PERIOD < ROAD || cy % PERIOD < ROAD;
export const blockOrigin = (b: number) => b * PERIOD + ROAD; // first cell of a block (its pavement ring)
export const roadStart = (i: number) => i * PERIOD * CELL;   // px of the i-th road (vertical: x, horizontal: y)
/** Lane centre for traffic driving in `dir` on road `i` (right-hand traffic). */
export function laneCentre(i: number, dir: Dir) {
  const r = roadStart(i);
  // Southbound and westbound use the first half of the road, northbound and eastbound the second.
  return dir === 2 || dir === 3 ? r + CELL : r + 3 * CELL;
}

const BILLBOARDS = [
  "TAXES. DO THEM.", "BUPAF: BE THERE OR BE AUDITED", "BROKER & SONS: WE LOSE IT SO YOU DON'T HAVE TO",
  "DOUBLE-ENTRY? DOUBLE THE FUN.", "YOUR RECEIPTS MISS YOU", "DEPRECIATION: IT'S NOT YOU, IT'S TIME",
];

// Hand-placed landmarks; everything else is procedural.
const TOWER = { bx: 5, by: 1 };
const PARK = { bx: 3, by: 3 };
const LOTS = [{ bx: 1, by: 4 }, { bx: 5, by: 5 }, { bx: 2, by: 1 }];
const SPAWN_BLOCK = { bx: 1, by: 4 };

export function generateCity(seed = 1985): CityLayout {
  const rand = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const ground = new Uint8Array(SIZE * SIZE);
  const at = (x: number, y: number) => y * SIZE + x;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) ground[at(x, y)] = isRoadCell(x, y) ? Ground.Road : Ground.Pavement;

  const buildings: Building[] = [];
  const billboards: Billboard[] = [];
  const trees: TreeSpot[] = [];
  const parked: ParkSpot[] = [];
  const fill = (r: Rect, g: Ground) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) ground[at(x, y)] = g; };
  const lotLines = new Set<number>();
  let billboardIndex = 0;
  const addBuilding = (r: Rect, floors: number, extra: Partial<Building> = {}) => {
    fill(r, Ground.Building);
    const details: RoofDetail[] = [];
    const w = r.w * CELL, h = r.h * CELL;
    const boxes = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < boxes; i++) {
      const bw = 14 + Math.floor(rand() * 18), bh = 12 + Math.floor(rand() * 14);
      details.push({ kind: pick(["box", "vent", "tank"] as const), x: 10 + rand() * Math.max(1, w - bw - 20), y: 10 + rand() * Math.max(1, h - bh - 20), w: bw, h: bh });
    }
    if (w >= 96 && h >= 96 && rand() < 0.4) details.push({ kind: "sky", x: w * 0.3, y: h * 0.62, w: w * 0.4, h: 16 });
    const building: Building = { x: r.x * CELL, y: r.y * CELL, w, h, height: floors * FLOOR, style: Math.floor(rand() * 6), details, ...extra };
    buildings.push(building);
    // Some roofs carry a joke billboard on stilts, which leans even further than the roof.
    if (!extra.tower && floors <= 5 && w >= 128 && rand() < 0.45 && billboardIndex < BILLBOARDS.length * 2) {
      const text = BILLBOARDS[billboardIndex++ % BILLBOARDS.length];
      billboards.push({ x: building.x + 16, y: building.y + h / 2 - 26, w: w - 32, h: 52, height: building.height + 36, text, color: pick([0xf5c518, 0xff3ea5, 0x3ee6ff, 0xff6a2a]) });
    }
    return building;
  };

  let tower: Building | null = null;
  let goal: Rect = { x: 0, y: 0, w: 0, h: 0 };
  for (let by = 0; by < BLOCKS; by++) for (let bx = 0; bx < BLOCKS; bx++) {
    const x0 = blockOrigin(bx), y0 = blockOrigin(by);
    const inner: Rect = { x: x0 + 1, y: y0 + 1, w: BLOCK - 2, h: BLOCK - 2 };
    if (bx === TOWER.bx && by === TOWER.by) {
      // THE BROKER's tower: a tall slab on a plaza, with the goal on its south steps.
      fill(inner, Ground.Plaza);
      tower = addBuilding({ x: x0 + 3, y: y0 + 2, w: 6, h: 6 }, 16, { tower: true, style: 6, sign: "BROKER" });
      tower.details = [{ kind: "pad", x: 40, y: 40, w: 112, h: 112 }];
      goal = { x: (x0 + 4) * CELL, y: (y0 + 8) * CELL + 8, w: 4 * CELL, h: 2 * CELL - 16 };
      for (const [tx, ty] of [[x0 + 1, y0 + 9], [x0 + 10, y0 + 9], [x0 + 1, y0 + 2], [x0 + 10, y0 + 2]]) trees.push({ x: tx * CELL + 16, y: ty * CELL + 16, r: 15 });
      continue;
    }
    if (bx === PARK.bx && by === PARK.by) {
      fill(inner, Ground.Grass);
      fill({ x: inner.x, y: y0 + 5, w: inner.w, h: 2 }, Ground.Path);
      fill({ x: x0 + 5, y: inner.y, w: 2, h: inner.h }, Ground.Path);
      fill({ x: x0 + 5, y: y0 + 5, w: 2, h: 2 }, Ground.Water);
      for (let i = 0; i < 16; i++) {
        const tx = inner.x + Math.floor(rand() * inner.w), ty = inner.y + Math.floor(rand() * inner.h);
        if (ground[at(tx, ty)] !== Ground.Grass || trees.some((t) => Math.hypot(t.x - (tx * CELL + 16), t.y - (ty * CELL + 16)) < 60)) continue;
        trees.push({ x: tx * CELL + 16, y: ty * CELL + 16, r: 14 + rand() * 6 });
      }
      billboards.push({ x: (x0 + 2) * CELL, y: (y0 + 1) * CELL + 6, w: 7 * CELL, h: 36, height: 70, text: "BUPAF: BE THERE OR BE AUDITED", color: 0xf5c518 });
      continue;
    }
    if (LOTS.some((l) => l.bx === bx && l.by === by)) {
      fill(inner, Ground.Lot);
      // Two rows of bays facing a central aisle.
      for (const row of [inner.y, inner.y + inner.h - 2]) {
        for (let x = inner.x + 1; x < inner.x + inner.w; x += 2) { lotLines.add(at(x, row)); lotLines.add(at(x, row + 1)); }
        for (let x = inner.x + 1; x < inner.x + inner.w - 1; x += 2) {
          if (rand() < 0.45 && !(bx === SPAWN_BLOCK.bx && by === SPAWN_BLOCK.by && row !== inner.y)) continue;
          parked.push({ x: (x + 1) * CELL, y: (row + 1) * CELL, angle: row === inner.y ? Math.PI / 2 : -Math.PI / 2 });
        }
      }
      continue;
    }
    // Ordinary downtown block: one to four buildings, sometimes an alley.
    const pattern = Math.floor(rand() * 4);
    const floors = () => 2 + Math.floor(rand() * 6);
    if (pattern === 0) addBuilding({ x: inner.x + 1, y: inner.y + 1, w: inner.w - 2, h: inner.h - 2 }, floors() + 1);
    else if (pattern === 1) {
      const split = 4 + Math.floor(rand() * 3);
      addBuilding({ x: inner.x, y: inner.y, w: split, h: inner.h }, floors());
      addBuilding({ x: inner.x + split + 1, y: inner.y, w: inner.w - split - 1, h: inner.h }, floors());
    } else if (pattern === 2) {
      const split = 4 + Math.floor(rand() * 3);
      addBuilding({ x: inner.x, y: inner.y, w: inner.w, h: split }, floors());
      addBuilding({ x: inner.x, y: inner.y + split, w: inner.w, h: inner.h - split }, floors());
    } else {
      for (const [qx, qy] of [[0, 0], [5, 0], [0, 5], [5, 5]]) {
        if (rand() < 0.2) { fill({ x: inner.x + qx, y: inner.y + qy, w: 5, h: 5 }, Ground.Grass); trees.push({ x: (inner.x + qx + 2.5) * CELL, y: (inner.y + qy + 2.5) * CELL, r: 18 }); continue; }
        addBuilding({ x: inner.x + qx, y: inner.y + qy, w: 5, h: 5 }, floors());
      }
    }
  }
  if (!tower) throw new Error("tower block missing");

  // Solid cells: buildings, tree trunks, the fountain.
  const solid = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < ground.length; i++) solid[i] = ground[i] === Ground.Building || ground[i] === Ground.Water ? 1 : 0;
  for (const t of trees) {
    const cx = Math.floor(t.x / CELL), cy = Math.floor(t.y / CELL);
    if (ground[at(cx, cy)] === Ground.Grass || ground[at(cx, cy)] === Ground.Plaza) ground[at(cx, cy)] = Ground.Tree;
    solid[at(cx, cy)] = 1;
  }

  // Tiles: road markings, zebra crossings at every block corner, kerbs on pavements.
  const crossing = new Set<number>();
  for (let by = 0; by < BLOCKS; by++) for (let bx = 0; bx < BLOCKS; bx++) {
    const x0 = blockOrigin(bx), y0 = blockOrigin(by);
    for (const row of [y0, y0 + BLOCK - 1]) for (let x = 0; x < ROAD; x++) { crossing.add(at(x0 - ROAD + x, row)); crossing.add(at(x0 + BLOCK + x, row)); }
    for (const col of [x0, x0 + BLOCK - 1]) for (let y = 0; y < ROAD; y++) { crossing.add(at(col, y0 - ROAD + y)); crossing.add(at(col, y0 + BLOCK + y)); }
  }
  const tiles: number[][] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: number[] = [];
    for (let x = 0; x < SIZE; x++) {
      const g = ground[at(x, y)];
      const mx = x % PERIOD, my = y % PERIOD;
      let t: number = Tile.asphalt;
      if (g === Ground.Road) {
        const vertical = mx < ROAD && my >= ROAD, horizontal = my < ROAD && mx >= ROAD;
        if (crossing.has(at(x, y))) t = vertical ? Tile.zebraV : Tile.zebraH;
        else if (vertical) t = mx === 1 ? Tile.roadVL : mx === 2 ? Tile.roadVR : (x * 7 + y * 13) % 23 === 0 ? Tile.manhole : Tile.asphalt;
        else if (horizontal) t = my === 1 ? Tile.roadHT : my === 2 ? Tile.roadHB : (x * 7 + y * 13) % 23 === 0 ? Tile.manhole : Tile.asphalt;
        else t = (x + y) % 3 === 0 ? Tile.asphalt2 : Tile.asphalt;
      } else if (g === Ground.Pavement) {
        const road = (dx: number, dy: number) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && ground[at(nx, ny)] === Ground.Road; };
        t = Tile.pavement + (road(0, -1) ? 1 : 0) + (road(1, 0) ? 2 : 0) + (road(0, 1) ? 4 : 0) + (road(-1, 0) ? 8 : 0);
      } else if (g === Ground.Grass || g === Ground.Tree) t = (x * 31 + y * 17) % 7 === 0 ? Tile.flowers : (x + y) % 2 ? Tile.grass2 : Tile.grass;
      else if (g === Ground.Path) t = Tile.path;
      else if (g === Ground.Lot) t = lotLines.has(at(x, y)) ? Tile.lotLineV : Tile.lot;
      else if (g === Ground.Building) t = Tile.base;
      else if (g === Ground.Plaza) t = Tile.plaza;
      else if (g === Ground.Water) t = Tile.water;
      row.push(t);
    }
    tiles.push(row);
  }

  // Street lamps on the pavement ring, every few cells.
  const lamps: Point[] = [];
  for (let by = 0; by < BLOCKS; by++) for (let bx = 0; bx < BLOCKS; bx++) {
    const x0 = blockOrigin(bx), y0 = blockOrigin(by);
    for (let i = 2; i < BLOCK - 2; i += 4) {
      lamps.push({ x: (x0 + i) * CELL + 16, y: y0 * CELL + 6 }, { x: (x0 + i) * CELL + 16, y: (y0 + BLOCK) * CELL - 6 });
      lamps.push({ x: x0 * CELL + 6, y: (y0 + i) * CELL + 16 }, { x: (x0 + BLOCK) * CELL - 6, y: (y0 + i) * CELL + 16 });
    }
  }

  // Pedestrian graph: the four corners of every block's pavement ring, linked
  // around the ring and across the road at the zebra crossings.
  const nodes: PedNode[] = [];
  const id = (bx: number, by: number, corner: number) => (by * BLOCKS + bx) * 4 + corner; // 0 NW, 1 NE, 2 SE, 3 SW
  for (let by = 0; by < BLOCKS; by++) for (let bx = 0; bx < BLOCKS; bx++) {
    const x0 = blockOrigin(bx), y0 = blockOrigin(by);
    const corners: Point[] = [{ x: x0, y: y0 }, { x: x0 + BLOCK - 1, y: y0 }, { x: x0 + BLOCK - 1, y: y0 + BLOCK - 1 }, { x: x0, y: y0 + BLOCK - 1 }];
    corners.forEach((c, i) => nodes.push({ id: id(bx, by, i), x: c.x * CELL + 16, y: c.y * CELL + 16, links: [], crossing: [] }));
  }
  const link = (a: number, b: number, cross: boolean) => {
    nodes[a].links.push(b); nodes[a].crossing.push(cross);
    nodes[b].links.push(a); nodes[b].crossing.push(cross);
  };
  for (let by = 0; by < BLOCKS; by++) for (let bx = 0; bx < BLOCKS; bx++) {
    for (let c = 0; c < 4; c++) link(id(bx, by, c), id(bx, by, (c + 1) % 4), false);
    if (bx + 1 < BLOCKS) { link(id(bx, by, 1), id(bx + 1, by, 0), true); link(id(bx, by, 2), id(bx + 1, by, 3), true); }
    if (by + 1 < BLOCKS) { link(id(bx, by, 3), id(bx, by + 1, 0), true); link(id(bx, by, 2), id(bx, by + 1, 1), true); }
  }

  // Start: on the pavement outside the spawn car park, with a car at the kerb.
  const sx0 = blockOrigin(SPAWN_BLOCK.bx), sy0 = blockOrigin(SPAWN_BLOCK.by);
  const spawn = { x: (sx0 + 6) * CELL, y: (sy0 + BLOCK - 1) * CELL + 16 };
  const spawnCar = { x: (sx0 + 8) * CELL, y: (sy0 + BLOCK) * CELL + CELL, angle: Math.PI };

  return { ground, tiles, solid, buildings, billboards, trees, lamps, parked, nodes, spawn, spawnCar, goal, tower };
}

export const cellAt = (layout: CityLayout, x: number, y: number) => {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  return cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE ? -1 : cy * SIZE + cx;
};
export const isSolidAt = (layout: CityLayout, x: number, y: number) => {
  const i = cellAt(layout, x, y);
  return i < 0 || layout.solid[i] === 1;
};
export const groundAt = (layout: CityLayout, x: number, y: number) => {
  const i = cellAt(layout, x, y);
  return i < 0 ? Ground.Building : layout.ground[i] as Ground;
};
