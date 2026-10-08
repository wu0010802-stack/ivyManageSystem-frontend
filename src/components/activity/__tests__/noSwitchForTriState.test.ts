import { describe, it, expect } from 'vitest'

/**
 * 擋整類守衛（2026-09-14 P0）：三態欄位不得綁 `el-switch`。
 *
 * Element Plus 的 switch 掛載時會把不在 [active-value, inactive-value] 內的
 * modelValue（含 null／undefined）立刻 emit 成 inactive-value。才藝點名的
 * `is_present` 是 true／false／null 三態，綁上去等於「打開畫面就把未點名全部改成
 * 缺席」。這個 bug 型別檢查看不出來（型別確實是 boolean | null）、既有元件測試也
 * 看不出來（表格與控制項都被 stub 掉），只有掃原始碼或實跑才擋得住。
 *
 * 正解是 `@/components/activity/AttendanceMarkControl.vue`（出席／缺席兩顆按鈕，
 * 皆未選＝未點名）。新增其他三態欄位時，把欄位名補進 TRI_STATE_BINDINGS。
 */
const TRI_STATE_BINDINGS = ['is_present']

// 只掃 `<el-switch ...>` 標籤本身的屬性區塊，不掃註解或說明文字——否則本檔與
// AttendanceMarkControl 裡「為什麼不能用 el-switch」的註解會把守衛自己打紅。
const SWITCH_TAG = /<el-switch\b[^>]*>/g

const sources = import.meta.glob('/src/**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('三態欄位不得綁 el-switch', () => {
  it('掃得到 .vue 原始碼（守衛本身沒有空轉）', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100)
  })

  it('沒有任何 el-switch 綁在三態欄位上', () => {
    const offenders: string[] = []

    for (const [path, source] of Object.entries(sources)) {
      for (const tag of source.match(SWITCH_TAG) ?? []) {
        if (TRI_STATE_BINDINGS.some((field) => tag.includes(field))) {
          offenders.push(`${path}: ${tag.replace(/\s+/g, ' ').slice(0, 120)}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('點名用的出缺席控制項存在且不是 switch', () => {
    const control = sources['/src/components/activity/AttendanceMarkControl.vue']

    expect(control).toBeTruthy()
    expect(control.match(SWITCH_TAG)).toBeNull()
    expect(control).toContain('data-test="mark-present"')
    expect(control).toContain('data-test="mark-absent"')
  })
})
