# 家長端 Material 3 重寫 P5：Motion + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P5 收尾：把 P0-P4 累積的所有「保留 deprecated」項目最終清理，並把路由轉場與 press feedback 切換到 Material Motion。最終交付：(1) 路由轉場用 emphasized-decel easing；(2) 拿掉全 app 的 `.press-scale` transform 動畫（由 M3 state layer 接手）；(3) 刪除 `AppHeader.vue`（P2 已替換）；(4) bundle size + dark mode 完整驗證。

**Architecture:** P5 全部 surgical 改動，每個 task 影響範圍清楚。`.press-scale` 拿掉策略：CSS rule 從 `globals.css` 刪、各 view template 內 `class="press-scale"` 清掉（17 處）。Form input 替換為 M3TextField 留待後續單獨 PR（DOM 結構變動風險高，不適合 P5 polish phase）。

**Tech Stack:** Vue 3 `<script setup>`、CSS。沿用 P0-P3 已建的 M3 tokens（含 motion / state layer）。

**Spec reference:** `docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md` §8。

**Branch:** 從 `feat/parent-m3-phase-4-4-frontend` head 切 `feat/parent-m3-phase-5-frontend`。

---

## File Structure

```
src/parent/App.vue                        (Task 1 — route transition easing)
src/parent/styles/globals.css             (Task 2 — 拿掉 .press-scale CSS rule)
src/parent/components/ChildSelector.vue   (Task 2 — class 清理)
src/parent/components/home/{PushCta,ChildrenStrip,QuickActions,TodoCenter}.vue  (Task 2)
src/parent/components/leaves/LeaveListCard.vue  (Task 2)
src/parent/components/more/{AppearanceSettings,MoreMenuGroup}.vue  (Task 2)
src/parent/views/{MessagesView,ContactBookView,AnnouncementsView}.vue  (Task 2)
src/parent/components/AppHeader.vue       (Task 3 — 刪除)
src/parent/views/MessageThreadView.vue    (Task 3 — 移除註解殘留)
```

---

### Task 0: P5 branch setup

- [ ] **Step 1: 切分支**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
git status   # 確認 clean
git log -1 --format="%h %s"  # HEAD = 4c5a2c47 P4.4 LoginView
git checkout -b feat/parent-m3-phase-5-frontend
```

- [ ] **Step 2: baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 passed / 4 failed。

---

### Task 1: 路由轉場 Material Motion easing

**Files:**
- Modify: `src/parent/App.vue`（只動 `<style>` 區塊內 transition rule）

策略：當前路由轉場 (`parent-fade` / `parent-slide-forward` / `parent-slide-back`) 用 `cubic-bezier(0.4, 0, 0.2, 1)` 與 140/160ms duration。改為 M3 emphasized-decel + 300ms (medium-2)。

### Step 1: Read App.vue 完整

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
cat src/parent/App.vue
```

### Step 2: baseline

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -5
```

### Step 3: 套替換

對 App.vue 的 `<style>` 區塊（非 scoped，預期是路由動畫定義）：

| 找到（精確） | 替換為 |
|------|-------|
| `cubic-bezier(0.4, 0, 0.2, 1)` | `var(--m3-easing-emphasized-decel, cubic-bezier(0.05, 0.7, 0.1, 1))` |

對於 transition duration（如 `0.14s` / `0.16s` / `140ms` / `160ms`）：依實際數值替換為 M3 motion tokens：

| 找到 | 替換為 |
|------|-------|
| `0.14s` 或 `140ms` (leave duration) | `var(--m3-dur-medium-2, 300ms)` |
| `0.16s` 或 `160ms` (enter duration) | `var(--m3-dur-medium-2, 300ms)` |

備註：原本 leave/enter 區分時間是 Material Motion 慣例「leave 比 enter 快」。M3 spec 簡化為 emphasized-decel + 300ms 統一。如果擔心轉場太慢，可改 `var(--m3-dur-medium-1, 250ms)`。

不精確匹配的跳過。

### Step 4: baseline 確認

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -5
```

Expected: 228 / 4 不變。

### Step 5: Commit

```bash
git add src/parent/App.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): 路由轉場切 Material Motion emphasized-decel

- parent-fade / slide-forward / slide-back 全套 easing 改 M3 emphasized-decel
- duration 統一 300ms (medium-2)
- script setup transition 判斷邏輯不動

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 拿掉 `.press-scale` 動畫（全 app 17 處）

**Files:**
- Modify: `src/parent/styles/globals.css`（刪 `.press-scale` CSS rule + keyframes）
- Modify: 12 個 view / component 含 `class="press-scale"` 的檔案

策略：M3 state layer overlay 已在 P1-P3 各元件內建（`::before` + alpha tokens），所以 `.press-scale` (transform: scale(0.97)) 動畫多餘且與 M3 衝突。刪掉。

### Step 1: 找出所有 press-scale 引用

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
grep -rn "press-scale" src/parent --include="*.vue" --include="*.css"
```

預期：
- globals.css 內 `.press-scale` rule 定義
- 11 個 view / component 內 `class="press-scale"` 或 `:class="['press-scale', ...]"`

### Step 2: baseline

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -5
```

### Step 3: 改 globals.css

用 Edit tool，找到 globals.css 內整段 `.press-scale` CSS rule（含 `:active` 與 `@media reduced-motion`），替換為：

```css
/* ========== Press Feedback (deprecated, kept as no-op for backward compat) ==========
 * P5 (M3 redesign): M3 元件已用 state layer overlay 取代 transform:scale 動畫；
 * 此 class 保留為 no-op 避免 caller template 改寫風險，未來可移除。
 */
.press-scale {
  -webkit-tap-highlight-color: transparent;
}
```

備註：完全刪會導致還在用 class 的 element 失去 -webkit-tap-highlight-color: transparent fallback。保留為 no-op 是安全做法。

### Step 4: 移除 view / component 的 press-scale class（可選）

如果想徹底清理，可以在以下檔案內把 `press-scale` 從 class binding 拿掉。逐檔處理：

- `src/parent/components/ChildSelector.vue`
- `src/parent/components/home/PushCta.vue`
- `src/parent/components/home/ChildrenStrip.vue`
- `src/parent/components/home/QuickActions.vue`
- `src/parent/components/home/TodoCenter.vue`
- `src/parent/components/leaves/LeaveListCard.vue`
- `src/parent/components/more/AppearanceSettings.vue`
- `src/parent/components/more/MoreMenuGroup.vue`
- `src/parent/views/MessagesView.vue`
- `src/parent/views/ContactBookView.vue`
- `src/parent/views/AnnouncementsView.vue`

對每個檔案內的 `class="press-scale"` 或 `:class="['press-scale', ...]"` 或 `:class="{'press-scale': ...}"`，移除 `press-scale` token。

**但**：如果某檔案的 test 用 `.press-scale` selector 斷言（很可能 home 區會），則保留 class 但確保 globals.css no-op 化即可。**先跑 vitest 看哪些 test 失敗再決定**。

### Step 5: baseline 確認

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -5
```

Expected: 228 / 4 不變。如果新增 failure，回頭把 press-scale class 加回去（保留為 no-op）。

### Step 6: Commit

```bash
git add src/parent/styles/globals.css src/parent/views/ src/parent/components/
git commit -m "$(cat <<'EOF'
feat(parent-m3): 拿掉 .press-scale transform 動畫

- globals.css 內 .press-scale 改為 no-op (-webkit-tap-highlight-color transparent fallback)
- transform: scale(0.97) 動畫由 M3 state layer overlay 取代
- caller template 保留 class 避免破壞既有測試

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 刪除 AppHeader.vue + MessageThreadView 註解清理

**Files:**
- Delete: `src/parent/components/AppHeader.vue`
- Modify: `src/parent/views/MessageThreadView.vue`（line 88 註解殘留）

策略：P2 已用 M3TopAppBar 替換，AppHeader 保留 deprecated 至今。確認無剩餘 import 後刪除。

### Step 1: 確認 AppHeader 已無實際 import

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
grep -rn "import.*AppHeader\|from.*AppHeader" src/parent --include="*.vue" --include="*.js"
```

Expected: 無結果（P2 已從 ParentLayout 移除 import）。

### Step 2: 確認只有 MessageThreadView 有註解殘留

```bash
grep -rn "AppHeader" src/parent --include="*.vue"
```

Expected: 只有 `src/parent/views/MessageThreadView.vue:88` (一個註解行)。

### Step 3: baseline

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -5
```

### Step 4: 刪除 AppHeader.vue

```bash
git rm src/parent/components/AppHeader.vue
```

### Step 5: 清理 MessageThreadView.vue 註解

Read MessageThreadView.vue 第 85-95 行：

```bash
sed -n '85,95p' src/parent/views/MessageThreadView.vue
```

預期看到類似這樣的註解：

```vue
    <!-- AppHeader 已由 ParentLayout 提供（router 設 showBack: true）；
         本檔不再 import -->
```

用 Edit tool 把該註解刪掉（或改成更現代的 M3 用語）。如果註解內容含具體實作說明，改寫為：

```vue
    <!-- M3TopAppBar 由 ParentLayout 提供（依 route.meta.showBack 顯示返回鍵） -->
```

### Step 6: baseline 確認

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -5
```

Expected: 228 / 4 不變。如果突然有 build error，可能 main.js 或別處還有 import AppHeader，**回退此 task** 並調查。

### Step 7: Commit

```bash
git add -A src/parent/components/AppHeader.vue src/parent/views/MessageThreadView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): 刪除 AppHeader.vue（P2 已用 M3TopAppBar 替換）

- AppHeader.vue 從 components/ 移除
- MessageThreadView 註解更新為 M3TopAppBar 用語
- 確認無剩餘 import

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: ParentIcon SVG 殘留檢查（可選）

**Files:** 無預期改動

策略：P4.1 已把 ParentIcon.vue 改成 M3Icon wrapper（200 → 30 行）。確認沒有遺留 hardcoded SVG 引用。

### Step 1: 確認 ParentIcon.vue 是 wrapper 形式

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
cat src/parent/components/ParentIcon.vue
```

Expected: import M3Icon + iconMapping helper + 30 行內。

### Step 2: grep 殘留 inline SVG 是否還有 ParentIcon 風格

```bash
grep -rn "viewBox=\"0 0 24 24\"" src/parent --include="*.vue" 2>/dev/null | head -10
```

可能還有手寫 SVG icon 在某些 view 或元件內，但這不是 ParentIcon 問題（個別 view 自己寫 SVG）。P5 不動。

### Step 3: 確認 iconMapping 完整

```bash
cat src/parent/utils/iconMapping.js | grep -c "^  '"
```

Expected: ≥ 38（P4.1 已建）。

如果發現 missing icon name，加進 iconMapping。否則 task 結束。

### Step 4: Commit (if any changes)

如果有 iconMapping 補強，commit；否則 task 視為 no-op。

```bash
# 如果有改動：
git add src/parent/utils/iconMapping.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 補齊 iconMapping 缺漏的 icon name

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 全套驗證 + dark mode + bundle 量測

**Files:** 無

- [ ] **Step 1: 跑全套 m3 元件測試**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
npm run test -- "src/parent/components/m3" 2>&1 | tail -5
```

Expected: 135 全綠。

- [ ] **Step 2: 跑全套 parent**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -10
```

Expected: 228 / 4 (pre-existing) 不變。

- [ ] **Step 3: Dev server 啟動**

```bash
(npm run dev 2>&1 &); DEV_PID=$!; sleep 6; kill $DEV_PID 2>/dev/null; wait 2>/dev/null
```

Expected: `VITE ... ready`。

- [ ] **Step 4: 嘗試 build (預期 fail 在 admin SalaryView pre-existing)**

```bash
npm run build 2>&1 | tail -15
```

Expected: build 失敗在 `SalaryView.vue: Could not resolve "./salary/InsuranceBracketsPanel.vue"`（pre-existing 不是 parent M3 問題）。

註：parent app 自己無法獨立 build（vite config build 共享）。若需驗證 parent dist size，可暫時 stub `InsuranceBracketsPanel.vue` 為空 component。**P5 不修這個** — 它是 admin app 既有 bug，由 admin team 負責。

- [ ] **Step 5: Dark mode 驗證 (manual)**

開 browser console 跑：
```js
document.documentElement.setAttribute('data-theme', 'dark')
```

確認家長端 view 切到 dark M3 palette 正常。**注意**：M3 dark scheme 已在 P0 m3-tokens.css 內建，理論上自動 work。

- [ ] **Step 6: 列 P5 commit 摘要**

```bash
git log --oneline feat/parent-m3-phase-4-4-frontend..HEAD
```

Expected: 3-4 個 commit (Task 1-3, T4 可能 no-op)。

- [ ] **Step 7: 列整個 M3 重寫 P0-P5 commit 摘要**

```bash
git log --oneline main..HEAD | wc -l
git log --oneline main..HEAD | head -30
```

Expected: ~63 commits（P0 9 + P1 7 + P2 5 + P3 9 + P4.1 7 + P4.2 8 + P4.3 6 + P4.4 8 + P5 3-4）。

---

## Self-Review 後備檢查表

- [ ] 路由轉場 easing 切 M3 emphasized-decel
- [ ] `.press-scale` 改 no-op，transform: scale 動畫拿掉
- [ ] AppHeader.vue 刪除，無剩餘 import
- [ ] iconMapping 完整（38+ entries）
- [ ] M3 元件 135 全綠 / parent 228 / 4 (pre-existing) 不變
- [ ] Dev server boot OK
- [ ] Dark mode 切換 manual 驗證 OK

---

## P5 完成後

- 全套 M3 重寫完成。8 個 stacked branch（P0-P5）。
- 後續可選：
  - **PR 推送**：把 8 個 branch 各自 `git push -u origin` + `gh pr create`，stacked PR 形式合進 main。
  - **Form M3TextField 替換**：留待單獨小 PR，避免 P5 polish 卡在 DOM 結構大改。
  - **bundle audit**：當 admin SalaryView bug 修好後跑 build 看 parent app gzip size，對比 spec §1 預算 +60KB。
