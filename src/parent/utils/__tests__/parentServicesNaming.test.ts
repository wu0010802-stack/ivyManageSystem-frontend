/**
 * 同一功能同一名字（2026-10-14 守衛）。
 *
 * 2026-10-08 改版把服務名稱收斂到 parentServices.ts，但頁內標題、首頁卡片、
 * 鈴鐺、行事曆標籤、通知偏好仍散落舊叫法（事件公告／事件簽收／家長簽閱、
 * 活動參加調查、校園公告、成長相簿、學費到期、投藥…）。這裡鎖兩件事：
 *  1. 服務目錄每一項的名稱 = 目的頁的路由標題（LINE 內建 header 顯示的就是它）
 *  2. 已退場的舊叫法不得再出現在家長端畫面文字（註解不算）
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import router from '../../router'
import { PARENT_SERVICES, type ParentServiceKey } from '../parentServices'

/** 不是獨立頁面、而是同一頁上的動作捷徑（「我到了」＝預告接送頁的抵達通知） */
const ACTION_ALIASES: ParentServiceKey[] = ['arrived']

describe('服務名稱 = 目的頁路由標題', () => {
  const entries = (Object.entries(PARENT_SERVICES) as [ParentServiceKey, { label: string; route: string }][])
    .filter(([key]) => !ACTION_ALIASES.includes(key))

  it.each(entries)('%s', (_key, service) => {
    const path = service.route.replace(':studentId', '1')
    expect(router.resolve(path).meta.title).toBe(service.label)
  })
})

describe('已退場的舊叫法不得出現在畫面文字', () => {
  const RETIRED = ['事件公告', '事件簽收', '家長簽閱', '事件待簽', '活動參加調查', '校園公告', '成長相簿', '學費到期', '投藥', '待簽紀錄', '繳費中心', '費用查詢']
  const PARENT_DIR = resolve(__dirname, '../..')

  function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name)
      if (e.isDirectory()) return e.name === '__tests__' ? [] : files(full)
      return /\.(vue|ts)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) ? [full] : []
    })
  }

  /** 去掉註解（// …、/* … *\/、<!-- … -->），只看會顯示給家長的字串 */
  function stripComments(src: string): string {
    return src
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  }

  it.each(RETIRED)('「%s」', (word) => {
    const offenders = files(PARENT_DIR).filter((f) => stripComments(readFileSync(f, 'utf8')).includes(word))
    expect(offenders).toEqual([])
  })
})
