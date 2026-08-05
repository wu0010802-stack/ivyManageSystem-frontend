/**
 * 守衛測試（frontend-core §2.5 的「新守則」、CT-F-07(4)）：
 * `src/` 內不得新增裸 `localStorage.getItem/setItem/removeItem`，一律走
 * `@/utils/tenantStorage`。
 *
 * 為什麼要有這道：origin 隔離只在**正式環境的 subdomain 拓撲下**成立。dev 共用
 * `localhost:5173`、總部 console 單 origin、過渡期舊 domain 三種場景都會讓兩個租戶
 * 落在同一個 localStorage 上；漏包一支就是跨校資料殘留，而這種 bug 在單租戶測試環境
 * 永遠不會浮現。
 *
 * 白名單條目**一律附理由**。棘輪語意：只准變短，不准變長；要加新條目請先問
 * 「這真的不能走 wrapper 嗎」。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

/**
 * 允許裸用 localStorage 的檔案（相對 src/）。
 * 目錄前綴以 `/` 結尾。
 */
const ALLOWLIST: { path: string; reason: string }[] = [
  {
    path: 'utils/tenantStorage.ts',
    reason: 'wrapper 本體——它就是那個唯一被允許碰 localStorage 的地方。',
  },
  {
    path: 'utils/tenant.ts',
    reason: 'DEV `?tenant=` override 落在 sessionStorage；本檔不碰 localStorage，列此純為防未來誤加。',
  },
  {
    path: 'parent/',
    reason:
      'CT-F-07(4) 家長端豁免：家長端只在自己的 subdomain 上運作，origin 隔離已足夠；'
      + '而它是 LIFF WebView 首屏最敏感的 bundle，不值得為第二道防線多拉一個 util。'
      + '涉及 key：parent_selected_student_id_v2 / parent-theme / parent-font-size / parent-high-contrast。',
  },
  {
    path: 'utils/auth.ts',
    reason:
      '清「舊版共用 localStorage 的 userInfo 殘留」。那些 key 是改造前寫入的裸 key，'
      + '必須用原字面才刪得掉，走 wrapper 反而刪不到（wrapper 會去找 t/<slug>/ 前綴）。',
  },
  {
    path: 'utils/chunkSelfHeal.ts',
    reason: 'PWA 自救：清 SW/caches 的一次性旗標，早於 boot 執行且與租戶資料無關。',
  },
  {
    path: 'composables/useFormDraft.ts',
    reason:
      '僅 gcExpired() 一處：它要**列舉整個 localStorage**（length / key(i)）找出過期草稿，'
      + '拿到的是完整 key，只能用原生 removeItem 刪。讀寫單一草稿的 write/read/clear '
      + '三處已全部走 wrapper。',
  },
  {
    path: 'utils/adminSession.ts',
    reason:
      '跨分頁 revision 廣播：值由 adminSessionRevisionKey()（內部已呼叫 tenantKey）算出，'
      + '且必須與 storage event 的 event.key 逐字比對，走 wrapper 的 legacy 搬移語意反而會'
      + '破壞回音過濾。這裡的 localStorage 是「訊號通道」不是「資料儲存」。',
  },
]

function isAllowed(rel: string): boolean {
  return ALLOWLIST.some((e) => (e.path.endsWith('/') ? rel.startsWith(e.path) : rel === e.path))
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === '_generated') continue
      walk(full, out)
    } else if (/\.(ts|vue)$/.test(name) && !/\.(spec|test)\.ts$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

const NAKED_LOCALSTORAGE = /\blocalStorage\s*\.\s*(getItem|setItem|removeItem)\s*\(/

describe('tenantStorage 守衛', () => {
  it('src/ 內沒有白名單外的裸 localStorage 讀寫', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file)
      if (isAllowed(rel)) continue
      if (NAKED_LOCALSTORAGE.test(readFileSync(file, 'utf8'))) offenders.push(rel)
    }
    expect(
      offenders,
      '這些檔案裸用了 localStorage：請改走 @/utils/tenantStorage 的 '
        + 'tenantGetItem / tenantSetItem / tenantRemoveItem；'
        + '確有理由豁免者請加進本檔 ALLOWLIST 並寫明原因。',
    ).toEqual([])
  })

  it('白名單每一條都有理由（防止有人偷偷加空條目）', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.reason.length, `${entry.path} 的豁免理由太短`).toBeGreaterThan(20)
    }
  })
})
