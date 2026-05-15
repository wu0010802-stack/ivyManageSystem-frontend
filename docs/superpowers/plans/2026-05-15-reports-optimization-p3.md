# 報表統計優化 P3：整合招生 / 流失預警 tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Single-task plan — inline execution is appropriate.

**Goal:** 把既有 `views/analytics/FunnelPanel.vue` 與 `ChurnPanel.vue` 直接 import 進 `views/ReportsView.vue`，加 2 個新 tab；不動 panel 內部、不動 backend、不刪 `/analytics` 路由。

**Architecture:** ReportsView 加 2 個 `<el-tab-pane>` + 2 個 `import` + 1 個 `canSeeAnalytics` computed（基於 `hasPermission('BUSINESS_ANALYTICS')` gate）。

**Tech Stack:** Vue 3 SFC + Element Plus（`<el-tab-pane>` + `v-if` lazy mount）。

**Spec:** `docs/superpowers/specs/2026-05-15-reports-optimization-p3-design.md`

**Branch:** `feat/reports-p3-analytics-integration-frontend`（已開，乾淨 1 commit ahead of main，含 spec）

---

## 前置知識

### 既有 ReportsView 結構（pre-P1 baseline）

當前 `src/views/ReportsView.vue` 是 **pre-P1 版本**（有 fetch state + 全頁 v-loading）。P1 PR #18 尚未 merge；本 plan 在 pre-P1 結構上添加 2 個新 tab。

當 P1/P2 merge 後 P3 rebase，conflict 在 `<el-tabs>` 區塊；resolution 是「保留 P1/P2 結構 + 加入我加的 2 個 tab」，幾行手動 merge 即可。

### Permission helper

`src/utils/auth.js` 的 `hasPermission(permissionName)` 接受字串名稱，內部走 BigInt mask 比對。constants 在 `src/constants/permissions.js`：`BUSINESS_ANALYTICS: 2 ** 40`。

### 重用既有 panel

`src/views/analytics/FunnelPanel.vue` 與 `ChurnPanel.vue` 都是 self-contained — 各自有 layout（`el-card`）+ 自抓 data + 自己處理 loading。**不需要傳 props**。

### Test 慣例

不補新測試（純組合工作，ROI 低）。Baseline `npm test -- --run` 應為 main 的測試數。

---

## 檔案結構

| 路徑 | 動作 | 範圍 |
|---|---|---|
| `src/views/ReportsView.vue` | 修改 | + 2 import + 1 computed + 2 tab pane（~10 行新增） |

無新增 / 無刪除。

---

## Task 1：ReportsView 加 招生漏斗 + 流失預警 tab

**Files:**
- Modify: `/Users/yilunwu/Desktop/ivy-frontend/src/views/ReportsView.vue`

- [ ] **Step 1：替換 `<script setup>` 區塊**

打開 `/Users/yilunwu/Desktop/ivy-frontend/src/views/ReportsView.vue`。當前 `<script setup>` 第 1-10 行 imports 為：

```js
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getDashboard, getFinanceSummary } from '@/api/reports'
import { apiError } from '@/utils/error'
import { getUserInfo } from '@/utils/auth'
import OverviewPanel from './reports/OverviewPanel.vue'
import FinanceSummaryPanel from './reports/FinanceSummaryPanel.vue'
import AttendancePanel from './reports/AttendancePanel.vue'
import SalaryPanel from './reports/SalaryPanel.vue'
```

把 `import { getUserInfo } from '@/utils/auth'` 一行替換為：

```js
import { getUserInfo, hasPermission } from '@/utils/auth'
```

並在 `import SalaryPanel from './reports/SalaryPanel.vue'` 後面新增 2 行：

```js
import FunnelPanel from '@/views/analytics/FunnelPanel.vue'
import ChurnPanel from '@/views/analytics/ChurnPanel.vue'
```

最終 imports 區塊應是：

```js
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getDashboard, getFinanceSummary } from '@/api/reports'
import { apiError } from '@/utils/error'
import { getUserInfo, hasPermission } from '@/utils/auth'
import OverviewPanel from './reports/OverviewPanel.vue'
import FinanceSummaryPanel from './reports/FinanceSummaryPanel.vue'
import AttendancePanel from './reports/AttendancePanel.vue'
import SalaryPanel from './reports/SalaryPanel.vue'
import FunnelPanel from '@/views/analytics/FunnelPanel.vue'
import ChurnPanel from '@/views/analytics/ChurnPanel.vue'
```

- [ ] **Step 2：加 `canSeeAnalytics` computed**

在 `const activeTab = ref('overview')` 之後（第 19 行附近）插入：

```js
const canSeeAnalytics = computed(() => hasPermission('BUSINESS_ANALYTICS'))
```

放在 `const activeTab = ref('overview')` 下一行。

- [ ] **Step 3：加 2 個新 `<el-tab-pane>` 到 `<el-tabs>` 區塊**

當前 `<el-tabs>`（line 75-88）尾端為：

```vue
      <el-tab-pane label="薪資" name="salary">
        <SalaryPanel v-if="activeTab === 'salary'" :data="dashboardData" :finance="financeData" />
      </el-tab-pane>
    </el-tabs>
```

在 `</el-tabs>` 前面（薪資 tab pane 後）新增 2 個 tab pane：

```vue
      <el-tab-pane label="薪資" name="salary">
        <SalaryPanel v-if="activeTab === 'salary'" :data="dashboardData" :finance="financeData" />
      </el-tab-pane>
      <el-tab-pane v-if="canSeeAnalytics" label="招生漏斗" name="funnel">
        <FunnelPanel v-if="activeTab === 'funnel'" />
      </el-tab-pane>
      <el-tab-pane v-if="canSeeAnalytics" label="流失預警" name="churn">
        <ChurnPanel v-if="activeTab === 'churn'" />
      </el-tab-pane>
    </el-tabs>
```

- [ ] **Step 4：跑既有測試確保不破**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend && npm test -- --run 2>&1 | tail -10
```

Expected：與 main baseline 一致（總數 + 既有 pre-existing 失敗）。**不應有新 failure**。

如有 failure 涉及 ReportsView spec（如果存在），需檢查是否 v-if 條件或 import 路徑問題。

- [ ] **Step 5：手動驗證（必跑）**

開另一個終端：

```bash
cd ~/Desktop/ivyManageSystem && ./start.sh
```

打開 `http://localhost:5173/login`，admin/admin123 登入 → `/reports`：

| 場景 | 預期 |
|---|---|
| 進 `/reports`（admin 全權限） | 看到 6 個 tab：概況 / 收支彙總 / 出勤 / 薪資 / 招生漏斗 / 流失預警 |
| 點「招生漏斗」tab | FunnelPanel 顯示，與 `/analytics/funnel` 畫面一致 |
| 點「流失預警」tab | ChurnPanel 顯示，與 `/analytics/churn` 畫面一致 |
| 訪問 `/analytics/funnel` | 仍可訪問（不破 backward compat） |

如沒有非 admin 帳號可測權限 gate，可手動在 DevTools console 跑：
```js
const u = JSON.parse(localStorage.getItem('user_info'))
u.permissions = 8192  // 只 REPORTS（1 << 13）
localStorage.setItem('user_info', JSON.stringify(u))
location.reload()
```
→ 預期只看 4 tab。測完恢復原 user：`localStorage.removeItem('user_info'); location.reload()` 後重新登入。

- [ ] **Step 6：Commit**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend && git add src/views/ReportsView.vue && git commit -m "$(cat <<'EOF'
feat(reports): ReportsView 加 招生漏斗 + 流失預警 tab

直接 import 既有 FunnelPanel / ChurnPanel from views/analytics/，
canSeeAnalytics computed 由 BUSINESS_ANALYTICS 權限 gate；無權限只看 4 tab。
不動 panel 內部、不動 backend、不刪 /analytics 路由。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7：Push + 開 PR**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend && git push -u origin feat/reports-p3-analytics-integration-frontend
```

```bash
cd /Users/yilunwu/Desktop/ivy-frontend && gh pr create --title "feat(reports): P3 整合招生漏斗 / 流失預警 tab" --body "$(cat <<'EOF'
## Summary

把 /analytics 既有的 FunnelPanel + ChurnPanel 整合到 /reports 為新 tab。**純前端**，不動 backend、不刪 /analytics 路由（backward compat）。

- ReportsView 加 2 個 \`<el-tab-pane>\`：「招生漏斗」+「流失預警」
- \`canSeeAnalytics\` computed 由 BUSINESS_ANALYTICS 權限 gate；無權限只看原 4 tab
- 直接 import 既有元件（不移檔不複製）

## 與 P1/P2 PR 的關係

P1 PR #18 / P2 PR #20 還沒 merge。本 PR 從 main 切出，**1 file change ~10 行新增**。當 P1/P2 merge 後本 PR rebase，conflict 在 \`<el-tabs>\` 區塊，按 P1/P2 新結構加入這 2 個 \`<el-tab-pane>\` 即可。

## 測試

- Vitest baseline 一致（無新 failure）
- Dialog 自抓（沿用既有 panel 內部邏輯，不改）

## Test plan

- [ ] \`./start.sh\` → \`/reports\` admin 看 6 tab
- [ ] 招生漏斗 tab 顯示 FunnelPanel（同 /analytics/funnel）
- [ ] 流失預警 tab 顯示 ChurnPanel（同 /analytics/churn）
- [ ] /analytics 路由仍可訪問
- [ ] 移除 BUSINESS_ANALYTICS 權限只看 4 tab

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

### Spec coverage 對照

| Spec 章節 | Plan Step |
|---|---|
| §2.1 ReportsView 加 2 tab | Step 1 + Step 3 |
| §2.2 tab 順序（業務 5/6） | Step 3 把新 tab 放 `</el-tabs>` 前（最後） |
| §2.3 不動 /analytics 路由 | Plan 不修改 router/index.js |
| §2.4 權限 gate | Step 1 (import) + Step 2 (computed) + Step 3 (`v-if="canSeeAnalytics"`) |
| §4 測試（不補新測試） | Step 4 只跑既有；Step 5 手動驗證 5 場景 |
| §6 驗收 1-6 | Step 5 手動驗證 |
| §7 檔案異動 ReportsView only | Step 6 `git add` named file only |

### Placeholder scan

無 TBD / TODO / placeholder。Step 5 的 localStorage 驗證指令是具體可執行的。

### Type consistency

- `hasPermission` 來自 `@/utils/auth` — 與 spec §2.1 一致
- `canSeeAnalytics` computed name 全 plan 一致
- Cache key / API 名稱：本 plan 不動 API
- Tab name 字串：`funnel` / `churn` 與 `/analytics` route 既有命名對齊（雖然 ReportsView 內部 tab name 與 router path 沒直接綁定，但保持一致省記憶負擔）
