/**
 * 「家長端此刻是否跑在 LINE App 內」的單一判斷來源（SPEC-020 CT-M-02）。
 *
 * ## 為什麼不直接呼叫 liff.isInClient()
 *
 * 1. **時序**：`liff.isInClient()` 必須在 `liff.init()` 之後才可呼叫，而**已登入的
 *    家長根本不會經過 LoginView**（session cookie 還在），也就不會呼叫 `initLiff()`。
 *    只問 SDK 會把這些家長判成「不在 LINE 內」，於是 LINE MINI App 的內建 header
 *    與家長端自畫的 `M3TopAppBar` 同時出現，首屏被兩條標題列吃掉。
 * 2. **bundle**：本模組被 `ParentLayout` 這種首屏元件使用，若在此靜態 import
 *    `@line/liff` 會把整包 SDK 拖進首屏 chunk（`useParentLogout` 為此刻意用動態
 *    import）。故本檔**零 SDK 依賴**，改由 `services/liff.ts` 在 init 成功後
 *    回填權威值。
 *
 * ## 判斷順序
 *
 * SDK 回填過 → 以 SDK 為準；否則看 User-Agent。LINE 的 in-app WebView UA 一律
 * 帶 `Line/<版本>`（例：`... AppleWebKit/605.1.15 Line/14.2.1 LIAPP`）。
 * 外部瀏覽器開啟 MINI App 時不帶此標記，會正確走「顯示自畫 header」那條路。
 */
import { ref } from 'vue'

/**
 * 需要 `Line/` 後緊接版本號，避免 `airline`／`online` 這類字串誤判。
 * 大小寫不敏感：Android 與 iOS 的 LINE 大小寫寫法歷來不一致。
 */
const LINE_CLIENT_UA_PATTERN = /\bLine\/\d[\d.]*/i

/** null = SDK 尚未回填；此時退回 UA 判斷。 */
const sdkInClient = ref<boolean | null>(null)

function userAgentLooksLikeLineClient(): boolean {
  try {
    return LINE_CLIENT_UA_PATTERN.test(navigator.userAgent || '')
  } catch {
    // navigator 不可用（SSR／極端隱私模式）→ 保守視為不在 LINE 內，
    // 亦即照常畫自己的 header，最壞情況只是多一條標題列而非失去導覽。
    return false
  }
}

/**
 * 由 `services/liff.ts` 於 `liff.init()` 成功後呼叫，回填 SDK 的權威判斷。
 * 呼叫後 `isInLineClient()` 立即反映新值；若在 render 期間讀過，畫面自動更新。
 */
export function markLineClientFromSdk(value: boolean): void {
  sdkInClient.value = value
}

/**
 * 此刻是否在 LINE App 內。SDK 未就緒時以 User-Agent 推斷。
 *
 * 刻意是函式而非 computed：computed 的依賴只有 `sdkInClient`，會把 UA 的判斷
 * 結果永久快取住，測試無法驗證 UA 分支。函式形式在 render 期間讀取
 * `sdkInClient.value`，Vue 的 render effect 因此自動建立依賴——SDK 回填時
 * 畫面照樣即時更新，而 UA 每次重新評估。單次 regex 成本可忽略。
 */
export function isInLineClient(): boolean {
  const fromSdk = sdkInClient.value
  if (fromSdk !== null) return fromSdk
  return userAgentLooksLikeLineClient()
}

/** 測試專用：清除 SDK 回填值，讓判斷退回 User-Agent。 */
export function _resetLineClientForTests(): void {
  sdkInClient.value = null
}
