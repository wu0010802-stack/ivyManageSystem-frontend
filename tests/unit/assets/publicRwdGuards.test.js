import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PUBLIC_VIEWS_DIR = resolve('src/views/public')

function collectVueFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return collectVueFiles(full)
    return entry.name.endsWith('.vue') ? [full] : []
  })
}

describe('公開報名頁 RWD guard', () => {
  // 2026-07-30 收斂前曾混用 600/640/700/769/900px 寫死斷點，造成
  // 601–768px 區間「桌機 sticky 費用欄與手機吸底 CTA 兩者皆無」的死區
  it('@media 斷點一律用 --bp-*/--to-* token，不得寫死 px', () => {
    for (const file of collectVueFiles(PUBLIC_VIEWS_DIR)) {
      const src = readFileSync(file, 'utf8')
      const raw = src.match(/@media[^{]*\((?:min|max)-width:[^)]*\)/g)
      expect(raw, `${file} 的 @media 應改用 breakpoints.media.css token`).toBeNull()
    }
  })

  it('tap-target 熱區 utility 存在於 public-theme.css', () => {
    const css = readFileSync(resolve('src/assets/public-theme.css'), 'utf8')
    expect(css).toContain('.tap-target::after')
  })

  // RWD 稽核 P3-2：這些檔案各有視覺 <44px 的控制項（poster-action／
  // page-backlink／toast-close／modal-close／video-btn），熱區靠 tap-target 撐開
  it('已知小尺寸控制項掛上 tap-target', () => {
    const files = [
      'ActivityPublicView.vue',
      'ActivityPublicQueryView.vue',
      'components/ToastStack.vue',
      'components/VideoModal.vue',
      'components/ContactInquiryModal.vue',
      'components/SuccessSummaryModal.vue',
      'components/CoursePickerSection.vue',
    ]
    for (const name of files) {
      const src = readFileSync(join(PUBLIC_VIEWS_DIR, name), 'utf8')
      expect(src, `${name} 應含 tap-target class`).toContain('tap-target')
    }
  })
})
