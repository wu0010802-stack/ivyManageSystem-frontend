/**
 * tests/unit/styles/containerCardNoHoverLift.spec.ts
 *
 * main.css 讓 .el-card hover 時 translateY(-2px)；容器卡（shadow="never"）本該退出這個抬升。
 * 舊的退出規則寫成 `.el-card[shadow="never"]:hover`，但 shadow 是元件 prop、不會渲染成
 * DOM 屬性（Element Plus 實際輸出 class `is-never-shadow`），所以那條規則從來沒生效：
 * 120 張容器卡滑鼠一停就抬起，而且 transform 會讓卡內未 append-to-body 的 el-drawer／
 * el-dialog（position: fixed）被困在卡片框裡（2026-11-02 學生儀表板「批次點名」抽屜
 * 只剩 430px 寬、學號被擠成兩行）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf-8')

describe('main.css 容器卡不隨 hover 抬升', () => {
  it('退出規則用 Element Plus 實際渲染的 .is-never-shadow class，並把 transform 歸零', () => {
    const rule = [...css.matchAll(/([^{}]*\.el-card[^{}]*:hover[^{}]*)\{([^}]*)\}/g)]
      .find(([, selector]) => selector.includes('.is-never-shadow'))
    expect(rule, '缺少 .el-card.is-never-shadow:hover 的退出規則').toBeDefined()
    expect(rule![2]).toMatch(/transform:\s*none/)
  })

  it('全 src 不再有 .el-card[shadow=…] 屬性選擇器（prop 不會變成 DOM 屬性，寫了等於沒寫）', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
          if (name !== 'node_modules' && name !== '__tests__') walk(full)
        } else if (/\.(vue|css|scss)$/.test(name)) {
          const text = readFileSync(full, 'utf-8')
          // 只看選擇器（去掉註解）
          const code = text.replace(/\/\*[\s\S]*?\*\//g, '')
          if (/\.el-card\[shadow=/.test(code)) offenders.push(full)
        }
      }
    }
    walk(resolve(process.cwd(), 'src'))
    expect(offenders).toEqual([])
  })
})
