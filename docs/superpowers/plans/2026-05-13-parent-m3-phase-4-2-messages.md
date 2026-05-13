# 家長端 Material 3 重寫 P4.2：訊息/家校群 view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P4 第二個 sub-PR：家長端訊息/家校群 6 view + 2 子元件 (MessageBubble / MessageComposer) 視覺切到 Material 3。重點為 chat bubble 圓角 18px、自己訊息用 primary-container、對方用 surface-container-high；訊息輸入區用 28px 圓角 chat bar；訊息列表走 M3List two-line pattern；其餘 view 做 token swap。零 API 破壞、既有 ~200 parent 測試零新增 regression。

**Architecture:** 沿用 P4.1 visual-only refactor 策略：所有檔案只動 `<template>` 內部結構（必要時）與 `<style scoped>` token 引用；`<script setup>` 內 reactive state、API call、send/recall/delete 等業務邏輯完全不動。MessageBubble 是 M3 chat bubble spec 的試煉場（圓角 18 + 18 + 4 + 18 不對稱角，標誌 chat tail）。

**Tech Stack:** Vue 3 `<script setup>`，沿用 P0-P3 已建的 M3 tokens + 17 個 M3 元件 + iconMapping 自動切換。

**Spec reference:** `docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md` §7.2。

**Branch:** 從 `feat/parent-m3-phase-4-1-frontend` head 切 `feat/parent-m3-phase-4-2-frontend`。

---

## File Structure

```
src/parent/components/
├── MessageBubble.vue      (Task 1 — chat bubble M3 化)
└── MessageComposer.vue    (Task 2 — chat bar M3 化)

src/parent/views/
├── MessagesView.vue           (Task 3 — 訊息列表 two-line)
├── MessageThreadView.vue      (Task 4 — thread 容器頁)
├── ContactBookView.vue        (Task 5 — 聯絡簿列表)
├── ContactBookDetailView.vue  (Task 6 — 聯絡簿詳情，含 ConfirmDialog 整合驗證)
├── EventsView.vue             (Task 7 — 事件列表)
└── EventAckView.vue           (Task 8 — 事件簽閱)
```

不動：script setup logic、API call、router、tests。

---

### Task 0: P4.2 branch setup

- [ ] **Step 1: 從 P4.1 head 切分支**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
git status   # 確認 clean
git log -1 --format="%h %s"  # HEAD = 9ea5bbd3 P4.1 AnnouncementsView
git checkout -b feat/parent-m3-phase-4-2-frontend
```

- [ ] **Step 2: parent baseline 記下**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 passed / 4 failed (pre-existing)。

---

### Task 1: MessageBubble chat bubble M3 化

**Files:**
- Modify: `src/parent/components/MessageBubble.vue`

策略：M3 chat bubble spec：
- 圓角 18px 為主，tail 角縮成 4px（自己訊息右下 4 / 對方訊息左下 4），其餘 18
- 自己訊息 (`.mine .bubble`)：bg `--m3-primary-container`、color `--m3-on-primary-container`
- 對方訊息 (`.bubble` 非 mine)：bg `--m3-surface-container-high`、color `--m3-on-surface`
- 撤回 (`deleted`)：bg `--m3-surface-container`、italic 樣式
- 待送 (`pending`)：opacity 0.6

- [ ] **Step 1: Read MessageBubble.vue 完整**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
cat src/parent/components/MessageBubble.vue
```

- [ ] **Step 2: Read style 內 token 引用**

```bash
grep -n "var(--pt-\|background:\|color:\|border-radius:" src/parent/components/MessageBubble.vue
```

- [ ] **Step 3: 套以下替換規則**

對 `.bubble` 一般狀態（對方訊息）：
| 找到 | 替換為 |
|------|-------|
| `background: var(--pt-surface-card)` | `background: var(--m3-surface-container-high, var(--pt-surface-card))` |
| 既有 `border-radius:` (如 12px / 14px) | `border-radius: 18px 18px 18px 4px` |
| `color: var(--pt-text-strong)` | `color: var(--m3-on-surface, var(--pt-text-strong))` |

對 `.mine .bubble`：
| 找到 | 替換為 |
|------|-------|
| `background: var(--brand-primary-soft)` 或 `--pt-tint-brand` | `background: var(--m3-primary-container, var(--brand-primary-soft))` |
| 既有 `border-radius:` | `border-radius: 18px 18px 4px 18px` |
| `color: var(--brand-primary)` 或 `--pt-text-strong` | `color: var(--m3-on-primary-container, var(--pt-text-strong))` |

依實際 CSS 結構調整 old_string。

- [ ] **Step 4: 跑 baseline 確認零新增**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 / 4 不變。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/MessageBubble.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): MessageBubble 切 M3 chat bubble 樣式

- 圓角 18px (mine 右下 4 / 對方左下 4，標誌 chat tail)
- 自己訊息 bg primary-container；對方 surface-container-high
- props/emit 邏輯不動

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: MessageComposer chat bar M3 化

**Files:**
- Modify: `src/parent/components/MessageComposer.vue`

策略：
- 輸入框圓角 28px（M3 single-line chat bar pill）
- bg 改 `--m3-surface-container-high`
- 送出按鈕用 M3IconButton variant=filled
- 附件區 chip 樣式套 M3 surface-container-low

- [ ] **Step 1: Read MessageComposer.vue 完整**

```bash
cat src/parent/components/MessageComposer.vue
```

- [ ] **Step 2: 套以下替換**

對 chat bar 容器：
| 找到 | 替換為 |
|------|-------|
| `border-radius: var(--pt-card-radius, 14px)` (chat bar wrapper) | `border-radius: 28px` |
| `background: var(--pt-surface-card)` (chat bar bg) | `background: var(--m3-surface-container-high, var(--pt-surface-card))` |
| `var(--pt-tint-brand, var(--brand-primary-soft))` (附件 chip) | `var(--m3-surface-container-low, var(--pt-tint-brand, var(--brand-primary-soft)))` |
| 送出 button bg `var(--brand-primary)` | `var(--m3-primary, var(--brand-primary))` |

- [ ] **Step 3: 跑 baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/components/MessageComposer.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): MessageComposer 切 M3 chat bar 樣式

- chat bar 圓角 28px (M3 single-line input)
- bg surface-container-high
- 附件 chip + 送出 button M3 化
- script setup 邏輯不動

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: MessagesView 訊息列表 M3 化

**Files:**
- Modify: `src/parent/views/MessagesView.vue`

策略：
- 列表項用 M3List two-line 樣式（標題 + supporting text）
- 未讀：title-medium 字重加粗 + tertiary 小圓點
- 列表項圓角 12px、bg surface
- 點擊 state layer overlay

- [ ] **Step 1: Read MessagesView.vue 完整**

```bash
cat src/parent/views/MessagesView.vue
```

- [ ] **Step 2: 套 token 替換**

| 找到 | 替換為 |
|------|-------|
| `var(--pt-surface-card)` (列表項 bg) | `var(--m3-surface, var(--pt-surface-card))` |
| `var(--pt-card-radius, 14px)` | `12px` |
| `var(--pt-shadow-card, var(--pt-elev-1))` | `none`（M3 list 不用 shadow，用 hairline divider） |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--brand-primary)` (未讀 dot/badge) | `var(--m3-tertiary, var(--brand-primary))` |
| `var(--pt-border)` (divider) | `var(--m3-outline-variant, var(--pt-border))` |

- [ ] **Step 3: 跑 baseline**

```bash
npm run test -- Messages 2>&1 | tail -8
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/views/MessagesView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): MessagesView 訊息列表 M3 化

- 列表項圓角 12px + surface bg
- 未讀 dot 改 M3 tertiary
- divider 用 M3 outline-variant

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: MessageThreadView visual M3 化

**Files:**
- Modify: `src/parent/views/MessageThreadView.vue`

容器頁，bubble 與 composer 已 M3 化。view 自己改 thread body bg + 日期分隔器 + 載入 indicator。

- [ ] **Step 1: Read MessageThreadView.vue**

```bash
cat src/parent/views/MessageThreadView.vue
```

- [ ] **Step 2: 套替換**

| 找到 | 替換為 |
|------|-------|
| `var(--pt-surface-thread-bg, var(--ivy-cream-bg, #fffce8))` | `var(--m3-surface, var(--pt-surface-thread-bg, var(--ivy-cream-bg, #fffce8)))` |
| `var(--pt-surface-app)` | `var(--m3-surface, var(--pt-surface-app))` |
| `var(--pt-text-muted)` (日期分隔器) | `var(--m3-on-surface-variant, var(--pt-text-muted))` |

- [ ] **Step 3: 跑 baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/views/MessageThreadView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): MessageThreadView visual M3 化

- thread body bg 切 M3 surface
- 日期分隔器套 m3-on-surface-variant
- AppHeader 已由 ParentLayout 提供 (P2 已 M3 化)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: ContactBookView 聯絡簿列表 M3 化

**Files:**
- Modify: `src/parent/views/ContactBookView.vue`

CAUTION: ContactBookView 有 spec test (`ContactBookView.test.js`)。Token swap 不影響 selector，應安全。

- [ ] **Step 1: Read ContactBookView**

```bash
cat src/parent/views/ContactBookView.vue
```

- [ ] **Step 2: 跑 baseline 記下測試數**

```bash
npm run test -- ContactBookView 2>&1 | tail -10
```

- [ ] **Step 3: 套 token 替換**

| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `12px` |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-shadow-card, var(--pt-elev-1))` | `var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--pt-tint-contact, var(--ivy-tile-pink-bg))` | `var(--m3-tertiary-container, var(--pt-tint-contact, var(--ivy-tile-pink-bg)))` |
| 日期 chip bg `var(--brand-primary-soft)` | `var(--m3-secondary-container, var(--brand-primary-soft))` |

- [ ] **Step 4: 確認測試**

```bash
npm run test -- ContactBookView 2>&1 | tail -10
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: baseline count 不變。

- [ ] **Step 5: Commit**

```bash
git add src/parent/views/ContactBookView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): ContactBookView 聯絡簿列表 M3 化

- 圓角 14 → 12px
- 引用 --m3-surface-container-low / --m3-elev-1 / --m3-tertiary-container
- 日期 chip M3 secondary-container

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: ContactBookDetailView visual M3 化

**Files:**
- Modify: `src/parent/views/ContactBookDetailView.vue`

CAUTION: 有 spec test (`ContactBookDetailView.deleteReply.test.js`)。內含 ConfirmDialog 互動，P3 ConfirmDialog 已 M3 化，這裡只動 view 樣式。

- [ ] **Step 1: Read 檔案**

```bash
cat src/parent/views/ContactBookDetailView.vue
```

- [ ] **Step 2: baseline**

```bash
npm run test -- ContactBookDetail 2>&1 | tail -10
```

- [ ] **Step 3: 套 token 替換**

| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `16px`（detail card 略大） |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-surface-note)` (老師回應 note bg) | `var(--m3-surface-container-high, var(--pt-surface-note))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--pt-text-muted)` | `var(--m3-on-surface-variant, var(--pt-text-muted))` |
| 回應 input 框 `var(--pt-surface-mute)` | `var(--m3-surface-container, var(--pt-surface-mute))` |

- [ ] **Step 4: 確認測試**

```bash
npm run test -- ContactBookDetail 2>&1 | tail -10
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 5: Commit**

```bash
git add src/parent/views/ContactBookDetailView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): ContactBookDetailView visual M3 化

- 圓角 14 → 16px (detail page card)
- 老師 note 區套 m3-surface-container-high
- 回應 input M3 surface-container
- deleteReply 邏輯不動（ConfirmDialog 已 P3 M3 化）

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: EventsView visual M3 化

**Files:**
- Modify: `src/parent/views/EventsView.vue`

398 行最大檔案。事件列表 + 多種狀態 chip。

- [ ] **Step 1: Read EventsView**

```bash
cat src/parent/views/EventsView.vue
```

- [ ] **Step 2: Read style 區段 token**

```bash
grep -n "var(--pt-\|var(--brand-\|var(--ivy-" src/parent/views/EventsView.vue | head -30
```

- [ ] **Step 3: 套替換**

| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `12px` |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-shadow-card, var(--pt-elev-1))` | `var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--pt-text-muted)` | `var(--m3-on-surface-variant, var(--pt-text-muted))` |
| `var(--pt-tint-event, var(--ivy-tile-purple-bg))` | `var(--m3-secondary-container, var(--pt-tint-event, var(--ivy-tile-purple-bg)))` |
| `var(--pt-warning-text)` (待簽閱 chip) | `var(--m3-tertiary, var(--pt-warning-text))` |
| `var(--pt-success-text)` (已簽閱 chip) | `var(--m3-primary, var(--pt-success-text))` |

- [ ] **Step 4: baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 5: Commit**

```bash
git add src/parent/views/EventsView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): EventsView 事件列表 M3 化

- 列表項圓角 12px + surface-container-low
- 狀態 chip 套 M3 tonal palette (tertiary/primary/secondary-container)
- script setup 邏輯不動

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: EventAckView visual M3 化

**Files:**
- Modify: `src/parent/views/EventAckView.vue`

事件簽閱頁，含 SignaturePad。Signature 元件保留不動（P3 spec 沒列；P5 可選改）。

- [ ] **Step 1: Read EventAckView**

```bash
cat src/parent/views/EventAckView.vue
```

- [ ] **Step 2: 套替換**

| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `16px` |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--pt-border)` (簽名框 border) | `var(--m3-outline-variant, var(--pt-border))` |

- [ ] **Step 3: baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/views/EventAckView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): EventAckView visual M3 化

- 內容卡圓角 14 → 16px
- 簽名框 border 用 M3 outline-variant
- SignaturePad 元件 P5 視需要改（本 task 不動）

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 全套驗證

**Files:** 無

- [ ] **Step 1: 跑全套 m3 元件測試**

```bash
npm run test -- src/parent/components/m3 2>&1 | tail -8
```

Expected: 135 全綠。

- [ ] **Step 2: 跑全套 parent**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -10
```

Expected: 228 / 4 (pre-existing) 不變。

- [ ] **Step 3: Dev server 確認啟動**

```bash
(npm run dev 2>&1 &); DEV_PID=$!; sleep 6; kill $DEV_PID 2>/dev/null; wait 2>/dev/null
```

Expected: `VITE ... ready`。

- [ ] **Step 4: 列 P4.2 commit 摘要**

```bash
git log --oneline feat/parent-m3-phase-4-1-frontend..HEAD
```

Expected: 8 個 commit (Task 1-8)。

---

## Self-Review 後備檢查表

- [ ] MessageBubble M3 chat bubble 圓角 18px + 4 角不對稱、primary-container / surface-container-high
- [ ] MessageComposer chat bar 28px 圓角
- [ ] MessagesView 列表 + 未讀 dot M3
- [ ] MessageThreadView thread body 容器 M3
- [ ] ContactBookView + DetailView visual M3
- [ ] EventsView 狀態 chip M3 tonal
- [ ] EventAckView visual M3
- [ ] 全部 script setup 邏輯不動
- [ ] M3 元件 135 全綠 / parent 228 / 4 (pre-existing) 不變

---

## P4.2 完成後

- 進 **P4.3 plan**（子女檔案群 6 view：ChildProfileView 系列 + AttendanceView + FamilyView）。
- P4.3 含照片牆與量測曲線，視覺上 chart 配色換 M3 palette。
- P4.3 plan 由 implementer 重新調用 writing-plans skill 寫，spec §7.3 為依據。
