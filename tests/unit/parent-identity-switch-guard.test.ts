import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// 2026-10-04 家長端深掃 F02：家長端的「身分轉換」（設定碼／LINE 登入、首次綁定）
// 必須先清掉前一位家長的個人化快取（今日狀態、useCachedAsync、children store…），
// 再寫入新使用者。LoginView 在 2026-08-25 修過一次，BindView 卻仍直接
// `authStore.setUser()`，於是同一個洞換個入口又出現。
//
// 此 gate 把「寫入家長身分只能經 switchParentIdentity()」固化成 CI 紅線：
// 任何新的 `.setUser(` 呼叫點都會失敗，迫使改走統一程序或有意識地加白名單。

const SCAN_DIR = 'src/parent'
const SET_USER_CALL = /\.setUser\(/

// 白名單（路徑 → 理由）。
const ALLOWED: Record<string, string> = {
  // 統一的身分轉換程序本身。
  'src/parent/composables/useParentLogout.ts': 'switchParentIdentity() 先清快取再 setUser',
  // 冷啟動探測：只在 store 尚無使用者時（新分頁／sessionStorage 被清）以 cookie
  // 對應的同一身分 hydrate，不存在「前一位家長」的記憶體狀態可殘留。
  'src/parent/main.ts': 'ensureSessionProbed：store 為空時的同身分 hydrate',
}

function collectFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue
      out.push(...collectFiles(full))
    } else if (/\.(vue|ts)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
      out.push(full)
    }
  }
  return out
}

describe('家長身分轉換統一入口守衛', () => {
  it('src/parent 內只有白名單檔案可以直接呼叫 authStore.setUser()', () => {
    const offenders = collectFiles(SCAN_DIR)
      .filter((file) => !(file in ALLOWED))
      .filter((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .some((line) => SET_USER_CALL.test(line) && !/^\s*(\/\/|\*)/.test(line)),
      )
    expect(
      offenders,
      '身分轉換請改用 useParentLogout.ts 的 switchParentIdentity()（先清前一位家長的快取）',
    ).toEqual([])
  })

  it('白名單沒有過時項目', () => {
    for (const file of Object.keys(ALLOWED)) {
      expect(readFileSync(file, 'utf8')).toMatch(SET_USER_CALL)
    }
  })
})
