# 前端 echarts 移除 — 改用 chart.js 統一 chart 引擎

**日期**：2026-05-28
**範圍**：純前端（ivy-frontend），後端零變更
**狀態**：spec — 待 user review D1/D2/D3 後進 writing-plans
**所屬序列**：goal /audit-findings A 項（A→B→C 串行，B/C 為後續 sub-project）

---

## 1. 背景與問題

`du -sh dist/assets/*.js` 顯示：

```
732K  vendor
516K  echarts        ← 整包約 95 KB gz，只有 2 個 caller
508K  element-plus
332K  parent-app
316K  portal
192K  chart-vendor   ← chart.js + vue-chartjs（已是 dep，admin 端 9 處在用）
```

問題：**chart.js 與 echarts 兩套 chart 引擎並存**，echarts 只剩兩個 caller，且兩個 chart 都是單條 line chart（chart.js 完全勝任）：

| 檔案 | 用途 | 當前 chart 規格 |
|------|------|----------------|
| `src/components/student/MeasurementChart.vue` | admin 端學童身高/體重/頭圍/視力曲線 | line / smooth / 客製 tooltip / xAxis rotate 30 / single series |
| `src/parent/views/ChildMeasurementsView.vue` | 家長 LIFF 端身高/體重曲線（tab 切換） | line / smooth / area opacity 0.08 / 客製 tooltip / 動態 import echarts |

維運與 bundle 影響：
- 前端要維護兩套 chart API（option 物件 vs ChartData/ChartOptions）
- 家長 LIFF 行動網路下，進到 measurement 頁要下載 ~95 KB gz echarts chunk
- echarts dep + vite.config 切 chunk 的維護成本（含 `assets/echarts-*.js` PWA globIgnores）

---

## 2. 範圍

### In scope（本次做）

- 新建 `src/composables/useChartJs.ts`（admin + parent 共用，純 chart.js 註冊，無 element-plus 依賴）
- `src/views/reports/chartSetup.ts` 改為 thin re-export shim 指向 `useChartJs.ts`（**零破壞 9 個現有 caller**）
- `MeasurementChart.vue` 改寫成 `vue-chartjs.Line` + ChartData / ChartOptions
- `ChildMeasurementsView.vue` 改寫成 `vue-chartjs.Line`，移除自寫的 `ensureEcharts()` dynamic import
- `vite.config.js` 移除 echarts manualChunks 規則
- `package.json` 移除 `echarts` dep，`npm install` 更新 lock
- build / typecheck / 既有 vitest 全綠 + 手測 admin + parent measurement 頁面

### Out of scope（不做）

- 不改 `src/views/reports/` 9 個既有 caller 的 import path（透過 shim 零影響）
- 不擴張 chart.js 功能（不加新 chart 類型、不換 colorscheme）
- 不寫 unit test 給兩個 measurement chart（render 邏輯純粹是 wrapper，build + typecheck + 手測 cover；類比現有 reports panels 也無 unit test）
- 不動 manualChunks 其他規則（leaflet / fullcalendar / portal / parent-app / activity-admin / public-app / admin-core / shared-common 全保留）

### Follow-up（不在本 spec）

- B: 慢請求 SLO 看板 + 告警（next sub-project）
- C: response_model 全覆蓋 + CI gate（last sub-project）

---

## 3. 設計

### §1 D1：`useChartJs.ts` 位置與 shim 策略

新建 `src/composables/useChartJs.ts`，承載核心註冊邏輯：

```ts
import { defineAsyncComponent } from 'vue'

let _chartReady: Promise<void> | null = null
export const ensureChartReady = (): Promise<void> => {
  if (!_chartReady) {
    _chartReady = import('chart.js').then(({
      Chart, CategoryScale, LinearScale, RadialLinearScale,
      PointElement, LineElement, BarElement, ArcElement,
      Title, Tooltip, Legend, Filler,
    }) => {
      Chart.register(
        CategoryScale, LinearScale, RadialLinearScale,
        PointElement, LineElement, BarElement, ArcElement,
        Title, Tooltip, Legend, Filler,
      )
    })
  }
  return _chartReady
}

export const LineChart = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Line)),
)
export const BarChart = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Bar)),
)
export const PieChart = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Pie)),
)
export const RadarChart = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Radar)),
)

export const MONTH_LABELS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
]
```

`src/views/reports/chartSetup.ts` 變成 6 行 shim：

```ts
// 兼容歷史 import path，內容已搬到 src/composables/useChartJs.ts
export {
  ensureChartReady,
  LineChart, BarChart, PieChart, RadarChart,
  MONTH_LABELS,
} from '@/composables/useChartJs'
```

**Why composables/ 而不是 utils/**：`useChartJs` 名稱遵循 Vue composables 慣例（`use*` prefix）；utils/ 是純 function helpers，這裡含 `defineAsyncComponent` Vue API。**Why shim 而不是更新 9 個 caller**：減少本 PR 改動面，避免 chart 引擎替換被 import path rename 噪音淹沒；shim 一行 re-export 維護成本接近零，且未來如要全面遷移 caller，是獨立 PR 的事。

### §2 D2：視覺對齊度（pixel-level）

兩個 chart 的 echarts → chart.js 視覺映射（全部對齊到 1:1）：

| 視覺項 | echarts | chart.js 對應 |
|--------|---------|-------------|
| smooth | `smooth: true` | `tension: 0.3`（與 `src/views/reports/SalaryPanel.vue` 既有 line chart 一致） |
| line color | `lineStyle.color: '#0d9053'` | `borderColor: '#0d9053'`（admin MeasurementChart 身高/體重均用此色；parent 端 weight 換 `#33aaaa`） |
| point | `symbol: 'circle'`, `symbolSize: 6\|7` | `pointStyle: 'circle'`, `pointRadius: 6` or `7`, `pointBackgroundColor` 同 borderColor |
| area fill（僅 parent） | `areaStyle: { color, opacity: 0.08 }` | `fill: 'origin'`, `backgroundColor: 'rgba(13,144,83,0.08)'`（plus Filler plugin 已在 ensureChartReady register） |
| 客製 tooltip（parent） | `tooltip.backgroundColor: '#fffcf2'`, `borderColor: 'rgba(13,144,83,0.18)'`, `textStyle: { color: '#392a1c' }` | `options.plugins.tooltip.backgroundColor / borderColor / borderWidth / titleColor / bodyColor` |
| 客製 tooltip（admin formatter） | `formatter: (params) => \`${axisValue}<br/>${seriesName}：${value}\`` | `options.plugins.tooltip.callbacks.label: (ctx) => \`${seriesName}：${ctx.parsed.y}\`` + `title: (items) => items[0].label` |
| x axis label rotate | `axisLabel: { rotate: 30, fontSize: 10\|11 }` | `options.scales.x.ticks.maxRotation: 30, minRotation: 30, font: { size: 10\|11 }` |
| y axis label | `name: 'cm'`, `nameTextStyle: { fontSize: 12 }` | `options.scales.y.title: { display: true, text: 'cm', font: { size: 12 } }` |
| y axis scale | `scale: true`（parent，不從 0 起算） | `options.scales.y.beginAtZero: false` |
| grid 邊距（admin） | `grid: { left: 50, right: 20, top: 48\|20, bottom: 40 }` | `options.layout.padding: { left: 10, right: 20, top: 10, bottom: 10 }`（chart.js 自動算 axis 空間；只調 padding，避免硬寫 px） |
| empty state | `v-if="isEmpty"` div | 保留 v-if 邏輯，不畫 chart |
| resize | `window.addEventListener('resize', () => chartInstance.resize())` | chart.js Vue wrapper `responsive: true` + `maintainAspectRatio: false` 自動處理，**移除手寫 resize listener** |

**Empty state 處理**：
- `MeasurementChart.vue`（admin）：用 `v-if="!isEmpty"` 條件 render `<LineChart>`（取代既有 `v-show="!isEmpty"` 在 div ref 上），無資料時直接不 mount chart 元件 — 比 v-show 隱藏 echarts canvas 更乾淨
- `ChildMeasurementsView.vue`（parent）：同樣 `v-if="!loading && currentSeries.length"` 條件 render `<LineChart>`，與既有 empty msg `v-if` 對齊；無需手動管 chartInstance lifecycle（vue-chartjs wrapper 自動處理）

**type 嚴格**：用 `ChartData<'line', (number|null)[]>` 與 `ChartOptions<'line'>`，避免 `as any`。實際資料是 string number 混合 (`y: number | string`)，在 `computed` 內 `Number()` 強轉並保留 `null` 給空值。

### §3 D3：vite.config.js + package.json 清理

`vite.config.js` 變更（兩處）：

```diff
-    // A3: echarts 整包約 300 KB raw / ~95 KB gz；MeasurementChart 內部 dynamic import
-    if (
-        id.includes('/node_modules/echarts/') ||
-        id.includes('/node_modules/zrender/')
-    ) {
-        return 'echarts'
-    }
```

`globIgnores` 確認無 `echarts-*.js`（目前看只列 `chart-vendor-*.js` 與 `**/*512*`）。**保留** `chart-vendor` 規則不動。

`package.json` 變更（dependencies 區塊一處）：

```diff
-        "echarts": "^6.0.0",
```

`package-lock.json` 由 `npm install` 自動清理（echarts 是頂層 dep，無其他 dep 拉它，移除後 lock 也會少 echarts + zrender + tslib 相關子樹）。

---

## 4. Bundle 預期變化

**移除前** (dist/assets/)：
- echarts: 516K raw / ~95K gz（lazy chunk，僅 measurement 頁面下載）
- chart-vendor: 192K raw / ~50K gz（admin 端 reports 頁面已 lazy 用）
- parent-app: 332K raw（含 echarts dynamic import boundary）

**移除後預期**：
- echarts chunk：**消失**
- chart-vendor: 不變（同個 chunk，多了兩個 caller）
- parent-app: 略減（少了 ensureEcharts() 邏輯）
- 新增 parent → chart-vendor lazy 依賴：parent LIFF 進 measurement 頁時下載 ~50K gz chart-vendor
- **淨：parent measurement 頁面省 ~45K gz；admin measurement 頁面 share reports 已下載的 chart-vendor，省 ~95K gz**

**驗證命令**：
```bash
cd /Users/yilunwu/Desktop/ivy-frontend
npm run build
du -sh dist/assets/*.js | sort -hr | head -20
# 確認：echarts-*.js 消失，chart-vendor 大小合理
```

---

## 5. 風險與緩解

| 風險 | 機率 | 影響 | 緩解 |
|------|------|------|------|
| chart.js 視覺與 echarts 不完全一致（家長感受異樣） | 中 | 中 | D2 像素級對齊表格；手測對照截圖 |
| parent bundle 拉 chart-vendor 引發 manualChunks 連鎖 | 低 | 中 | 既有 chart-vendor 規則先於 parent-app 攔截 chart.js node_modules；vite.config 註解有警告 layer ordering，本次不動 ordering |
| chart.js `Filler` plugin 未 register 導致 areaStyle 失效 | 低 | 低 | 既有 `chartSetup.ts` 已 register Filler，shim 後沿用 |
| `chart.js` v4 與 `vue-chartjs` v5 type 不對齊 | 低 | 低 | 沿用 reports panels 既有 pattern（ChartData/ChartOptions 已實證可用） |
| 既有 9 個 reports caller 因 import path 改動破壞 | 低 | 高 | shim 保留 `chartSetup.ts` 原 export；CI typecheck 防回歸 |
| echarts 移除後 PWA service worker 仍 cache 舊 chunk | 低 | 低 | 既有 vite-plugin-pwa 走 cleanupOutdatedCaches；用戶下次開頁 SW skipWaiting 自動 reload |

---

## 6. 驗證

### Build / typecheck / 測試

```bash
cd /Users/yilunwu/Desktop/ivy-frontend
npm run typecheck                      # 0 error
npm test                               # 既有 2600+ 全綠（regression）
npm run build                          # echarts chunk 消失
du -sh dist/assets/echarts-*.js 2>&1   # 預期 "No such file or directory"
du -sh dist/assets/chart-vendor-*.js   # 確認大小未爆增
```

### 手測 checklist

**admin 端**：
1. 登入 → 學童管理 → 任一在學學童 → 詳情頁 → measurement 區塊
2. 確認身高/體重/頭圍/視力曲線正常顯示
3. hover 點看 tooltip 文案（`身高 (cm)：123.4` 格式）
4. 視窗 resize（拖瀏覽器寬度）chart 自動 reflow

**parent LIFF 端**：
1. 切到 parent dev URL（`http://localhost:5173/parent/`）→ login mock
2. 進到 child measurement 頁面
3. 點 height tab → 看曲線（綠色 `#0d9053`）+ area fill（淡綠）
4. 點 weight tab → 看曲線（藍綠 `#33aaaa`）+ area fill
5. hover 看 tooltip（米色背景 `#fffcf2`）
6. 視窗 resize 自動 reflow
7. 從空資料學童進入時 empty state 顯示「尚無 X 紀錄」

---

## 7. 提交策略

單 PR in `ivy-frontend` repo（worktree `feat/echarts-removal-2026-05-28-frontend`）。

5 commits（含 spec / plan）：

1. **docs(spec)**: spec 落地 + plan 落地
2. **refactor(chart)**: 新建 `src/composables/useChartJs.ts` + `chartSetup.ts` shim 化
3. **refactor(chart)**: MeasurementChart.vue 改寫 echarts → chart.js
4. **refactor(chart)**: ChildMeasurementsView.vue 改寫 echarts → chart.js
5. **chore(deps)**: 移除 echarts + zrender + vite.config echarts manualChunks 規則

PR title: `refactor(chart): replace echarts with chart.js for measurement charts`

PR description 重點：
- bundle diff 截圖（before/after `du`）
- D1/D2/D3 設計決策連結到 spec
- 手測 checklist 跑過確認
- 零 schema/API 變更（純 frontend）

---

## 8. 完成定義（Definition of Done）

- [ ] spec + plan 落地 commit
- [ ] `useChartJs.ts` 新建 + `chartSetup.ts` shim 化
- [ ] 兩個 measurement chart 改寫完成
- [ ] `vite.config.js` echarts 規則移除
- [ ] `package.json` echarts dep 移除 + `package-lock.json` 更新
- [ ] `npm run typecheck` 0 error
- [ ] `npm test` 既有 testsuite 全綠（無新增測試）
- [ ] `npm run build` 成功
- [ ] `dist/assets/echarts-*.js` 不存在
- [ ] admin 手測 4 條 pass
- [ ] parent 手測 7 條 pass
- [ ] PR opened（待 user merge）
