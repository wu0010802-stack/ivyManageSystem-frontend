# 家長端 Material 3 重寫 P4.3：子女檔案群 view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P4 第三個 sub-PR：家長端子女檔案群 6 view + 4 個 milestone/timeline 子元件視覺切到 Material 3。重點：MilestoneCard 圓角 16px + tertiary-container bg、量測曲線 echarts 配色換 M3 palette、照片網格 12px 圓角、ChildProfileView Hero 用 M3 large header pattern；其餘 view 做 token swap。零 API 破壞、既有 ~200 parent 測試零新增 regression。

**Architecture:** 沿用 P4.1/P4.2 visual-only refactor 策略。echarts `setOption` 內 series color 從 hex 改 M3 token（`getComputedStyle(document.documentElement).getPropertyValue('--m3-primary')`）。MilestoneCard hardcoded hex 全替換為 M3 token。其他 view token swap。

**Tech Stack:** Vue 3 `<script setup>`、echarts (lazy-loaded)。沿用 P0-P3 已建的 M3 tokens + 17 個 M3 元件 + iconMapping wrapper。

**Spec reference:** `docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md` §7.3。

**Branch:** 從 `feat/parent-m3-phase-4-2-frontend` head 切 `feat/parent-m3-phase-4-3-frontend`。

---

## File Structure

```
src/parent/components/
├── MilestoneCard.vue           (Task 1 — hardcoded hex → M3 token)
├── MilestoneCarousel.vue       (Task 1 — visual)
├── MilestoneReactionBar.vue    (Task 1 — visual)
└── TimelineItem.vue            (Task 1 — visual)

src/parent/views/
├── ChildProfileView.vue        (Task 2 — 576 行最大檔)
├── ChildMeasurementsView.vue   (Task 3 — chart M3 palette)
├── ChildPhotosView.vue         (Task 4 — 照片網格)
├── ChildReportsView.vue        (Task 5 — PDF 報告列表)
├── AttendanceView.vue          (Task 6 — 361 行)
└── FamilyView.vue              (Task 7 — 容器頁)
```

不動：script setup logic、API call、router、SignaturePad（P5 才動）。

---

### Task 0: P4.3 branch setup

- [ ] **Step 1: 從 P4.2 head 切分支**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
git status   # 確認 clean
git log -1 --format="%h %s"  # HEAD = 06293a9a P4.2 EventAckView
git checkout -b feat/parent-m3-phase-4-3-frontend
```

- [ ] **Step 2: parent baseline 記下**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 passed / 4 failed (pre-existing)。

---

### Task 1: Milestone + Timeline 子元件 M3 化

**Files:**
- Modify: `src/parent/components/MilestoneCard.vue`
- Modify: `src/parent/components/MilestoneCarousel.vue`
- Modify: `src/parent/components/MilestoneReactionBar.vue`
- Modify: `src/parent/components/TimelineItem.vue`

策略：MilestoneCard 有 hardcoded hex (#fff6e8, #fef3c7, #0d9053, #6b7280, #374151) — 換 M3 token。其他三個元件做 token swap。

- [ ] **Step 1: Read 四個元件**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
cat src/parent/components/MilestoneCard.vue
cat src/parent/components/MilestoneCarousel.vue
cat src/parent/components/MilestoneReactionBar.vue
cat src/parent/components/TimelineItem.vue
```

- [ ] **Step 2: baseline**

```bash
npm run test -- Milestone Timeline 2>&1 | tail -10
```

- [ ] **Step 3: 套以下替換**

對 MilestoneCard.vue 的 hardcoded hex（CSS 寫死的值）：
| 找到（精確） | 替換為 |
|------|-------|
| `linear-gradient(135deg, #fff6e8, #fef3c7)` | `var(--m3-tertiary-container, linear-gradient(135deg, #fff6e8, #fef3c7))` |
| `border-radius: 12px;` | `border-radius: 16px;` |
| `color: #0d9053;` (title) | `color: var(--m3-primary, #0d9053);` |
| `color: #6b7280;` (date) | `color: var(--m3-on-surface-variant, #6b7280);` |
| `color: #374151;` (desc) | `color: var(--m3-on-surface, #374151);` |

對 MilestoneCarousel.vue / MilestoneReactionBar.vue / TimelineItem.vue 的 `var(--pt-*)` token：
| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `12px` |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--pt-text-muted)` | `var(--m3-on-surface-variant, var(--pt-text-muted))` |
| `var(--brand-primary)` (reaction button selected) | `var(--m3-primary, var(--brand-primary))` |

不精確匹配的跳過。

- [ ] **Step 4: baseline 確認**

```bash
npm run test -- Milestone Timeline 2>&1 | tail -10
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/MilestoneCard.vue \
       src/parent/components/MilestoneCarousel.vue \
       src/parent/components/MilestoneReactionBar.vue \
       src/parent/components/TimelineItem.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): Milestone + Timeline 子元件 M3 化

- MilestoneCard hardcoded hex 換 M3 token (tertiary-container / primary / on-surface)
- 圓角 12 → 16px
- script setup 邏輯不動

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: ChildProfileView visual M3 化

**Files:**
- Modify: `src/parent/views/ChildProfileView.vue`

576 行最大。含 Hero header + 子女資訊區 + Milestone 區 + Timeline 區 + 量測曲線 link。

- [ ] **Step 1: Read ChildProfileView 完整**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
wc -l src/parent/views/ChildProfileView.vue
grep -nE "var\(--pt-|var\(--brand-|var\(--ivy-" src/parent/views/ChildProfileView.vue | head -40
```

- [ ] **Step 2: baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 3: 套以下 token 替換（依實際 CSS pattern 調整 old_string）**

| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `16px` (detail page card 略大) |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-shadow-card, var(--pt-elev-1))` | `var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--pt-text-muted)` | `var(--m3-on-surface-variant, var(--pt-text-muted))` |
| `var(--pt-tint-brand, var(--brand-primary-soft))` (hero bg) | `var(--m3-primary-container, var(--pt-tint-brand, var(--brand-primary-soft)))` |

每次 Edit 後跑 baseline。

- [ ] **Step 4: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 5: Commit**

```bash
git add src/parent/views/ChildProfileView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): ChildProfileView visual M3 化

- 圓角 14 → 16px (detail page)
- Hero bg 套 m3-primary-container
- 各 section card 套 surface-container-low + elev-1
- script setup 邏輯不動

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: ChildMeasurementsView (含 echarts M3 palette)

**Files:**
- Modify: `src/parent/views/ChildMeasurementsView.vue`

關鍵：echarts setOption 內 series color 從預設 / hex 改 M3 token（透過 getComputedStyle 取 CSS var 值）。

- [ ] **Step 1: Read ChildMeasurementsView 完整**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
cat src/parent/views/ChildMeasurementsView.vue
```

- [ ] **Step 2: 定位 echarts setOption 區塊**

```bash
grep -n "setOption\|color:\|color :" src/parent/views/ChildMeasurementsView.vue
```

- [ ] **Step 3: baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 4: 加入 M3 color 解析 helper**

在 `<script setup>` 區塊內，於 `ensureEcharts` function 之後或 `setOption` 之前，新增 helper：

```js
function m3Color(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(`--m3-${name}`)
    .trim()
  return v || fallback
}
```

並在 setOption 的 series 配色處（依實際既有 code，找到 series color 或 itemStyle.color）改為使用 `m3Color('primary', '#006d3d')`、`m3Color('tertiary', '#3a6571')` 之類。如果原本沒明確設 color（用 echarts 預設色），則 series 加上 `color: m3Color('primary', '#006d3d')`（單線）或為兩條 series 個別指定。

依實際 metric (`height` / `weight`) 切換 primary / tertiary。

- [ ] **Step 5: Style 區塊 token swap**

| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `12px` |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--brand-primary)` (metric toggle selected) | `var(--m3-primary, var(--brand-primary))` |

- [ ] **Step 6: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 7: Commit**

```bash
git add src/parent/views/ChildMeasurementsView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): ChildMeasurementsView 切 M3 + chart 配色 M3

- echarts series color 改用 m3-primary / m3-tertiary (透過 getComputedStyle)
- 圖表卡片圓角 12px + surface-container-low
- metric toggle selected 套 m3-primary

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: ChildPhotosView (照片網格)

**Files:**
- Modify: `src/parent/views/ChildPhotosView.vue`

照片網格頁。改 grid item 圓角 + shimmer loading bg。script setup 不動。

- [ ] **Step 1: Read ChildPhotosView**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
cat src/parent/views/ChildPhotosView.vue
```

- [ ] **Step 2: baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 3: 套替換**

| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `12px` |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-surface-mute)` (shimmer placeholder bg) | `var(--m3-surface-container-high, var(--pt-surface-mute))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--pt-text-muted)` | `var(--m3-on-surface-variant, var(--pt-text-muted))` |

- [ ] **Step 4: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 5: Commit**

```bash
git add src/parent/views/ChildPhotosView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): ChildPhotosView 照片牆 M3 化

- 網格 item 圓角 12px (M3 image list)
- shimmer placeholder 套 surface-container-high

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: ChildReportsView (PDF 報告列表)

**Files:**
- Modify: `src/parent/views/ChildReportsView.vue`

- [ ] **Step 1: Read ChildReportsView**

```bash
cat src/parent/views/ChildReportsView.vue
```

- [ ] **Step 2: baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 3: 套替換**

| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `12px` |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-shadow-card, var(--pt-elev-1))` | `var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--brand-primary)` (download button) | `var(--m3-primary, var(--brand-primary))` |

- [ ] **Step 4: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 5: Commit**

```bash
git add src/parent/views/ChildReportsView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): ChildReportsView 成長報告列表 M3 化

- 列表項圓角 12px + surface-container-low
- 下載按鈕色 m3-primary

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: AttendanceView (出席紀錄)

**Files:**
- Modify: `src/parent/views/AttendanceView.vue`

361 行。月曆 / 列表雙視圖。

- [ ] **Step 1: Read AttendanceView**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
cat src/parent/views/AttendanceView.vue
```

- [ ] **Step 2: baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 3: 套替換**

| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `12px` |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-shadow-card, var(--pt-elev-1))` | `var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--pt-text-muted)` | `var(--m3-on-surface-variant, var(--pt-text-muted))` |
| `var(--pt-success-text)` (出席 chip) | `var(--m3-primary, var(--pt-success-text))` |
| `var(--pt-warning-text)` (遲到 chip) | `var(--m3-tertiary, var(--pt-warning-text))` |
| `var(--pt-danger-text)` 或 `var(--color-danger-text)` (缺席 chip) | `var(--m3-error, var(--color-danger-text))` |

- [ ] **Step 4: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 5: Commit**

```bash
git add src/parent/views/AttendanceView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): AttendanceView 出席紀錄 M3 化

- 月曆 + 列表圓角 12px + surface-container-low
- 出席狀態 chip 套 M3 tonal (primary/tertiary/error)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: FamilyView (家校主頁容器)

**Files:**
- Modify: `src/parent/views/FamilyView.vue`

102 行容器頁。提供進入子女檔案、出席、公告、活動等的 grid。

- [ ] **Step 1: Read FamilyView**

```bash
cat src/parent/views/FamilyView.vue
```

- [ ] **Step 2: baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 3: 套替換**

| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `16px` |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-shadow-card, var(--pt-elev-1))` | `var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--pt-tint-brand, var(--brand-primary-soft))` (icon bg) | `var(--m3-secondary-container, var(--pt-tint-brand, var(--brand-primary-soft)))` |

- [ ] **Step 4: baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 5: Commit**

```bash
git add src/parent/views/FamilyView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): FamilyView 家校主頁容器 M3 化

- 功能入口圓角 14 → 16px
- icon bg 套 m3-secondary-container

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 全套驗證

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
git log --oneline feat/parent-m3-phase-4-2-frontend..HEAD
```

Expected: 7 個 commit (Task 1-7)。

---

## Self-Review 後備檢查表

- [ ] MilestoneCard hardcoded hex 換 M3 token
- [ ] MilestoneCarousel/ReactionBar/TimelineItem token swap
- [ ] ChildProfileView 6+ section card 套 M3
- [ ] ChildMeasurementsView echarts 配色 M3
- [ ] ChildPhotosView 網格 12px + shimmer
- [ ] ChildReportsView 列表 M3
- [ ] AttendanceView 月曆 + 狀態 chip M3
- [ ] FamilyView 容器頁 M3
- [ ] M3 元件 135 全綠 / parent 228 / 4 (pre-existing) 不變
- [ ] script setup logic 全部不動

---

## P4.3 完成後

- 進 **P4.4 plan**（申請/我的/收費群 11 view，P4 最後一個 sub-PR）。
- P4.4 plan 由 implementer 重新調用 writing-plans skill 寫，spec §7.4 為依據。
