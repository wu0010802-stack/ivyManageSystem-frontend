/**
 * 柔和提示音（soft chime）音色定義：單音、低音量、無震動無語音。
 *
 * 教師 Portal（usePortalDismissalAlerts，家長預告尚未抵達）與後台接送佇列
 * （useDismissalReservationChime，右欄預約倒數提醒）共用同一段音色描繪，
 * 避免兩處分別維護一份「畫波形」邏輯而漂移。AudioContext 生命週期、靜音
 * 偏好、user-gesture 解鎖仍由各呼叫端自行管理，不共用單例、互不影響。
 */

export const SOFT_CHIME_FREQ = 523.25 // C5 單音
export const SOFT_CHIME_GAIN = 0.06

/**
 * 在既有（已建立且已 resume）的 audioCtx 上畫一個柔和單音包絡。
 * 呼叫端自行處理 muted 判斷、audioCtx 建立/resume 與例外捕捉。
 */
export function drawSoftChime(audioCtx: AudioContext, gain = SOFT_CHIME_GAIN): void {
  const t0 = audioCtx.currentTime
  const osc = audioCtx.createOscillator()
  const g = audioCtx.createGain()
  osc.type = 'triangle'
  osc.frequency.value = SOFT_CHIME_FREQ
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3)
  osc.connect(g).connect(audioCtx.destination)
  osc.start(t0)
  osc.stop(t0 + 0.32)
}
