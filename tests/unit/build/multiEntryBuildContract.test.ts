import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function manifestHrefs(html: string): string[] {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => {
      if (!/\brel=["']manifest["']/i.test(tag)) return null
      return /\bhref=["']([^"']+)["']/i.exec(tag)?.[1] ?? null
    })
    .filter((href): href is string => href !== null)
}

describe('multi-entry build contract', () => {
  it('runs frontend CI for pull requests targeting staging as well as main', () => {
    const ci = readProjectFile('.github/workflows/ci.yml')
    expect(ci).toContain('pull_request:\n    branches: [main, staging]')
  })

  it.each([
    ['index.html', '/manifest.webmanifest'],
    ['parent/index.html', '/parent.webmanifest'],
    ['public.html', '/public.webmanifest'],
  ])('%s explicitly owns exactly one manifest', (entry, expectedManifest) => {
    expect(manifestHrefs(readProjectFile(entry))).toEqual([expectedManifest])
  })

  it('disables VitePWA global manifest injection', () => {
    // Multi-page builds cannot use the plugin's one-manifest-for-every-HTML injection.
    // Each entry links its own static manifest above; the plugin remains responsible for SW generation.
    expect(readProjectFile('vite.config.js')).toContain('manifest: false')
  })

  it('keeps Rollup CommonJS helpers with vue-core to avoid a vendor cycle', () => {
    const config = readProjectFile('vite.config.js')
    const helperRule = "id.includes('commonjsHelpers.js')"
    const genericFilter = "if (!id.includes('node_modules') && !id.includes('/src/'))"

    expect(config).toContain(helperRule)
    expect(config.indexOf(helperRule)).toBeLessThan(config.indexOf(genericFilter))
  })

  it('leaves ambiguous section names to explicit imports', () => {
    const config = readProjectFile('vite.config.js')

    // These names exist in multiple feature folders. Auto-discovery otherwise picks
    // whichever file is scanned first and emits a naming-conflict warning on every build.
    expect(config).toContain('excludeNames: [/^(AttendanceSection|LeaveSection)$/]')

    expect(readProjectFile('src/views/EmployeeDetailView.vue')).toContain(
      "import AttendanceSection from '@/components/employee/detail/AttendanceSection.vue'",
    )
    expect(readProjectFile('src/components/student/workbench/TodayTasksPanel.vue')).toContain(
      "import AttendanceSection from '@/components/student/academic-affairs/AttendanceSection.vue'",
    )
    expect(readProjectFile('src/components/student/workbench/TodayTasksPanel.vue')).toContain(
      "import LeaveSection from '@/components/student/academic-affairs/LeaveSection.vue'",
    )
    expect(readProjectFile('src/components/student/tabs/RecordsTab.vue')).toContain(
      "import LeaveSection from '@/components/student/tabs/academic/LeaveSection.vue'",
    )
  })

  it('does not collapse route-scoped Element Plus modules into one eager chunk', () => {
    const config = readProjectFile('vite.config.js')
    const elementPlusRule = config.indexOf(
      "if (id.includes('element-plus') || id.includes('@element-plus'))",
    )
    const vueRule = config.indexOf("if (\n        id.includes('/node_modules/vue/')", elementPlusRule)

    expect(elementPlusRule).toBeGreaterThan(-1)
    expect(vueRule).toBeGreaterThan(elementPlusRule)
    expect(config.slice(elementPlusRule, vueRule)).toContain('return undefined')
    expect(config.slice(elementPlusRule, vueRule)).not.toContain("return 'element-plus'")
  })

  // 多租戶（4d/fb，CT-F-02）：`name` 改斷言 **token**（真正的值由 nginx sub_filter
  // 依 $host 注入），反向鎖住「不得退回硬編品牌字面」。
  // `start_url` / `scope` 的斷言**保留原樣**——那是 entry 邊界契約（哪個 HTML 對應
  // 哪個 PWA scope），與品牌無關，不得一起 token 化。
  it.each([
    ['public/manifest.webmanifest', '{{TB_MANIFEST_ADMIN_NAME}}', './', './'],
    ['public/parent.webmanifest', '{{TB_MANIFEST_PARENT_NAME}}', '/parent/', '/parent/'],
    ['public/public.webmanifest', '{{TB_MANIFEST_PUBLIC_NAME}}', '/public.html', '/public.html'],
  ])('%s has entry-scoped install identity', (path, name, startUrl, scope) => {
    const manifest = JSON.parse(readProjectFile(path))
    expect(manifest).toMatchObject({ name, start_url: startUrl, scope })
  })
})
