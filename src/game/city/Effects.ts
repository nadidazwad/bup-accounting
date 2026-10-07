// Particles, decals and explosions for the city. Phaser's emitters pool their
// particles; decals and skid marks are recycled from fixed pools here.
import Phaser from "phaser";

export type PedTheme = "office" | "invoices";

export class Effects {
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly fire: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly receipts: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly blast: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly decals: Phaser.GameObjects.Image[] = [];
  private decalNext = 0;
  private readonly skids: Phaser.GameObjects.Rectangle[] = [];
  private skidNext = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly theme: PedTheme = "office") {
    // Texture sizes: smoke 16, fire 12, spark 2, receipt 4×6 (one texel per world px).
    this.smoke = scene.add.particles(0, 0, "fx-smoke", {
      emitting: false, lifespan: { min: 700, max: 1300 }, speed: { min: 8, max: 30 }, angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 2.2 }, alpha: { start: 0.75, end: 0 }, gravityY: -12,
    }).setDepth(36);
    this.fire = scene.add.particles(0, 0, "fx-fire", {
      emitting: false, lifespan: { min: 250, max: 520 }, speed: { min: 10, max: 45 }, angle: { min: 0, max: 360 },
      scale: { start: 1.3, end: 0.3 }, alpha: { start: 1, end: 0.2 }, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(37);
    this.sparks = scene.add.particles(0, 0, "fx-spark", {
      emitting: false, lifespan: { min: 120, max: 320 }, speed: { min: 80, max: 220 }, angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0.5 },
    }).setDepth(38);
    this.receipts = scene.add.particles(0, 0, "fx-receipt", {
      emitting: false, lifespan: { min: 900, max: 1800 }, speed: { min: 30, max: 110 }, angle: { min: 0, max: 360 },
      rotate: { min: 0, max: 360 }, scale: 1, alpha: { start: 1, end: 0 },
    }).setDepth(39);
    this.blast = scene.add.particles(0, 0, "fx-fire", {
      emitting: false, lifespan: { min: 300, max: 800 }, speed: { min: 60, max: 260 }, angle: { min: 0, max: 360 },
      scale: { start: 3, end: 0.4 }, alpha: { start: 1, end: 0 }, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(41);
    for (let i = 0; i < 48; i++) this.decals.push(scene.add.image(0, 0, "fx-splat").setVisible(false).setDepth(8));
    for (let i = 0; i < 160; i++) this.skids.push(scene.add.rectangle(0, 0, 6, 2, 0x111111, 0.4).setVisible(false).setDepth(7));
  }

  smokeAt(x: number, y: number, n = 1) { this.smoke.emitParticleAt(x, y, n); }
  fireAt(x: number, y: number, n = 1) { this.fire.emitParticleAt(x, y, n); }
  sparksAt(x: number, y: number, n = 6) { this.sparks.emitParticleAt(x, y, n); }

  /** A pedestrian hit: a small cartoon splat and a flurry of receipts. */
  splat(x: number, y: number, angle: number) {
    this.decal(x, y, this.theme === "invoices" ? "fx-splat-ink" : "fx-splat", angle, 1);
    this.receipts.emitParticleAt(x, y, 6);
  }

  scorch(x: number, y: number) { this.decal(x, y, "fx-scorch", Math.random() * Math.PI * 2, 1.3); }

  skid(x: number, y: number, angle: number) {
    const r = this.skids[this.skidNext];
    this.skidNext = (this.skidNext + 1) % this.skids.length;
    r.setPosition(x, y).setRotation(angle).setVisible(true).setAlpha(0.35);
  }

  explosion(x: number, y: number) {
    this.blast.emitParticleAt(x, y, 36);
    this.smoke.emitParticleAt(x, y, 16);
    this.sparks.emitParticleAt(x, y, 24);
    const glow = this.scene.add.image(x, y, "fx-glow").setDepth(42).setBlendMode(Phaser.BlendModes.ADD).setScale(0.4);
    this.scene.tweens.add({ targets: glow, scale: 4, alpha: 0, duration: 520, ease: "Cubic.easeOut", onComplete: () => glow.destroy() });
    const ring = this.scene.add.image(x, y, "fx-ring").setDepth(42).setScale(0.3).setTint(0xffd070);
    this.scene.tweens.add({ targets: ring, scale: 3.2, alpha: 0, duration: 420, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    this.scorch(x, y);
  }

  private decal(x: number, y: number, key: string, angle: number, scale: number) {
    const d = this.decals[this.decalNext];
    this.decalNext = (this.decalNext + 1) % this.decals.length;
    // Decals rotate in quarter turns so their pixels stay square.
    d.setTexture(key).setPosition(Math.round(x), Math.round(y)).setRotation(Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)).setScale(scale).setVisible(true).setAlpha(1);
  }
}
