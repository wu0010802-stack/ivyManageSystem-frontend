/**
 * 接送提醒共用的音色描繪與中文語音播報。
 *
 * 教師 Portal（usePortalDismissalAlerts）與後台接送佇列
 * （useDismissalReservationChime，右欄預約送出即播報／倒數提醒）共用這幾段
 * 「畫波形」與「挑中文 voice 播報」邏輯，避免兩處分別維護一份而漂移。
 * AudioContext 生命週期、SpeechSynthesis 的 muted 判斷仍由各呼叫端自行
 * 管理，不共用單例、互不影響。
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

// 上行 C 大調三音（C5 → E5 → G5）。以 triangle 波形與低音量短包絡模擬木琴，
// 保留通知辨識度、避開傳統高頻門鈴的尖銳感，適合幼兒園教室／走廊廣播。
// 較柔和單音更醒目，用於強提醒（新通知／已到門口／後台預約提醒）。
export const CHIME_TONES = [
  { freq: 523.25, at: 0, dur: 0.28 },  // C5
  { freq: 659.25, at: 0.16, dur: 0.28 }, // E5
  { freq: 783.99, at: 0.32, dur: 0.38 }, // G5
]
export const CHIME_PEAK_GAIN = 0.12

/**
 * 在既有（已建立且已 resume）的 audioCtx 上畫三音提示。
 * 呼叫端自行處理 muted 判斷、audioCtx 建立/resume 與例外捕捉。
 */
export function drawChimeTones(audioCtx: AudioContext, gain = CHIME_PEAK_GAIN): void {
  const t0 = audioCtx.currentTime
  for (const tone of CHIME_TONES) {
    const osc = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = tone.freq
    const start = t0 + tone.at
    g.gain.setValueAtTime(0, start)
    g.gain.linearRampToValueAtTime(gain, start + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, start + tone.dur)
    osc.connect(g).connect(audioCtx.destination)
    osc.start(start)
    osc.stop(start + tone.dur + 0.02)
  }
}

// ── 中文語音播報（Web Speech API，best-effort；無 AudioContext 依賴，可直接呼叫）──
// 語速稍慢、音高微亮，讓班級與名字清楚又不顯得生硬。
const SPEECH_RATE = 0.9
const SPEECH_PITCH = 1.04

/** speechSynthesis 是否可用（LINE in-app WebView 等環境多半不支援，feature-detect）。 */
export function speechSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.speechSynthesis !== 'undefined'
    && typeof window.SpeechSynthesisUtterance === 'function'
}

// 挑中文 voice：優先精確匹配（zh-TW），否則同語系前綴（zh）。
// hasVoices=false 代表 getVoices() 尚未載入（部分瀏覽器首呼回空，需 voiceschanged）。
function pickZhVoice(): { hasVoices: boolean; voice: SpeechSynthesisVoice | null } {
  let voices: SpeechSynthesisVoice[] = []
  try { voices = window.speechSynthesis.getVoices?.() || [] } catch { /* ignore */ }
  if (!voices.length) return { hasVoices: false, voice: null }
  const voice = voices.find((v) => v.lang === 'zh-TW')
    || voices.find((v) => v.lang?.toLowerCase().startsWith('zh'))
    || null
  return { hasVoices: true, voice }
}

/**
 * 播放一段中文語音播報（best-effort）。呼叫端自行處理 muted 判斷；
 * voice 清單已載入但沒有中文 voice 時寧可不播，不使用錯語系 voice 唸出
 * （清單尚未載入時仍帶 lang 退化播報）。
 */
export function speakZh(text: string): void {
  if (!speechSupported()) return
  try {
    const { hasVoices, voice } = pickZhVoice()
    if (!hasVoices || voice) {
      const u = new window.SpeechSynthesisUtterance(text)
      u.lang = 'zh-TW'
      u.rate = SPEECH_RATE
      u.pitch = SPEECH_PITCH
      if (voice) u.voice = voice
      window.speechSynthesis.speak(u)
    }
  } catch { /* ignore */ }
}

/** 首次 user gesture 內「預熱」speechSynthesis（同 AudioContext，部分瀏覽器需 gesture 才能發聲）。 */
export function unlockSpeechZh(): void {
  if (!speechSupported()) return
  try {
    const u = new window.SpeechSynthesisUtterance('')
    u.volume = 0
    window.speechSynthesis.speak(u)
  } catch { /* ignore */ }
}
