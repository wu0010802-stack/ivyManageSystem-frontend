import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const router = fs.readFileSync(path.resolve(__dirname, '../../src/router/index.ts'), 'utf-8')
const sidebar = fs.readFileSync(path.resolve(__dirname, '../../src/components/layout/AdminSidebar.vue'), 'utf-8')
describe('官網報名選單收進招生統計', () => {
  it('sidebar 無獨立 recruitment-ivykids menu item', () => {
    expect(sidebar).not.toContain('index="/recruitment-ivykids"')
  })
  it('router /recruitment-ivykids 改 redirect 到 /recruitment', () => {
    expect(router).toMatch(/recruitment-ivykids[\s\S]{0,120}redirect:\s*['"]\/recruitment['"]/)
  })
})
