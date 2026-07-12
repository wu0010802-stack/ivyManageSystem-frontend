// @vitest-environment node
/**
 * 深色模式 *-darker token 對比修復（quick-win 2026-06-26）。
 *
 * design-tokens.css 的 --color-*-darker 是 light-mode 深 hex（#15803d / #b45309 / #b91c1c /
 * #1d4ed8），供 *-soft 淺底上的強調文字用。a11y.css 的 html.dark 區段把 *-soft 翻成深色 alpha
 * tint，卻完全沒覆寫 *-darker → 變成「深底 + 深字」，對比塌到 ~1.7-2.2:1 遠未達 WCAG AA；
 * 全站約 110 處 `color: var(--color-*-darker)` 文字色引用（badge / chip / KPI 強調值）同時受害。
 *
 * 本測試鎖住：a11y.css 必須在 dark scope 覆寫四個 *-darker（防止再被移除而靜默回歸）。
 * 一處集中覆寫即同時修正全部引用點，無需逐檔動。
 *
 * ⚠ 反向用法（對抗式覆核 2026-06-26 抓到）：*-darker 有兩種互斥用途——
 *   ① 疊在 *-soft / token 深底上的「強調文字」（主流，全域覆寫後在 dark mode 變亮 = 修對）；
 *   ② 當「solid 背景」配白字（DismissalCallCard avatar），或當「文字」疊在「硬編淺底」上
 *      （travel-badge--yellow / search-highlight）→ 全域覆寫會讓這些塌掉對比。
 *   單一 token 值無法同時滿足，故這些反向站點需各自 dark-mode 窄覆寫。下方鎖住這些修復。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')

const a11yCss = read('../../src/assets/a11y.css')

describe('深色模式 *-darker token 覆寫（WCAG AA 對比）', () => {
  it('a11y.css 含 html.dark 區段', () => {
    expect(a11yCss).toContain('html.dark')
  })

  it.each(['success', 'warning', 'danger', 'info'])(
    'a11y.css 的 dark scope 覆寫 --color-%s-darker',
    (tone) => {
      expect(a11yCss).toMatch(new RegExp(`--color-${tone}-darker\\s*:`))
    },
  )
})

describe('深色模式 *-darker 反向用法回歸防護（對抗式覆核 2026-06-26）', () => {
  it('招生 travel-badge--yellow 改用會翻深底的 *-soft token，不留硬編淺底 #fef9c3（否則 dark mode 亮字疊淺底近乎不可見）', () => {
    const area = read('../../src/components/recruitment/RecruitmentAreaTab.vue')
    const stats = read('../../src/components/recruitment/RecruitmentStatsPanel.vue')
    expect(area).not.toMatch(/badge--yellow\s*\{[^}]*#fef9c3/)
    expect(stats).not.toMatch(/badge--yellow\s*\{[^}]*#fef9c3/)
  })

  it('DismissalCallCard 的 .dcall__mono（*-darker 當背景＋白字）有 dark-mode 深底覆寫', () => {
    const card = read('../../src/components/dismissal/DismissalCallCard.vue')
    expect(card).toMatch(/html\.dark[^{]*\.dcall__mono/)
  })

  it('GlobalSearch 的 .search-highlight（硬編淺底＋darker 文字）有 dark-mode 覆寫', () => {
    const gs = read('../../src/components/GlobalSearch.vue')
    expect(gs).toMatch(/html\.dark[^{]*\.search-highlight/)
  })

  it('PortalLayout 的 .install-banner（success-darker 疊硬編淺綠底）有 dark-mode 覆寫', () => {
    const layout = read('../../src/layouts/PortalLayout.vue')
    expect(layout).toMatch(/html\.dark[^{]*\.install-banner/)
  })

  it('AddressHeatmap 跨元素受害者（白卡/淺底上的 darker 文字）有 dark-mode 覆寫', () => {
    // 2026-07-12 元件邊界拆分：nearby-school-name／rating-score 隨附近幼兒園清單移到
    // RecruitmentNearbySchoolList.vue，gov-detail-link 隨政府登錄詳情面板移到
    // RecruitmentSchoolGovDetail.vue（CSS 隨其擁有的 markup 一併搬移，覆寫本身未刪除）。
    const nearbyList = read(
      '../../src/components/recruitment/RecruitmentNearbySchoolList.vue',
    )
    const govDetail = read(
      '../../src/components/recruitment/RecruitmentSchoolGovDetail.vue',
    )
    // 代表性鎖住：nearby-school-name（父白卡）、gov-detail-link（父 #f8fbff）、rating-score（父白卡）
    expect(nearbyList).toMatch(/html\.dark[^{]*\.nearby-school-name/)
    expect(govDetail).toMatch(/html\.dark[^{]*\.gov-detail-link/)
    expect(nearbyList).toMatch(/html\.dark[^{]*\.rating-score/)
  })

  it('RecruitmentAreaTab 的 .dc-stat-val（硬編白 .district-card 內的 darker 文字）有 dark-mode 覆寫', () => {
    const area = read('../../src/components/recruitment/RecruitmentAreaTab.vue')
    expect(area).toMatch(/html\.dark[^{]*\.dc-stat--ok\s+\.dc-stat-val/)
    expect(area).toMatch(/html\.dark[^{]*\.dc-stat--warn\s+\.dc-stat-val/)
  })

  // 反例守衛：StatsPanel/Chuannian/Ivykids 的 kpi-value 在「會翻深底的 el-card」內，
  // 上游全域 override 把文字翻亮即正確（~10:1）；不可再加 dark 深字覆寫（否則 dark-on-dark）。
  it('StatsPanel 不得對 el-card 內 kpi-value 加 dark 深字覆寫（誤診守衛）', () => {
    const stats = read('../../src/components/recruitment/RecruitmentStatsPanel.vue')
    expect(stats).not.toMatch(/html\.dark[^{]*\.kpi-card[^{]*\.kpi-value/)
  })
})

describe('報表當月欄高亮（.col-current）dark-mode 覆寫（瀏覽器驗證發現：html.ivy-admin 把 --el-color-primary-light-9/-8 釘死成 light hex，不隨 html.dark 翻轉，導致當月欄整欄白底疊淺字看不到）', () => {
  it('MonthlyPnLPanel 的 .col-current light 預設仍是 primary-light-9/-8，且有 dark-mode 窄覆寫', () => {
    const pnl = read('../../src/views/reports/MonthlyPnLPanel.vue')
    expect(pnl).toMatch(/\.pnl-table \.col-current\s*\{[^}]*--el-color-primary-light-9/)
    expect(pnl).toMatch(/\.pnl-table thead th\.col-current\s*\{[^}]*--el-color-primary-light-8/)
    expect(pnl).toMatch(/html\.dark \.pnl-table \.col-current/)
    expect(pnl).toMatch(/html\.dark \.pnl-table thead th\.col-current/)
  })

  it('MonthlyFixedCostPanel 的 .col-current light 預設仍是 primary-light-9/-8，且有 dark-mode 窄覆寫', () => {
    const fc = read('../../src/views/reports/MonthlyFixedCostPanel.vue')
    expect(fc).toMatch(/\.fc-table \.col-current\s*\{[^}]*--el-color-primary-light-9/)
    expect(fc).toMatch(/\.fc-table thead th\.col-current\s*\{[^}]*--el-color-primary-light-8/)
    expect(fc).toMatch(/html\.dark \.fc-table \.col-current/)
    expect(fc).toMatch(/html\.dark \.fc-table thead th\.col-current/)
  })
})
