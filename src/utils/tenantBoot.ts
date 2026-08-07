/**
 * 三個 entry 共用的租戶 boot 檢查（frontend-core §2.1 / §2.3、contracts CT-F-07(3)）。
 *
 * 做兩件事，順序固定：
 *   1. **fail-loud 遮罩**：多租戶已啟用（`isTenantModeEnabled()`）但 hostname 認不出
 *      園所 → 掛 `TenantBlockedScreen` 並停止 boot（不掛 router、不打 API）。
 *      單租戶模式（未設任何 tenant build 變數）**不做任何事**，維持改造前行為（DEV-12）。
 *   2. **sessionStorage 交叉驗證**：`sessionStorage.userInfo.tenant_slug` 與當前 slug
 *      不符即清掉本地身分（router guard 會在首次導覽時把人送回登入頁）。
 *      `setUserInfo()` 內的檢查涵蓋不到「DEV `?tenant=` 切 query 但不重載 userInfo」
 *      的情境（review F5），所以 boot 期這一道不可省。
 *
 * fail-loud 的責任**集中在這裡**，而非散落於 module 求值期——ES module 依賴圖早於
 * entry body 求值，在那裡 throw 只會得到白畫面（GAP-07）。
 */
import { captureException } from '@/utils/sentry'
import { isTenantModeEnabled, resolveTenant } from '@/utils/tenant'
import { showTenantBlocked } from '@/utils/tenantBlocked'

/** 存放身分快取的 sessionStorage key（管理端 / Portal + 家長端）。 */
const IDENTITY_SESSION_KEYS = ['userInfo', 'auth_session_validated_at', 'parent_user_v1']

export interface TenantBootResult {
  /** `false` = 已掛遮罩，呼叫端必須停止 boot（不掛 router、不 mount）。 */
  proceed: boolean
  /** 當前租戶 slug；單租戶模式為 `null`。供 `initSentry` 的 tenant tag 使用。 */
  slug: string | null
  /**
   * 把 boot 期發現的問題送 Sentry。**必須在 `initSentry()` 完成後呼叫**
   * （`initSentry` 是 async，太早呼叫 `captureException` 會 no-op）。
   * 一切正常時為 no-op。
   */
  report: () => void
}

function clearStaleIdentity(): void {
  for (const key of IDENTITY_SESSION_KEYS) {
    try {
      sessionStorage.removeItem(key)
    } catch {
      /* storage 被停用：本來就沒有殘留身分可清 */
    }
  }
}

/** sessionStorage 內的身分是否屬於別的租戶（切 query 不重載的情境）。 */
function sessionBelongsToOtherTenant(slug: string): boolean {
  try {
    const raw = sessionStorage.getItem('userInfo')
    if (!raw) return false
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return false
    const stored = (parsed as Record<string, unknown>)['tenant_slug']
    // 後端尚未下發 tenant_slug（舊 session）→ 不判定為他租戶，交給
    // setUserInfo() 在下一次 refresh 回應時處理，避免無謂地把人踢出去。
    return typeof stored === 'string' && stored !== '' && stored !== slug
  } catch {
    return false
  }
}

export function initTenantBoot(): TenantBootResult {
  const tenant = resolveTenant()

  if (!tenant) {
    if (!isTenantModeEnabled()) {
      // 單租戶模式：完全不介入（灰度不變式）。
      return { proceed: true, slug: null, report: () => {} }
    }
    const hostname = typeof window === 'undefined' ? '(no window)' : window.location.hostname
    showTenantBlocked('TENANT_NOT_FOUND')
    return {
      proceed: false,
      slug: null,
      report: () => {
        captureException(new Error('TENANT_UNRESOLVED: 無法從 hostname 識別園所'), {
          hostname,
        }).catch(() => {})
      },
    }
  }

  let mismatched = false
  if (sessionBelongsToOtherTenant(tenant.slug)) {
    mismatched = true
    clearStaleIdentity()
  }

  return {
    proceed: true,
    slug: tenant.slug,
    report: () => {
      if (!mismatched) return
      captureException(new Error('TENANT_SESSION_MISMATCH: sessionStorage 身分屬於別的園所'), {
        tenant: tenant.slug,
        source: tenant.source,
      }).catch(() => {})
    },
  }
}
