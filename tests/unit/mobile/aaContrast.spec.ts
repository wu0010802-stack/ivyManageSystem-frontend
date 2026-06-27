import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('WCAG AA 顏色收斂', () => {
  it('main.css 對 light-effect el-tag 套用 *-darker 文字色', () => {
    const css = read('src/assets/main.css').replace(/\s+/g, ' ')
    expect(css).toMatch(/\.el-tag--warning[^{]*\{[^}]*--color-warning-darker/)
    expect(css).toMatch(/\.el-tag--success[^{]*\{[^}]*--color-success-darker/)
    expect(css).toMatch(/\.el-tag--danger[^{]*\{[^}]*--color-danger-darker/)
    expect(css).toMatch(/\.el-tag--info[^{]*\{[^}]*--color-info-darker/)
  })
  it('AuditLogView diff 文字不再用硬編 #c0392b/#27ae60', () => {
    const css = read('src/views/AuditLogView.vue')
    expect(css).not.toContain('#c0392b')
    expect(css).not.toContain('#27ae60')
  })
})
