# Phase C Frontend Plan — Leave Quota Lifecycle

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development

**Goal:** Phase C 前端落地 2 個 deliverable：
1. SalaryView (admin) + PortalSalaryView (員工自己) 加 `unused_leave_payout` 獨立欄位 + tooltip 展開證據鏈
2. PortalHomeView 或 PortalLeaveView 加補休結餘 widget（balance + 最早到期 + 下個結算月）

**前提：**
- Backend Phase C `19ab012` 已 merge — 2 個 new endpoint：`GET /salaries/{id}/unused-leave-payout-detail` + `GET /portal/me/leave-quota-expiry`
- schema.d.ts 已 regen 含新 endpoint types（在 worktree base，commit 1 staged）

---

## FC-1: schema.d.ts commit + 2 api wrapper (~1 task)

**Files:**
- Modify: `src/api/_generated/schema.d.ts`（已 regen，113 行新）
- Create: `src/api/portalLeaveQuotaExpiry.ts`（portal 用）
- Modify: `src/api/salary.ts`（admin/self salary detail）或 加進 `src/api/leaveQuotaExpiry.ts`
- Test: `tests/api/portalLeaveQuotaExpiry.test.ts`

### 1a. salary 端 detail wrapper

於 `src/api/leaveQuotaExpiry.ts` 追加（既有檔已有 5 函式）：

```typescript
export function getUnusedLeavePayoutDetail(salaryRecordId: number) {
  return api.get(`/salaries/${salaryRecordId}/unused-leave-payout-detail`) as Promise<
    AxiosResp<'/salaries/{record_id}/unused-leave-payout-detail', 'get'>
  >
}
```

注意 path template 確認 schema 是 `{record_id}` 還是 `{salary_record_id}`，看 schema.d.ts 內 paths 鍵名。

### 1b. portal wrapper

新檔 `src/api/portalLeaveQuotaExpiry.ts`:

```typescript
import api from '@/api/index'
import type { AxiosResp } from './_generated/typed'

export function getMyLeaveQuotaExpiry() {
  return api.get('/portal/me/leave-quota-expiry') as Promise<
    AxiosResp<'/portal/me/leave-quota-expiry', 'get'>
  >
}
```

### Test (mock-based)

- `getUnusedLeavePayoutDetail(123)` → 呼叫 `/salaries/123/unused-leave-payout-detail`
- `getMyLeaveQuotaExpiry()` → 呼叫 `/portal/me/leave-quota-expiry`

### Commit

```bash
git add src/api/_generated/schema.d.ts src/api/portalLeaveQuotaExpiry.ts src/api/leaveQuotaExpiry.ts tests/api/portalLeaveQuotaExpiry.test.ts
git commit -m "feat(api): schema regen + getUnusedLeavePayoutDetail + getMyLeaveQuotaExpiry wrapper"
```

---

## FC-2: SalaryView + PortalSalaryView 加 unused_leave_payout 欄位 + tooltip (~1 task)

**Files:**
- Modify: `src/views/SalaryView.vue`（HR/admin 端，1104 行）
- Modify: `src/views/portal/PortalSalaryView.vue`（員工自助端）

### 改動

兩個 view 都需要：
1. 在薪資列表（或 detail dialog）內加 `unused_leave_payout` 數字欄
2. 數字旁加 `<el-tooltip>` 點開展示 detail (logs[] 表格：source_type / hours / amount / wage_basis_date)

**SalaryView.vue 加在哪：**
看既有 column 順序找合適位置（如在 net_pay 之前或薪資明細 column 之間）。

**PortalSalaryView.vue 加在哪：**
看員工自己薪資單怎呈現（可能 detail dialog 或 expandable row）— 在「未休折現」項目加 tooltip。

### Tooltip 內容（共用 component 推薦）

新 component `src/components/salary/UnusedLeavePayoutTooltip.vue`：
- props: `salaryRecordId: number`
- mounted: lazy call `getUnusedLeavePayoutDetail(salaryRecordId)`
- render: el-tooltip with rich slot 含 table（log_id / source_type label / hours / amount / wage_basis_date / meta）
- source_type label: 補休到期 / 特休週年 / 離職結算 (map)

### Test (vitest)

`tests/components/salary/UnusedLeavePayoutTooltip.test.ts`:
- mount with mock api → 顯示 3 source_type 對應中文 label
- amount 累計 = total_amount

### Commit

```bash
git add src/views/SalaryView.vue src/views/portal/PortalSalaryView.vue src/components/salary/UnusedLeavePayoutTooltip.vue tests/components/salary/UnusedLeavePayoutTooltip.test.ts
git commit -m "feat(salary): SalaryView + PortalSalaryView 加 unused_leave_payout 欄位 + tooltip 證據鏈"
```

---

## FC-3: PortalHomeView 補休 widget (~1 task)

**Files:**
- Modify: `src/views/portal/PortalHomeView.vue`（員工 portal 首頁）

### 改動

於 PortalHomeView 加新 widget 卡片「補休結餘」：
- 顯示 `compensatory_balance` h
- 若有 `earliest_expiring_grant`：紅色提醒「最早到期 YYYY-MM-DD（Z h）」
- 顯示 `next_anniversary`（下個週年）
- 顯示 `expected_payout_month`（下個結算月）+ note「未休將自動折算工資」
- 點 widget 跳轉 PortalLeaveView 或 PortalSalaryView 看明細

### Test (vitest)

`tests/views/portal/PortalHomeView.test.ts` 或在既有 test 加：
- mount with mock api → 顯示 balance + earliest + next_anniversary + expected_payout_month
- 無 grant → 不顯示紅色提醒
- mock api 失敗 → widget 安全 fallback（顯示 — 或 hide）

### Commit

```bash
git add src/views/portal/PortalHomeView.vue tests/views/portal/PortalHomeView.test.ts
git commit -m "feat(portal): PortalHomeView 加補休結餘 widget（balance + 最早到期 + 下個結算月）"
```

---

## FC-4: Final verify (~1 task)

- `npm run typecheck` 0 error
- `npm run build` SUCCESS
- `npm run test` 全綠 + 既有 LeaveView / SalaryView / Portal* test 無 regression
- 手測 `npm run dev` 起 portal 看 widget + 薪資 tooltip

---

## Out of Scope（Phase D）
- LINE flex message
- portal 補休歷史明細頁
- 員工請補休時 quota check 加 expires_at warning（已由 LINE push 提醒 cover）
