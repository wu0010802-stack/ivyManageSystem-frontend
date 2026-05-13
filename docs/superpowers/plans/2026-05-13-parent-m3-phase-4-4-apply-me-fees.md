# 家長端 Material 3 重寫 P4.4：申請/我的/收費群 view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P4 最後一個 sub-PR：家長端申請/我的/收費群 11 view + 14 子元件視覺切到 Material 3。涵蓋請假、用藥、我的、繳費、才藝、行事曆、綁定、登入等所有剩餘 view。所有 token swap 為主，script setup / template / API call 完全不動。零 API 破壞、既有 ~200 parent 測試零新增 regression。

**Architecture:** 沿用 P4.1-P4.3 visual-only refactor 策略。M3TextField 替換 form input 與 M3 FAB 改造 LeavesView/MedicationListView 新增按鈕等較大 DOM 改動延後到 P5（避免本 phase 破壞既有測試）。本 phase 只做 token swap + 圓角統一。

**Tech Stack:** Vue 3 `<script setup>`。沿用 P0-P3 已建的 M3 tokens + 17 個 M3 元件 + iconMapping wrapper。

**Spec reference:** `docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md` §7.4。

**Branch:** 從 `feat/parent-m3-phase-4-3-frontend` head 切 `feat/parent-m3-phase-4-4-frontend`。

---

## File Structure

```
src/parent/views/
├── LeavesView.vue              (Task 1)
├── MedicationListView.vue      (Task 2)
├── MedicationFormView.vue      (Task 2)
├── MedicationDetailView.vue    (Task 2)
├── MeView.vue                  (Task 3)
├── FeesView.vue                (Task 4)
├── ActivityView.vue            (Task 5)
├── CalendarView.vue            (Task 6)
├── BindView.vue                (Task 7)
├── BindAdditionalView.vue      (Task 7)
└── LoginView.vue               (Task 8)

src/parent/components/
├── leaves/{LeaveAttachments,LeaveDetailSheet,LeaveForm,LeaveHero,LeaveListCard}.vue  (Task 1)
├── fees/{FeeHero,FeeListGroup,FeeReceiptSheet}.vue                                  (Task 4)
├── activity/{ActivityCardList,ActivityHero,ActivityRegisterSheet,RegistrationStatusList}.vue (Task 5)
└── me/{ChildrenList,FeeSummaryCard}.vue                                              (Task 3)
```

不動：script setup logic、API call、router、所有 sheet 元件的 ParentBottomSheet 內嵌結構（P3 已 M3 化）。

---

### 通用 token 替換規則

每個 task 套用以下規則（依實際內容調整）：

| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | view 用 `12px`；hero/detail card 用 `16px` |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-shadow-card, var(--pt-elev-1))` | `var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--pt-text-muted)` | `var(--m3-on-surface-variant, var(--pt-text-muted))` |
| `var(--pt-text-soft)` | `var(--m3-on-surface-variant, var(--pt-text-soft))` |
| `var(--pt-tint-brand, var(--brand-primary-soft))` | `var(--m3-primary-container, var(--pt-tint-brand, var(--brand-primary-soft)))` |
| `var(--brand-primary)` (action button) | `var(--m3-primary, var(--brand-primary))` |
| `var(--brand-primary-soft)` (selected/active bg) | `var(--m3-secondary-container, var(--brand-primary-soft))` |
| `var(--pt-success-text)` | `var(--m3-primary, var(--pt-success-text))` |
| `var(--pt-warning-text)` | `var(--m3-tertiary, var(--pt-warning-text))` |
| `var(--pt-danger-text)` 或 `var(--color-danger-text)` | `var(--m3-error, var(--color-danger))` |
| `var(--pt-border)` (divider) | `var(--m3-outline-variant, var(--pt-border))` |

每次 Edit 後跑 `npm run test -- "tests/unit/parent" 2>&1 | tail -5` 確認失敗數沒增加。**不精確匹配的跳過**。

---

### Task 0: P4.4 branch setup

- [ ] **Step 1: 切分支**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
git status   # 確認 clean
git log -1 --format="%h %s"  # HEAD = f96521fd P4.3 AttendanceView
git checkout -b feat/parent-m3-phase-4-4-frontend
```

- [ ] **Step 2: baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 passed / 4 failed (pre-existing)。

---

### Task 1: LeavesView + leaves/ 子元件 M3 化

**Files (6 個):**
- Modify: `src/parent/views/LeavesView.vue`
- Modify: `src/parent/components/leaves/LeaveAttachments.vue`
- Modify: `src/parent/components/leaves/LeaveDetailSheet.vue`
- Modify: `src/parent/components/leaves/LeaveForm.vue`
- Modify: `src/parent/components/leaves/LeaveHero.vue`
- Modify: `src/parent/components/leaves/LeaveListCard.vue`

- [ ] **Step 1: Read 6 個檔案，定位 token**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
grep -nE "var\(--pt-|var\(--brand-|var\(--ivy-" src/parent/views/LeavesView.vue src/parent/components/leaves/*.vue | head -40
```

- [ ] **Step 2: 對每個檔案套通用 token 替換規則**

對 LeaveHero 用 `16px` 圓角；其他用 `12px`。LeaveDetailSheet 內若有 `var(--pt-tint-warn)` / `var(--pt-tint-success)` 對應狀態 chip，依規則表替換。

每次 Edit 後跑 `npm run test -- "tests/unit/parent" 2>&1 | tail -5` 確認沒新增 failure。

- [ ] **Step 3: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 / 4 不變。

- [ ] **Step 4: Commit**

```bash
git add src/parent/views/LeavesView.vue src/parent/components/leaves/
git commit -m "$(cat <<'EOF'
feat(parent-m3): LeavesView + leaves/ 子元件 M3 化

- view 圓角 12 / hero 16px
- 列表項 surface-container-low + elev-1
- 狀態 chip M3 tonal (primary/tertiary/error)
- script setup 邏輯不動

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Medication × 3 view M3 化

**Files:**
- Modify: `src/parent/views/MedicationListView.vue`
- Modify: `src/parent/views/MedicationFormView.vue`
- Modify: `src/parent/views/MedicationDetailView.vue`

- [ ] **Step 1: Read + 定位 token**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
grep -nE "var\(--pt-|var\(--brand-|var\(--ivy-" src/parent/views/Medication*.vue | head -40
```

- [ ] **Step 2: 對 3 個檔案套通用 token 替換**

對 MedicationFormView form 區塊：不換 `<input>` 為 M3TextField（風險高，P5 才動），只動 token。

對 MedicationListView：列表項 `12px`；MedicationFormView 與 MedicationDetailView：card `16px`。

- [ ] **Step 3: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/views/Medication*.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): MedicationList/Form/DetailView M3 化

- 列表項 12px / 表單與詳情 16px
- surface-container-low + M3 token chain
- script setup 邏輯不動；input 元素 P5 才換 M3TextField

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: MeView + me/ 子元件 M3 化

**Files:**
- Modify: `src/parent/views/MeView.vue`
- Modify: `src/parent/components/me/ChildrenList.vue`
- Modify: `src/parent/components/me/FeeSummaryCard.vue`

- [ ] **Step 1: Read + 定位**

```bash
grep -nE "var\(--pt-|var\(--brand-" src/parent/views/MeView.vue src/parent/components/me/*.vue | head -30
```

- [ ] **Step 2: 套通用 token 替換**

MeView 用 list 風格 12px；FeeSummaryCard 用 card 16px。

- [ ] **Step 3: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/views/MeView.vue src/parent/components/me/
git commit -m "$(cat <<'EOF'
feat(parent-m3): MeView + me/ 子元件 M3 化

- MeView 列表 12px
- FeeSummaryCard 16px + surface-container-low
- ChildrenList M3 list pattern

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: FeesView + fees/ 子元件 M3 化

**Files:**
- Modify: `src/parent/views/FeesView.vue`
- Modify: `src/parent/components/fees/FeeHero.vue`
- Modify: `src/parent/components/fees/FeeListGroup.vue`
- Modify: `src/parent/components/fees/FeeReceiptSheet.vue`

- [ ] **Step 1: Read + 定位**

```bash
grep -nE "var\(--pt-|var\(--brand-" src/parent/views/FeesView.vue src/parent/components/fees/*.vue | head -40
```

- [ ] **Step 2: 套通用 token 替換**

FeeHero 16px；FeeListGroup 列表 12px；FeeReceiptSheet 內收據卡 12px。已繳/未繳/逾期 chip 套狀態 tonal：
- 已繳 → primary
- 未繳 → tertiary
- 逾期 → error

- [ ] **Step 3: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/views/FeesView.vue src/parent/components/fees/
git commit -m "$(cat <<'EOF'
feat(parent-m3): FeesView + fees/ 子元件 M3 化

- FeeHero 16px / 列表 12px / 收據 sheet 12px
- 已繳/未繳/逾期 chip 套 M3 tonal (primary/tertiary/error)
- script setup 邏輯不動

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: ActivityView + activity/ 子元件 M3 化

**Files:**
- Modify: `src/parent/views/ActivityView.vue`
- Modify: `src/parent/components/activity/ActivityCardList.vue`
- Modify: `src/parent/components/activity/ActivityHero.vue`
- Modify: `src/parent/components/activity/ActivityRegisterSheet.vue`
- Modify: `src/parent/components/activity/RegistrationStatusList.vue`

- [ ] **Step 1: Read + 定位**

```bash
grep -nE "var\(--pt-|var\(--brand-" src/parent/views/ActivityView.vue src/parent/components/activity/*.vue | head -40
```

- [ ] **Step 2: 套通用 token 替換**

ActivityHero 16px；ActivityCardList 列表 12px；ActivityRegisterSheet card 12px；RegistrationStatusList chip 套 tonal。

- [ ] **Step 3: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/views/ActivityView.vue src/parent/components/activity/
git commit -m "$(cat <<'EOF'
feat(parent-m3): ActivityView + activity/ 子元件 M3 化

- ActivityHero 16px / 課程卡 12px
- 報名 sheet 內表單 token 化
- 狀態 chip M3 tonal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: CalendarView M3 化

**Files:**
- Modify: `src/parent/views/CalendarView.vue`

- [ ] **Step 1: Read + 定位**

```bash
cat src/parent/views/CalendarView.vue
grep -nE "var\(--pt-|var\(--brand-" src/parent/views/CalendarView.vue | head -20
```

- [ ] **Step 2: 套通用 token 替換**

行程卡 12px、事件 chip 套 M3 tertiary-container 之類。

- [ ] **Step 3: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/views/CalendarView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): CalendarView 行程頁 M3 化

- 行程卡 12px + surface-container-low
- 事件 chip M3 tonal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Bind × 2 view M3 化

**Files:**
- Modify: `src/parent/views/BindView.vue`
- Modify: `src/parent/views/BindAdditionalView.vue`

- [ ] **Step 1: Read + 定位**

```bash
cat src/parent/views/BindView.vue
cat src/parent/views/BindAdditionalView.vue
grep -nE "var\(--pt-|var\(--brand-" src/parent/views/Bind*.vue | head -30
```

- [ ] **Step 2: 套通用 token 替換**

公開頁面，hero 16px；input 不換 M3TextField（風險高）。

- [ ] **Step 3: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/views/Bind*.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): BindView + BindAdditionalView 綁定頁 M3 化

- 容器卡 16px + surface-container-low
- 提交按鈕色 m3-primary

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: LoginView M3 化

**Files:**
- Modify: `src/parent/views/LoginView.vue`

- [ ] **Step 1: Read + 定位**

```bash
cat src/parent/views/LoginView.vue
grep -nE "var\(--pt-|var\(--brand-" src/parent/views/LoginView.vue | head -20
```

- [ ] **Step 2: 套通用 token 替換**

登入卡 16px、登入按鈕 m3-primary、brand SVG 保留。

- [ ] **Step 3: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/views/LoginView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): LoginView 登入頁 M3 化

- 登入卡 16px + surface-container-low
- 登入按鈕色 m3-primary
- brand SVG 保留

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 全套驗證

**Files:** 無

- [ ] **Step 1: 跑全套 m3 元件測試**

```bash
npm run test -- "src/parent/components/m3" 2>&1 | tail -5
```

Expected: 135 全綠。

- [ ] **Step 2: 跑全套 parent**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -10
```

Expected: 228 / 4 (pre-existing) 不變。

- [ ] **Step 3: Dev server 確認**

```bash
(npm run dev 2>&1 &); DEV_PID=$!; sleep 6; kill $DEV_PID 2>/dev/null; wait 2>/dev/null
```

Expected: `VITE ... ready`。

- [ ] **Step 4: 列 commit 摘要**

```bash
git log --oneline feat/parent-m3-phase-4-3-frontend..HEAD
```

Expected: 8 個 commit (Task 1-8)。

- [ ] **Step 5: P4 sub-PR 全套差異**

```bash
git log --oneline feat/parent-m3-phase-3-frontend..HEAD
```

P4.1 + P4.2 + P4.3 + P4.4 全部 commit 列表，預計 ~30 commits。

---

## Self-Review 後備檢查表

- [ ] 11 個 view 全部 token swap
- [ ] 14 個子元件全部 token swap（除 P4.4 不動 SignaturePad / brand SVG）
- [ ] form input 元素**不**換 M3TextField（P5 才動）
- [ ] FAB 替換**不**做（P5 才動）
- [ ] script setup logic 全部不動
- [ ] M3 元件 135 全綠 / parent 228 / 4 (pre-existing) 不變

---

## P4.4 完成後

- 進 **P5 plan**（motion polish + AppHeader.vue 刪除 + ParentIcon SVG 殘留清理 + 視覺檢查 + Form M3TextField 替換）。
- P5 plan 由 implementer 重新調用 writing-plans skill 寫，spec §8 為依據。
