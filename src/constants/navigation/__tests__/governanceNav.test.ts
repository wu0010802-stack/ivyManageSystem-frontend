/**
 * 稽核與資料品質整合頁（/governance）的導覽契約。
 *
 * 三個原本散落的頁面（審核工作台 › 高風險事件、報表 › 操作紀錄、報表 › 資料異常待辦）
 * 整併為單一入口 + 三個子路由分頁，側邊欄只留一個底部項目。
 *
 * 關鍵不變式：三個子路徑各自 exact 掛自己的碼，**不得** prefix——否則只持
 * DATA_QUALITY_READ 者能深連結進操作紀錄（外溢提權）。
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { SIDEBAR_TREE, ROUTE_PERMISSION_RULES } from '@/constants/navigation'
import { canAccessRoute, setUserInfo } from '@/utils/auth'

const allSidebarItemPaths = (): string[] => [
  ...SIDEBAR_TREE.topLevel.map((i) => i.index),
  ...SIDEBAR_TREE.bottomLevel.map((i) => i.index),
  ...SIDEBAR_TREE.groups.flatMap((g) => g.items.map((i) => i.index)),
]

const ruleKeys = () =>
  ROUTE_PERMISSION_RULES.map((r) => `${r.path} × ${r.permission}${r.prefix ? ' × prefix' : ''}`)

describe('/governance 側邊欄項目', () => {
  it('以單一項目出現在側邊欄底部（bottomLevel）', () => {
    const bottom = SIDEBAR_TREE.bottomLevel.map((i) => i.index)
    expect(bottom).toContain('/governance')
  })

  it('三個子分頁不各自佔一個側邊欄項目', () => {
    const all = allSidebarItemPaths()
    expect(all).not.toContain('/audit-logs')
    expect(all).not.toContain('/data-quality')
    expect(all).not.toContain('/workbench/high-risk')
    expect(all).not.toContain('/governance/audit-logs')
  })

  it('三碼任一即可見（visibleCodes 為 OR）', () => {
    const item = SIDEBAR_TREE.bottomLevel.find((i) => i.index === '/governance')
    expect(item?.visibleCodes).toEqual(
      expect.arrayContaining(['HIGH_RISK_READ', 'AUDIT_LOGS', 'DATA_QUALITY_READ'])
    )
  })

  it('高風險未確認 badge 掛在本項目上（原掛審核工作台）', () => {
    const item = SIDEBAR_TREE.bottomLevel.find((i) => i.index === '/governance')
    expect(item?.badgeKey).toBe('governance')
  })

  it('審核工作台只剩待簽核：不再宣稱高風險碼', () => {
    const workbench = SIDEBAR_TREE.topLevel.find((i) => i.index === '/workbench')
    expect(workbench?.visibleCodes).toEqual(['APPROVALS'])
  })
})

describe('/governance 子路由權限規則', () => {
  it('三個子路徑各自 exact 掛自己的碼', () => {
    const keys = ruleKeys()
    expect(keys).toContain('/governance/high-risk × HIGH_RISK_READ')
    expect(keys).toContain('/governance/audit-logs × AUDIT_LOGS')
    expect(keys).toContain('/governance/data-quality × DATA_QUALITY_READ')
  })

  it('/governance 底下無 prefix 規則（prefix 會讓三碼互相外溢）', () => {
    const prefixed = ROUTE_PERMISSION_RULES.filter(
      (r) => r.prefix && '/governance'.startsWith(r.path)
    )
    expect(prefixed).toEqual([])
  })
})

describe('/governance 子分頁的深連結守衛（真實 canAccessRoute）', () => {
  beforeEach(() => setUserInfo({ role: 'admin', permission_names: ['DATA_QUALITY_READ'] }))

  it('只持 DATA_QUALITY_READ：進得了資料異常待辦', () => {
    expect(canAccessRoute('/governance/data-quality')).toBe(true)
  })

  it('只持 DATA_QUALITY_READ：擋在操作紀錄與高風險事件之外', () => {
    expect(canAccessRoute('/governance/audit-logs')).toBe(false)
    expect(canAccessRoute('/governance/high-risk')).toBe(false)
  })

  it('只持 AUDIT_LOGS：進得了 /governance 落點頁，但擋在另兩個分頁之外', () => {
    setUserInfo({ role: 'admin', permission_names: ['AUDIT_LOGS'] })
    expect(canAccessRoute('/governance')).toBe(true)
    expect(canAccessRoute('/governance/audit-logs')).toBe(true)
    expect(canAccessRoute('/governance/data-quality')).toBe(false)
    expect(canAccessRoute('/governance/high-risk')).toBe(false)
  })
})
