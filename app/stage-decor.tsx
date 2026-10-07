"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Stickers in the space around the game screen. Each slot holds a Pokémon form
// and a GTA form; when the level changes, every sticker morphs into its twin.
type Theme = "pokemon" | "glitch" | "gta";
type CityArt = "police" | "sport" | "taxi" | "worker" | "cop" | "player" | "fire" | "cash";

const frlg = (file: string) => `/assets/frlg/${file}`;
const size = (w: number, h: number): CSSProperties => ({ width: `calc(${w}px * var(--px))`, height: `calc(${h}px * var(--px))` });

/** A native sprite at a whole multiple of the page's pixel unit. */
function Sprite({ src, w, h, k = 1 }: { src: string; w: number; h: number; k?: number }) {
  return <span className="deco-sprite" style={{ ...size(w * k, h * k), backgroundImage: `url(${src})` }} />;
}
/** An FRLG overworld sheet walking towards the viewer (frames 0, 3, 0, 4). */
function Walker({ src, k = 2 }: { src: string; k?: number }) {
  return <span className="deco-sprite deco-walker" style={{ ...size(16 * k, 32 * k), backgroundImage: `url(${src})`, "--k": k } as CSSProperties} />;
}
/** A two-frame party icon that hops like it does in the PARTY screen. */
function PartyIcon({ src, k = 2 }: { src: string; k?: number }) {
  return <span className="deco-sprite deco-icon" style={{ ...size(32 * k, 32 * k), backgroundImage: `url(${src})`, "--k": k } as CSSProperties} />;
}
function City({ art, urls, w, h, k = 1 }: { art: CityArt; urls: Partial<Record<CityArt, string>>; w: number; h: number; k?: number }) {
  return <span className="deco-sprite" style={{ ...size(w * k, h * k), backgroundImage: urls[art] ? `url(${urls[art]})` : undefined }} />;
}
const Star = () => <i className="deco-star" />;

type Slot = { side: "l" | "r"; gx: number; y: number; rot: number; poke: ReactNode; gta: ReactNode };
const slots = (urls: Partial<Record<CityArt, string>>): Slot[] => [
  { side: "l", gx: 0.48, y: 13, rot: -8, poke: <Sprite src={frlg("front-pikachu.png")} w={64} h={64} />, gta: <City art="police" urls={urls} w={72} h={36} /> },
  { side: "l", gx: 0.5, y: 32, rot: 3, poke: <span className="tx tx-box">A wild PIKACHU<br />appeared!</span>, gta: <span className="tx tx-pager"><b>COPS ON YOUR</b><b>TAIL: 5</b></span> },
  { side: "l", gx: 0.36, y: 51, rot: -4, poke: <Walker src={frlg("npc-lass.png")} />, gta: <City art="worker" urls={urls} w={32} h={32} k={1.5} /> },
  { side: "l", gx: 0.7, y: 59, rot: 12, poke: <PartyIcon src={frlg("icon-charizard.png")} k={1} />, gta: <City art="player" urls={urls} w={32} h={32} k={1} /> },
  { side: "l", gx: 0.42, y: 72, rot: 10, poke: <Sprite src={frlg("item-pokeball.png")} w={24} h={24} k={2} />, gta: <City art="cash" urls={urls} w={24} h={24} k={2} /> },
  { side: "l", gx: 0.5, y: 88, rot: -6, poke: <Sprite src={frlg("front-charizard.png")} w={64} h={64} />, gta: <City art="fire" urls={urls} w={24} h={24} k={2.5} /> },
  { side: "r", gx: 0.5, y: 11, rot: 6, poke: <span className="tx tx-catch">GOTTA<br />CATCH &rsquo;EM<br />ALL!</span>, gta: <span className="tx tx-wasted">WASTED</span> },
  { side: "r", gx: 0.48, y: 29, rot: -5, poke: <Sprite src={frlg("front-venusaur.png")} w={64} h={64} />, gta: <City art="sport" urls={urls} w={72} h={36} /> },
  { side: "r", gx: 0.4, y: 48, rot: 4, poke: <Walker src={frlg("npc-broker.png")} />, gta: <City art="cop" urls={urls} w={32} h={32} k={1.5} /> },
  { side: "r", gx: 0.72, y: 41, rot: -12, poke: <PartyIcon src={frlg("icon-pikachu.png")} k={1} />, gta: <span className="tx tx-dollar">$</span> },
  { side: "r", gx: 0.5, y: 66, rot: -3, poke: <span className="tx tx-hp"><b>PIKACHU <small>Lv5</small></b><span className="hp"><i>HP</i><span><em /></span></span></span>,
    gta: <span className="tx tx-wanted"><b>WANTED</b><span><Star /><Star /><Star /><Star /><Star /></span></span> },
  { side: "r", gx: 0.46, y: 86, rot: 7, poke: <Sprite src={frlg("front-blaziken.png")} w={64} h={64} />, gta: <City art="taxi" urls={urls} w={72} h={36} /> },
];
// Morph order: a ripple that starts at the top of the screen and runs down both sides.
const delayFor = (slot: Slot, index: number) => (slot.y / 100) * 1.1 + (slot.side === "r" ? 0.12 : 0) + (index % 3) * 0.05;

export default function StageDecor({ theme }: { theme: Theme }) {
  const [urls, setUrls] = useState<Partial<Record<CityArt, string>>>({});
  // Only animate changes seen in this session; a save that loads straight into the city starts as GTA.
  const [live, setLive] = useState(false);
  const previous = useRef(theme);
  const form = theme === "gta" ? "gta" : "pokemon";
  useEffect(() => {
    if (previous.current !== theme) { previous.current = theme; setLive(true); }
  }, [theme]);
  useEffect(() => {
    let cancelled = false;
    // Level 2's own procedural art, drawn once in the browser.
    void import("@/src/game/city/textures").then(({ decorCanvas }) => {
      if (cancelled) return;
      const url = (c: HTMLCanvasElement) => c.toDataURL();
      setUrls({
        police: url(decorCanvas({ car: "police", lights: 1 })), sport: url(decorCanvas({ car: "sport-orange" })), taxi: url(decorCanvas({ car: "taxi" })),
        worker: url(decorCanvas({ ped: 0 })), cop: url(decorCanvas({ ped: "cop" })), player: url(decorCanvas({ ped: "player" })),
        fire: url(decorCanvas("fire")), cash: url(decorCanvas("cash")),
      });
    });
    return () => { cancelled = true; };
  }, []);
  return (
    <div className={`decor${live ? " decor-live" : ""}`} data-theme={theme} data-form={form} aria-hidden="true">
      <div className="horizon">
        <div className="horizon-layer horizon-pokemon" />
        <div className="horizon-layer horizon-gta" />
      </div>
      {slots(urls).map((slot, i) => (
        <div key={i} className="deco" data-side={slot.side}
          style={{ "--gx": slot.gx, "--y": `${slot.y}%`, "--rot": `${slot.rot}deg`, "--delay": `${delayFor(slot, i).toFixed(2)}s`, "--jitter": `${(i * 0.37) % 2.6}s` } as CSSProperties}>
          <div className="deco-layer deco-pokemon"><div className="deco-idle">{slot.poke}</div></div>
          <div className="deco-layer deco-gta"><div className="deco-idle">{slot.gta}</div></div>
          <span className="deco-poof" />
        </div>
      ))}
    </div>
  );
}
