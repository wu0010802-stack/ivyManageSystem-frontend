import { describe, it, expect } from 'vitest'
import { ITEM_DOMAIN_GROUPS, ITEM_CODE_LABELS } from '../scoreItemLabels'

const VALID_DOMAINS = ['考勤', '招生', '才藝', '懲處', '加分']

describe('ITEM_DOMAIN_GROUPS', () => {
  it('分組涵蓋全部 24 碼、每碼恰屬一組', () => {
    const grouped = ITEM_DOMAIN_GROUPS.flatMap(g => g.codes)
    expect(new Set(grouped).size).toBe(grouped.length) // 無重複
    expect([...grouped].sort()).toEqual(Object.keys(ITEM_CODE_LABELS).sort()) // 完整
  })

  it('每組 domain 為五個合法值之一、且每組至少 1 碼', () => {
    expect(ITEM_DOMAIN_GROUPS.length).toBeGreaterThan(0)
    for (const g of ITEM_DOMAIN_GROUPS) {
      expect(VALID_DOMAINS).toContain(g.domain)
      expect(g.codes.length).toBeGreaterThan(0)
    }
  })

  it('五個 domain 名稱不重複', () => {
    const domains = ITEM_DOMAIN_GROUPS.map(g => g.domain)
    expect(new Set(domains).size).toBe(domains.length)
  })
})
