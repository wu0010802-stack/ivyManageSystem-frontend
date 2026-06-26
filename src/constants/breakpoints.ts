// Canonical RWD 斷點（與 src/assets/breakpoints.media.css 數值同步，
// 由 src/constants/__tests__/breakpoints.spec.ts 的 drift guard 強制一致）。
// 手機判定統一為 < sm（= max-width 767.98px），與 CSS --to-sm 對齊。
export const BREAKPOINTS = { xs: 480, sm: 768, md: 1024, lg: 1200 } as const
export type BreakpointKey = keyof typeof BREAKPOINTS

/** 手機上界（含）：< sm。用 767.98 避開整數邊界落點歧義。 */
export const MOBILE_MAX_PX = BREAKPOINTS.sm - 0.02 // 767.98
