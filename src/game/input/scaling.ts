export function integerScale(nativeWidth: number, nativeHeight: number, availableWidth: number, availableHeight: number) {
  // Below 1×, keep native pixels intact and let the enclosing stage scroll.
  return Math.max(1, Math.floor(Math.min(availableWidth / nativeWidth, availableHeight / nativeHeight)));
}

// Every game pixel covers a whole number of *device* pixels. On a 1× desktop
// this is plain integer CSS scaling; on a 3× phone a 240 px screen can be
// 320 CSS px (4 device px per game pixel) instead of a tiny 240 px.
export function pixelScale(nativeWidth: number, nativeHeight: number, availableWidth: number, availableHeight: number, devicePixelRatio = 1) {
  const dpr = devicePixelRatio > 0 && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  const devicePixels = Math.floor(Math.min(availableWidth / nativeWidth, availableHeight / nativeHeight) * dpr + 1e-6);
  return Math.max(1, devicePixels) / dpr;
}
