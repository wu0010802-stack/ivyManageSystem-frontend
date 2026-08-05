/**
 * 總部（platform）console 的 **acting tenant**（目前正在檢視／操作的分校）。
 *
 * ## 為什麼是 module-level ref 而不是 localStorage
 *
 * acting tenant 是**分頁級**狀態（per-tab）：同一位總部管理員可以在 A 分頁看甲校、
 * B 分頁看乙校。落 localStorage 會讓兩個分頁互相踩，而且重新整理後「還停在上次那間
 * 分校」比「回到清單」更容易誤操作（改到的是別校的設定）。hq-reporting §2.5 因此明訂
 * **不落 localStorage**。
 *
 * ## CT-A-06：每次變更必須 `advanceAdminSession()`
 *
 * `useCachedAsync` 的 `_cache` 與 axios dedupe 都是 module-level、生命週期＝單一分頁。
 * 同一分頁內把 acting tenant 從甲校換成乙校時，若不推進身分世代，甲校的 in-flight 回應
 * 會落到乙校畫面上（hq-reporting 風險 #16）。`advanceAdminSession()` 一次做四件事：
 * 中止 in-flight → `invalidateCachedAsync()` 全清 → 清 axios dedupe → 跨分頁廣播。
 *
 * ⚠ **已知代價（非本檔可獨力解決，列入移交）**：`advanceAdminSession()` 的第四件事會
 * 讓**其他分頁**收到 `source: 'remote'` 的 reset，而 `utils/auth.ts` 對 remote reset 的
 * 既有處置是「清本地身分並導回登入頁」。也就是說總部管理員開兩個分頁時，在其中一頁切
 * 分校會把另一頁登出。契約（CT-A-06）明文要求呼叫這支，故本批照契約實作；若要消除該
 * 副作用，需要 fc 在 `utils/adminSession.ts` 提供一支「只做本分頁失效、不廣播」的變體，
 * 那是 fc 擁有的介面，不由 hq 自行改寫。
 *
 * ## 快取 key 守則
 *
 * 總部頁的 `useCachedAsync` key 一律用本檔的 `platformCacheKey()`：它同時帶
 *   - **Host 租戶**（`tenantCacheKey()`，＝目前登入的 hq；單租戶模式回原字串）
 *   - **acting tenant id**
 * 兩層，切換時即使有 race 也不會讀到他校條目，且 `invalidateCachedAsync('t/hq/hq:')`
 * 之類的前綴失效仍可用。既有分校頁 call site **一律不改**（frontend-core §2.8）。
 */
import { computed, readonly, shallowRef } from 'vue'
import { advanceAdminSession, onAdminSessionReset } from '@/utils/adminSession'
import { tenantCacheKey } from '@/utils/tenantStorage'

export interface ActingTenant {
  id: number
  slug: string
  name: string
  /** 後端下發的對外 origin；組登入連結一律經 `buildTenantOrigin()`（GAP-09）。 */
  public_origin?: string | null
}

const _acting = shallowRef<ActingTenant | null>(null)

// 身分世代推進（登入／登出／代操作／另一分頁換身分）時，acting tenant 一定要跟著歸零：
// 舊身分選的分校對新身分沒有意義，留著等於讓下一個使用者接手一個已選好的操作目標。
// ⚠ 這也是 `setActingTenant()` 必須「先 advance、後賦值」的原因（見下）。
onAdminSessionReset(() => {
  _acting.value = null
})

/** 目前 acting tenant（唯讀）。未選擇時為 `null`。 */
export const actingTenant = readonly(_acting)

/** 目前 acting tenant id；未選擇時為 `null`。 */
export const actingTenantId = computed(() => _acting.value?.id ?? null)

/**
 * 切換 acting tenant。同一個 id 視為 no-op（**不推進世代**——否則每次進詳情頁重新
 * 掛載都會把剛載入的快取清掉，變成無限刷新）。
 */
export function setActingTenant(tenant: ActingTenant | null): void {
  const nextId = tenant?.id ?? null
  if (nextId === (_acting.value?.id ?? null)) {
    // id 相同但名稱/origin 更新（例如詳情頁載回完整資料）：直接覆蓋，不推進世代。
    if (tenant) _acting.value = tenant
    return
  }
  // 先失效再賦值：advance 會觸發上面的 reset listener 把 _acting 清成 null。
  advanceAdminSession()
  _acting.value = tenant
}

export function clearActingTenant(): void {
  setActingTenant(null)
}

/**
 * 總部頁的 `useCachedAsync` key。`base` 只需寫功能語意（如 `reports:finance:2026-08`），
 * Host 租戶前綴與 acting tenant 由本函式補上。
 */
export function platformCacheKey(base: string, actingId: number | null = actingTenantId.value): string {
  return tenantCacheKey(`hq:${actingId ?? 'all'}:${base}`)
}

/** 測試專用：重置 module-level 狀態（不推進世代，避免污染其他測試的 generation）。 */
export function _resetActingTenantForTests(): void {
  _acting.value = null
}
