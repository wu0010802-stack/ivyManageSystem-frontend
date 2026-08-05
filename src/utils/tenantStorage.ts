/**
 * 多租戶瀏覽器儲存隔離（frontend-core §2.5、contracts CT-F-07）。
 *
 * ## 為什麼還需要 prefix（origin 不是已經隔離了嗎）
 *
 * 正式環境租戶 = subdomain = 獨立 origin，localStorage / IndexedDB / CacheStorage
 * 天然互不可見，那是第一道也是最強的一道防線。本檔是**第二道**（defense-in-depth），
 * 真正必要的場景只有三個：
 *   1. 開發/測試：所有租戶共用 `localhost:5173` 一個 origin（`?tenant=` 模擬切校）；
 *   2. 總部（platform）視角：跨租戶操作發生在單一 origin 上；
 *   3. 過渡期：既有 domain 與新 subdomain 短暫並存。
 *
 * ## 灰度不變式（DEV-12）
 *
 * 單租戶模式（`resolveTenant()` 回 null）下 **key 一律不變**：`tenantKey('x') === 'x'`。
 * 因此本 wrapper 可以先行合併、獨立驗證，不改變任何既有行為。
 *
 * ## legacy 遷移的 shadow 語意（CT-F-07(1)，務必理解後再改）
 *
 * `tenantGetItem` 命中 legacy key 後會**搬移到新 key 並刪除 legacy**，所以
 * **第一次讀之後，legacy key 永久不再生效**——之後任何再寫 legacy 的來源
 * （回滾的舊 bundle、另一個舊分頁、測試裡連續兩次寫 legacy）都會被新 key 遮蔽。
 * 這不是 bug，但論述時不得寫成「讀得到 legacy」。
 * DEV `?tenant=` override 模式下**只讀不搬**（CT-F-07(2)），避免 dev 切租戶時把
 * 資料搬進錯的 slug。
 *
 * ## 家長端豁免（CT-F-07(4)）
 *
 * `src/parent/**` 的 localStorage（`parent_selected_student_id_v2`、`parent-theme`、
 * `parent-font-size`、`parent-high-contrast`）**維持裸 localStorage、不改**：家長端
 * 只在自己的 subdomain 上運作，origin 隔離已足夠，而它是 LIFF WebView 首屏最敏感的
 * bundle（不值得為第二道防線多拉一個 util）。守衛測試已把該目錄列入白名單。
 *
 * ## sessionStorage 不加 prefix
 *
 * per-origin + per-tab 雙重隔離已足夠（`userInfo`、`parent_user_v1`、`activity_draft`、
 * timing buffer 維持原 key）；租戶正確性由 `src/main.ts` 的 boot 期
 * `userInfo.tenant_slug` 比對保證。
 */
import { resolveTenant, tenantSlug } from '@/utils/tenant'

/**
 * 租戶化的 storage key：`t/<slug>/<base>`。
 * **單租戶模式回 `base` 原樣**（灰度不變式）。
 *
 * 本函式刻意不 throw：module top-level / IndexedDB upgrade / 任何早於 boot 的路徑
 * 都會呼叫它（GAP-07），在那裡 throw 會繞過 boot 遮罩變成白畫面。
 */
export function tenantKey(base: string): string {
  const slug = tenantSlug()
  return slug ? `t/${slug}/${base}` : base
}

/**
 * `tenantKey` 的別名，保留給契約文件（frontend-core §2.1）引用的名字。
 * 兩者行為相同——本實作的 `tenantKey` 本來就不 throw。
 */
export const tenantKeySafe = tenantKey

/** 目前是否處於「只讀不搬」的 DEV override 模式（CT-F-07(2)）。 */
function isDevOverride(): boolean {
  return resolveTenant()?.source === 'dev-override'
}

/**
 * 讀：先新 key；miss 時讀 legacy，命中則搬移到新 key 並刪 legacy（一次性遷移）。
 * 單租戶模式下新舊 key 相同，等同單純 `localStorage.getItem`。
 */
export function tenantGetItem(base: string): string | null {
  try {
    const k = tenantKey(base)
    const v = localStorage.getItem(k)
    if (v !== null) return v
    if (k === base) return null
    const legacy = localStorage.getItem(base)
    if (legacy !== null && !isDevOverride()) {
      localStorage.setItem(k, legacy)
      localStorage.removeItem(base)
    }
    return legacy
  } catch {
    return null
  }
}

export function tenantSetItem(base: string, value: string): void {
  try {
    localStorage.setItem(tenantKey(base), value)
  } catch {
    /* quota 滿 / 無痕模式 — 偏好設定寫不進去不該中斷主流程 */
  }
}

/** 移除新 key 與 legacy key（wrapper 兼清舊殘留）。 */
export function tenantRemoveItem(base: string): void {
  try {
    localStorage.removeItem(tenantKey(base))
    localStorage.removeItem(base)
  } catch {
    /* silent */
  }
}

/**
 * 租戶化的 CacheStorage 名稱。**單租戶模式回 `base` 原樣。**
 * 守則：任何新的 `caches.open(...)` 一律經本函式，並把該名加進登出時的刪除清單。
 * （workbox build 期的快取名不改——那些是 per-origin 的資產快取。）
 */
export function tenantCacheName(base: string): string {
  const slug = tenantSlug()
  return slug ? `${base}--t-${slug}` : base
}

/**
 * 租戶化的 in-memory cache key（`useCachedAsync`）。**單租戶模式回 `base` 原樣。**
 *
 * `useCachedAsync` 的 `_cache` 是 module-level Map、生命週期 = 單一分頁，跨租戶污染的
 * 唯一路徑是「同一分頁內切換 acting tenant」，而該切換依 CT-A-06 必走
 * `advanceAdminSession()` → `invalidateCachedAsync()` 全清。因此**既有 call site 一律
 * 不改**；本函式供總部（hq）頁面與任何新增的跨租戶頁面使用。
 */
export function tenantCacheKey(base: string): string {
  const slug = tenantSlug()
  return slug ? `t/${slug}/${base}` : base
}
