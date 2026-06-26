import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { dirname } from 'node:path'

// worktree 中 import.meta.url 可能不是 file:// 協議，改用 process.cwd() 相對路徑
const SRC = resolve(dirname(new URL(import.meta.url).pathname), '../../src')

// 合法的非斷點用法（佈局計算 / 斷點來源本體）允許保留裸用法。
const ALLOW = new Set([
  'views/public/components/CoursePickerSection.vue', // popover 定位計算
  'components/portal/class-hub/ClassHubMessagesDrawer.vue', // responsive 寬度計算
  'composables/useIsMobile.ts', // 斷點單一來源本體
])

const FORBIDDEN = [
  /innerWidth\s*<\s*768\b/,
  /matchMedia\(\s*['"`]\(max-width:\s*767px\)/,
]

function listFiles(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .map((p) => p.replaceAll('\\', '/'))
    .filter((p) => /\.(vue|ts)$/.test(p) && !p.includes('__tests__'))
}

describe('禁止 useIsMobile 以外的裸手機斷點偵測', () => {
  it('src 內無 ad-hoc 手機斷點（改用 useIsMobile()）', () => {
    const offenders: string[] = []
    for (const rel of listFiles(SRC)) {
      if (ALLOW.has(rel)) continue
      const code = readFileSync(join(SRC, rel), 'utf-8')
      if (FORBIDDEN.some((re) => re.test(code))) offenders.push(rel)
    }
    expect(offenders, `改用 useIsMobile()：\n${offenders.join('\n')}`).toEqual([])
  })
})
