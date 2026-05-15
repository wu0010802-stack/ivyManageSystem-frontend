# 報表統計優化 P3：整合招生 / 流失預警 tab（Reports Optimization Phase 3）

**日期**：2026-05-15
**範圍**：純前端（ivy-frontend），admin「報表統計」頁
**分支**：`feat/reports-p3-analytics-integration-frontend`（已開，從 main 切）
**狀態**：設計中，待 user 審閱
**前置**：P1 PR #18 / P2 PR #20 進行中；P3 從 main 切，與 P1/P2 不衝突（只動 ReportsView tabs 結構）

---

## 1. 背景與動機

P1/P2 把現有「概況/收支/出勤/薪資」4 個 tab 的載入性能與下鑽能力完備了，但 admin 報表覆蓋仍有缺口：

**現況分裂**：
- `/reports`：4 個 tab（人事面向）
- `/analytics`：2 個 tab（招生漏斗 + 流失預警）

業務側看「整體經營」要在兩個頁面跳來跳去，且 `/analytics` 入口較隱蔽（側欄分開）。

**P3 解決方案**：把 `FunnelPanel` 與 `ChurnPanel` 直接 import 進 `ReportsView`，6 個 tab 集中於 `/reports`。**不動既有 panel 內部、不動 backend、不刪 `/analytics` 路由**（保 backward compat）。

---

## 2. 解決方案

### 2.1 ReportsView 加 2 個 tab

修改 `src/views/ReportsView.vue` 加：

```vue
<el-tab-pane v-if="canSeeAnalytics" label="招生漏斗" name="funnel">
  <FunnelPanel v-if="activeTab === 'funnel'" />
</el-tab-pane>
<el-tab-pane v-if="canSeeAnalytics" label="流失預警" name="churn">
  <ChurnPanel v-if="activeTab === 'churn'" />
</el-tab-pane>
```

其中：
```js
import FunnelPanel from '@/views/analytics/FunnelPanel.vue'
import ChurnPanel from '@/views/analytics/ChurnPanel.vue'
import { hasPermission } from '@/utils/auth'

const canSeeAnalytics = computed(() => hasPermission('BUSINESS_ANALYTICS'))
```

- 直接 import 跨資料夾既有元件，**不移動檔案**，不複製程式碼
- Tab 用 `v-if` lazy mount（與 P1 既有 4 tab 一致）
- `canSeeAnalytics` computed：權限缺則 tab 隱藏

### 2.2 Tab 順序

依「人事 → 業務」邏輯：

| 順序 | tab | 權限 |
|---|---|---|
| 1 | 概況 | REPORTS |
| 2 | 收支彙總 | REPORTS |
| 3 | 出勤 | REPORTS |
| 4 | 薪資 | REPORTS |
| 5 | **招生漏斗（P3 新）** | BUSINESS_ANALYTICS |
| 6 | **流失預警（P3 新）** | BUSINESS_ANALYTICS |

### 2.3 不動 `/analytics` 路由

保留 `src/router/index.js` 既有設定：
- `/analytics` → AnalyticsView shell
- `/analytics/funnel` → FunnelPanel
- `/analytics/churn` → ChurnPanel

理由：
1. **Backward compat**：書籤、外部連結（若有）不破
2. **訪問成本**：保留兩條路徑不增加複雜度（共用同 component）
3. **將來移除是另一個獨立決策**：交給 user / 後續 phase

### 2.4 權限與顯示

- 持有 REPORTS 但無 BUSINESS_ANALYTICS：看 4 tab（不顯招生/流失）
- 持有 BUSINESS_ANALYTICS 但無 REPORTS：**進不來 /reports 頁面**（route guard 已擋）
- 兩個都有：看 6 tab

第二種情況需另外考慮：如果只有 BUSINESS_ANALYTICS 的 user，是否仍走 `/analytics` 路由？**是**——`/analytics` 路由保留就是給這類 user 的。

---

## 3. 不做的事（YAGNI）

- ❌ 不動 FunnelPanel / ChurnPanel 內部（直接 import 重用）
- ❌ 不移檔（Funnel/Churn 留在 `views/analytics/`）
- ❌ 不刪 `/analytics` 路由 / 不刪 AnalyticsView shell
- ❌ 不調整既有 4 tab 視覺
- ❌ 不加 才藝 panel（留 P4）
- ❌ 不改 backend
- ❌ 不改側欄選單（user 仍會看到「報表統計」+「經營分析」兩個 entry——這 P4 再決定）

---

## 4. 測試策略

### Vitest

**不補新測試**。整合是 import + permission gate，邏輯極淺；既有 1365 個測試覆蓋 ReportsView 應已 OK（如有），不破即可。

### 手動驗證

跑 `./start.sh` + admin/admin123 登入 → `/reports`：

| 場景 | 預期 |
|---|---|
| admin（全權限）→ /reports | 看到 6 個 tab |
| 切「招生漏斗」tab | FunnelPanel 載入（與 /analytics/funnel 相同） |
| 切「流失預警」tab | ChurnPanel 載入（與 /analytics/churn 相同） |
| /analytics/funnel | 仍可訪問（不破 backward compat） |
| 移除 BUSINESS_ANALYTICS 權限的測試帳號 → /reports | 只看 4 tab |

### 不破壞

- 既有 1365 Vitest 全綠
- /analytics 路由仍可訪問
- 4 個原 tab 行為不變

---

## 5. 風險與緩解

| 風險 | 緩解 |
|---|---|
| 6 個 tab 在 SM 螢幕排版擠 | Element Plus `<el-tabs>` overflow scroll 內建支援，可接受 |
| FunnelPanel / ChurnPanel 內部 fetch 在 ReportsView 沒 admin layout 而觸發樣式問題 | 兩 panel 已 self-contained（自己 layout + el-card），ReportsView 只當 tab container；應無問題（如有，加局部 wrapper） |
| 與 P1 ReportsView 重構（PR #18）merge 衝突 | P1 是 ReportsView 結構大改；P3 改動是「加 2 個 `<el-tab-pane>`」，conflict 簡單；按 P1 結構照樣加即可 |
| 與 P2 ReportsView 微改（PR #20 `f4d44ea9`）merge 衝突 | P2 改的是 panel prop 傳遞，與 P3 加新 tab 不重疊 |

---

## 6. 驗收標準

1. ✅ admin 進 `/reports` 看到 6 個 tab
2. ✅ 「招生漏斗」tab 顯示 FunnelPanel（與 /analytics/funnel 同畫面）
3. ✅ 「流失預警」tab 顯示 ChurnPanel（與 /analytics/churn 同畫面）
4. ✅ 無 BUSINESS_ANALYTICS 權限的測試帳號只看 4 tab
5. ✅ `/analytics` 路由仍可訪問
6. ✅ 既有 Vitest 全綠（與 main baseline 一致）

---

## 7. 檔案異動清單

**修改**：
- `src/views/ReportsView.vue`：加 2 個 import + 2 個 tab pane + canSeeAnalytics computed

**新增**：（無）

**不動**：
- `src/views/analytics/AnalyticsView.vue`
- `src/views/analytics/FunnelPanel.vue`
- `src/views/analytics/ChurnPanel.vue`
- `src/router/index.js`
- `src/constants/permissions.js`
- 任何後端

---

## 8. 預計交付規模

- 1 個檔案修改，~15 行新增
- 1 個 commit
- 估時：1-2h（含手動驗證）

---

## 9. P4 預告

- **P4**：才藝報表（backend 新 aggregation endpoint + 前端新 panel，4-6h）
- 完成 P3 後再為 P4 寫獨立 spec
