/**
 * router 麵包屑 meta 凍結（spec §3.5、§7 測試 4）。
 *
 * parentTitle 是「純顯示、不可導航」的手寫字串，正是本次要根除的東西。
 * 凍結為 0 宣告，防止新頁面回頭走老路——反查漏掉的頁面應該補 meta.parent，
 * 不是補一個點不動的字串。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROUTER_SRC = readFileSync(resolve(__dirname, '../index.ts'), 'utf-8')

describe('router 麵包屑 meta', () => {
  it('防假綠哨兵：確實讀到 router 原始碼', () => {
    expect(ROUTER_SRC.length).toBeGreaterThan(10000)
    expect(ROUTER_SRC).toContain("path: '/salary/growth-contract'")
  })

  it('meta.parentTitle 已全數退場（父層一律由 manifest 反查或 meta.parent 提供）', () => {
    const hits = ROUTER_SRC.match(/parentTitle/g) ?? []
    expect(hits, 'parentTitle 仍有殘留；改以 manifest 反查或 meta.parent').toHaveLength(0)
  })

  it('manifest 涵蓋不到的深層頁以 meta.parent 明示', () => {
    expect(ROUTER_SRC).toContain("parent: '/activity/pos'")
    expect(ROUTER_SRC).toContain("parent: '/appraisal-year-end/year-end'")
  })

  it('年終結算工作區不再用手工「›」拼假麵包屑（層級改由 meta.parent 表達）', () => {
    expect(ROUTER_SRC).not.toContain('年終 › 結算工作區')
  })

  it('學生相關孤兒頁以 meta.parent 指回學生列表', () => {
    const offenders: string[] = []
    for (const path of [
      '/student-attendance',
      '/student-leaves',
      '/student-assessments',
      '/student-incidents',
      '/portfolio/medication-today',
    ]) {
      const start = ROUTER_SRC.indexOf(`path: '${path}'`)
      if (start < 0) {
        offenders.push(`${path} 不存在於 router`)
        continue
      }
      const metaStart = ROUTER_SRC.indexOf('meta:', start)
      const metaEnd = ROUTER_SRC.indexOf('}', metaStart)
      const metaBlock = ROUTER_SRC.slice(metaStart, metaEnd)
      if (!metaBlock.includes("parent: '/students'")) offenders.push(`${path} 缺 meta.parent`)
    }
    expect(offenders, '孤兒頁沒有回頭路；補 meta.parent').toEqual([])
  })
})
