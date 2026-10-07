// Modern bindings: WASD/arrows move, Shift runs, E/Space/Enter interact,
// Q/Backspace go back, Esc/M open the menu (and back out of menus).
// Z/X stay as silent aliases for players with GBA-emulator muscle memory.
// Level 2 adds R (radio), H (horn) and F (get in/out). In a car, Space and
// Shift are the handbrake: scenes read the source key to tell Space from E.
export type InputAction = "up" | "down" | "left" | "right" | "confirm" | "cancel" | "run" | "menu" | "debug" | "start" | "select" | "interact" | "radio" | "horn";

export const keyMap: Record<string, InputAction> = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  KeyE: "confirm", Space: "confirm", Enter: "confirm", NumpadEnter: "confirm", KeyZ: "confirm",
  KeyQ: "cancel", Backspace: "cancel", KeyX: "cancel",
  ShiftLeft: "run", ShiftRight: "run",
  Escape: "menu", KeyM: "menu", F1: "debug",
  KeyF: "interact", KeyR: "radio", KeyH: "horn",
};

export class InputRouter {
  private readonly held = new Set<InputAction>();
  private readonly sources = new Map<InputAction, Set<string>>();
  private readonly listeners = new Set<(action: InputAction, source: string) => void>();
  private readonly heldKeys = new Map<string, InputAction>();

  subscribe(listener: (action: InputAction, source: string) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  press(action: InputAction, source = "control") {
    const sources = this.sources.get(action) ?? new Set<string>();
    sources.add(source); this.sources.set(action, sources);
    if (this.held.has(action)) return;
    this.held.add(action);
    this.listeners.forEach((listener) => listener(action, source));
  }
  release(action: InputAction, source = "control") {
    const sources = this.sources.get(action); sources?.delete(source);
    if (!sources?.size) { this.sources.delete(action); this.held.delete(action); }
  }
  isHeld(action: InputAction) { return this.held.has(action); }
  /** Whether a specific key (KeyboardEvent.code) is down, e.g. Space as a handbrake. */
  isKeyHeld(code: string) { return this.heldKeys.has(code); }
  clear() { this.held.clear(); this.sources.clear(); this.heldKeys.clear(); }

  attach(canvas: HTMLCanvasElement, scope: HTMLElement = canvas) {
    const down = (event: KeyboardEvent) => {
      const action = keyMap[event.code];
      if (!action || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element) || !canvas.isConnected) return;
      if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      const pageFocused = target === document.body || target === document.documentElement;
      if (!pageFocused && !scope.contains(target)) return;
      // Enter/Space still activate focused controls through their normal handlers.
      if (target.closest('button, a, [role="button"]') && ["Enter", "Space"].includes(event.code)) return;
      if (canvas.dataset.ready !== "true") return;
      event.preventDefault();
      if (event.repeat) return;
      canvas.focus({ preventScroll: true });
      this.heldKeys.set(event.code, action);
      this.press(action, event.code);
    };
    const up = (event: KeyboardEvent) => {
      const action = this.heldKeys.get(event.code);
      if (!action) return;
      this.heldKeys.delete(event.code);
      this.release(action, event.code);
    };
    const blur = () => this.clear();
    document.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    canvas.addEventListener("blur", blur);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", blur);
    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      canvas.removeEventListener("blur", blur);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", blur);
      this.clear();
    };
  }
}

export const gameInput = new InputRouter();
