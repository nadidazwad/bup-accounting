// Initial measurements: reference/STYLE_NOTES.md. No visual gate has passed.
export const FRLG = {
  width: 240,
  height: 160,
  tileSize: 16,
  walkTileMs: (16 / 60) * 1000,
  runTileMs: (8 / 60) * 1000,
  palette: { backdrop: "#e0eee7", path: "#b8e8d0", foliage: "#70c8a0", ink: "#284838", paper: "#f8f8f8" },
  textCharacterMs: 1000 / 30, // provisional; native-reference cadence still needed
  arrowBlinkMs: 300,
  dialogue: { x: 0, y: 112, width: 240, height: 48 },
} as const;
