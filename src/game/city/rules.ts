// Level 2 rules: wanted level, score multiplier, busts and the win condition.
export const FRENZY_TARGET = 20;
export const MAX_COPS = 5;
export const MAX_HEADS = 6;
export const BUST_PENALTY = 0.25;
export const POINTS_PER_VICTIM = 100;

/** Cop heads: the first at 3 victims, one more every 2, full (6) at 13. */
export function wantedLevel(victims: number) {
  if (victims < 3) return 0;
  return Math.min(MAX_HEADS, 1 + Math.floor((victims - 3) / 2));
}

/** How many cops the director keeps on you for a wanted level (5 from 5 heads). */
export function copsFor(level: number) { return Math.min(MAX_COPS, level); }
/** Foot officers in the mix; the rest are cars. */
export function footCops(total: number) { return Math.floor(total / 2); }

/** GTA 2 style multiplier: ×1, then +1 for every 5 victims, up to ×5. */
export function multiplier(victims: number) { return Math.min(5, 1 + Math.floor(victims / 5)); }

export function pointsForHit(victimsBefore: number) { return POINTS_PER_VICTIM * multiplier(victimsBefore); }

/** BUSTED or WASTED: keep the victims, lose a quarter of the score. */
export function afterPenalty(score: number) { return Math.floor(score * (1 - BUST_PENALTY)); }

export type Progress = { victims: number; fiveCopsSeen: boolean };
export const frenzyDone = (p: Progress) => p.victims >= FRENZY_TARGET;
export const levelWon = (p: Progress) => frenzyDone(p) && p.fiveCopsSeen;

/** What the pager should be nagging about next. */
export function objective(p: Progress) {
  if (levelWon(p)) return "GOOD WORK. NOW GET TO THE BROKER'S TOWER.";
  if (!frenzyDone(p)) return `RUN UP ${FRENZY_TARGET} VICTIMS. ${FRENZY_TARGET - p.victims} TO GO.`;
  return "FRENZY DONE. NOW GET 5 COPS ON YOUR TAIL AT ONCE.";
}
