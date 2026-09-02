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
    const css = read('src/views/governance/AuditLogView.vue')
    expect(css).not.toContain('#c0392b')
    expect(css).not.toContain('#27ae60')
  })
  it('家長 .pt-action-btn 背景改用 --m3-primary（非 #0d9053/--brand-primary）', () => {
    const css = read('src/parent/styles/patterns.css').replace(/\s+/g, ' ')
    expect(css).toMatch(/\.pt-action-btn\s*\{[^}]*background:\s*var\(--m3-primary/)
  })
  it('家長 --pt-warning-text 調深到 #8a5d00', () => {
    const css = read('src/parent/styles/globals.css')
    expect(css).toContain('--pt-warning-text:      #8a5d00')
    expect(css).not.toContain('--pt-warning-text:      #c99500')
  })
  it('PortalLayout .bottom-tab 未選中不再用 --text-tertiary 當文字', () => {
    const css = read('src/layouts/PortalLayout.vue').replace(/\s+/g, ' ')
    expect(css).toMatch(/\.bottom-tab\s*\{[^}]*color:\s*var\(--pt-text-muted/)
  })
})

describe('家長端 dark mode legacy 色階覆寫（2026-08-13 文字/背景對比修正）', () => {
  const globals = () => read('src/parent/styles/globals.css')
  const darkBlock = () => {
    const m = globals().match(/:root\[data-theme='dark'\] \{([\s\S]*?)\n\}/)
    if (!m) throw new Error("globals.css 找不到 :root[data-theme='dark'] 區塊")
    return m[1]
  }

  it('legacy 色階（cream / sky / sun / coral / leaf / grape）dark 區塊必須覆寫', () => {
    // 這些 token 在 light 是 pastel 背景＋深色文字；dark 未覆寫時背景維持淺色、
    // 而 --pt-text-* 已翻近白 → 白字配淺底看不到字（pt-page-hero 等 13 個 view 中雷）。
    const dark = darkBlock()
    const required = [
      '--cream:',
      '--sky-100:', '--sky-700:',
      '--sun-100:', '--sun-700:',
      '--coral-100:', '--coral-700:',
      '--leaf-100:', '--leaf-700:',
      '--grape-100:', '--grape-700:',
      // 2026-09-02：--pt-amber-bg 隨兩張待辦橫幅（PendingSignBanner /
      // PendingSurveyBanner）一起退場，token 本身已從 globals.css 刪除，
      // 這裡不再要求 dark 覆寫。原本守著它的獨立案例同時移除。
    ]
    for (const token of required) {
      expect(dark, `dark 區塊缺 ${token} 覆寫`).toContain(token)
    }
  })

  it('琥珀 token 已隨待辦橫幅退場，不應再定義（避免死碼復活）', () => {
    const css = globals()
    expect(css).not.toMatch(/--pt-amber-bg:/)
    expect(css).not.toMatch(/--pt-amber-icon-bg:/)
  })

  it('--sun-700 light 值調深至 AA（#c99500 對 sun-100 僅 2.45:1、對白底 2.9:1）', () => {
    expect(globals()).not.toMatch(/--sun-700:\s*#c99500/)
  })

  it('.pt-pill-success 文字不用 --brand-primary（#0d9053 對 leaf-100 僅 3.5:1）——P1 起改走童彩 leaf tonal 配對', () => {
    const css = read('src/parent/styles/patterns.css').replace(/\s+/g, ' ')
    expect(css).toMatch(/\.pt-pill-success \{[^}]*color: var\(--pt-accent-leaf-on/)
  })

  it('TimelineItem 不用 dark 不翻色的 --neutral-600 / 未定義的 --text-tertiary', () => {
    const sfc = read('src/parent/components/TimelineItem.vue')
    expect(sfc).not.toContain('--neutral-600')
    expect(sfc).not.toContain('--text-tertiary')
  })

  it('.pt-action-btn 文字用 --m3-on-primary（寫死 #fff 在 dark mint 底隱形）', () => {
    const css = read('src/parent/styles/patterns.css').replace(/\s+/g, ' ')
    expect(css).toMatch(/\.pt-action-btn \{[^}]*color: var\(--m3-on-primary/)
  })

  it('家長端不再出現 brand-primary 底＋pt-on-accent 白字配對（小字綠底一律 m3 配對）', () => {
    // globals.css 自身規範：小字綠底用 --m3-primary（#006d3d，白字 AA）。
    // --brand-primary(#0d9053) 配白字 light 僅 4.1:1，dark(#5aa842) 僅 3:1。
    const { readdirSync } = require('node:fs') as typeof import('node:fs')
    const root = resolve(process.cwd(), 'src/parent')
    const offenders: string[] = []
    for (const entry of readdirSync(root, { recursive: true }) as string[]) {
      if (!String(entry).endsWith('.vue')) continue
      const content = read(`src/parent/${entry}`)
      const collapsed = content.replace(/\s+/g, ' ')
      if (/background:\s*var\(--brand-primary[^;]*;[^}]{0,120}color:\s*var\(--pt-on-accent/.test(collapsed)) {
        offenders.push(String(entry))
      }
    }
    expect(offenders, `違規檔案：${offenders.join(', ')}`).toEqual([])
  })
})

describe('家長端狀態語意色（2026-09-01 UI/UX 打磨）', () => {
  it('DashboardHero 玻璃 pill 覆蓋不得吃掉 danger 警示色（逾期 chip 曾被白玻璃蓋到看不出事態）', () => {
    const sfc = read('src/parent/components/DashboardHero.vue').replace(/\s+/g, ' ')
    // 白玻璃覆蓋必須排除 tone-danger，讓 StatusPill 原生警示紅（淺紅底深紅字）呈現
    expect(sfc).toMatch(/\.dash-hero-pill:not\(\.tone-danger\)/)
    expect(sfc).not.toMatch(/\.dash-hero-pill \{[^}]*!important/)
  })
})
