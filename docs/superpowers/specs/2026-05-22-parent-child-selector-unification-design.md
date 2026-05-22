# 家長端多寶家庭子女選擇器統一 design

**Date**：2026-05-22
**Scope**：`ivy-frontend/src/parent/`（純前端，0 後端、0 router、0 store 結構改動）
**Author**：Claude（brainstorming session with @wu0010802）

---

## 1. 背景與問題

多寶家庭在現行家長端體驗的痛點：

1. **TodayView 沒有可見的子女選擇器**。內部 `selectedStudentId` 決定「今日聯絡簿 hero card」顯示哪個孩子，但 UI 上沒有任何 selector，多寶家長無法判斷目前 hero card 是老大還是老二，也無法切換。
2. **`ChildrenStrip` 不是 selector**。它是「孩子卡片清單」，點下去 `router.push('/children/${id}')` 跳到 child profile，無法在 TodayView 切換「我要看老二的今日」。
3. **`ChildSelector`（chip 條）才是真正的 selector**，已用在 7 個子 view（Contact / Attendance / Leaves / Fees / Medication / Activity / Family），透過 module-singleton `useChildSelection` 自動同步。但它只是一條 chip，不是 page hero，多寶家長進入子 view 時不容易第一時間確認「正在看誰」。
4. **持久化僅止於 sessionStorage**。`parent_selected_student_id_v1` 在關 tab 或 PWA 重啟後丟失，多寶家庭每次重開 app 都被重置到「第一個小孩」。
5. **核心 UX 主張「3 秒看見」對多寶家庭失效**：使用者必須花心力辨識「目前的內容是哪個孩子的」，而非一進畫面就看到。

## 2. 設計目標

- 多寶家庭在所有家長端頁面（Today + 7 子 view）**永遠看得到「正在看誰」**。
- 子女選擇 **跨 session 持久**（重開 PWA 仍記得上次選擇）。
- 切換管道 **單一統一**：一個 UX 元件處理切換，不再有 `ChildSelector` chip 與 `ChildrenStrip` 卡片兩種並存的入口。
- 既有 fetch / watch / store 邏輯 **不動**——降低風險。

## 3. 範圍與不在範圍

**在範圍**：
- `useChildSelection.ts` 持久化升級（sessionStorage → localStorage）
- 新增 `<ChildContextHeader>` 共用元件
- TodayView 重整（ChildrenStrip 改為 selector mode、hero 收斂）
- 7 子 view 接 ChildContextHeader、移除 ChildSelector 引用

**不在範圍**：
- 路由結構改動（不引入 `/contact-book/:sid` 之類深連結）
- 後端 user preference 表（未來若要跨裝置同步再評估）
- `ChildSelector.vue` 元件本體刪檔（保留 0 引用，下個 sprint 驗無引用後再刪）
- `useChildrenStore` 結構改動（不動 store layer）
- Admin 端任何改動

## 4. 架構總覽

```
┌─────────────────────────────────────────┐
│  useChildSelection（module-singleton）    │
│  - selectedId: ref<number|null>          │
│  - localStorage key: v2                  │
│  - 反應式，所有 view 自動同步              │
└──────────────┬──────────────────────────┘
               │ readonly + setSelected
               ▼
   ┌───────────────────────────┐
   │  <ChildContextHeader>      │
   │  variant: 'page' | 'hero'  │
   │  - 單孩：顯示不可 tap        │
   │  - 多寶：tap → BottomSheet   │
   └─────────┬─────────────────┘
             │ 被嵌入於：
   ┌─────────┼─────────────────┐
   │         │                  │
   ▼         ▼                  ▼
TodayView  7 子 view         FamilyView
(hero)    (page)            (page)
   │
   ├── ChildrenStrip (selector mode)  ← 多寶才顯示
   │   - 點本體 = 切 selected
   │   - 右上 IconButton = 進 profile
   │
   └── 今日聯絡簿 hero card / Timeline
```

## 5. 詳細設計

### 5.1 `useChildSelection.ts` 升級

**檔案**：`src/parent/composables/useChildSelection.ts`

**改動**：
- key 從 `parent_selected_student_id_v1` → **`parent_selected_student_id_v2`**（命名升版避開既有 sessionStorage 殘留；v2 改用 localStorage）
- `loadStored()` / `saveStored()` 從 `sessionStorage` 改用 `localStorage`
- API surface 不變：`selectedId` / `setSelected` / `ensureSelected` / `selectedChild` 4 個 export 保留
- module-level singleton `selectedId` ref + `watch(selectedId, saveStored)` 結構不動
- 加 try/catch 保留——某些瀏覽器 private mode localStorage 可能拋例外

**`ensureSelected(children)` 行為不變**：
- localStorage 有值且仍在 children list → 沿用
- 否則預設第一個孩子
- children 為空 → null

**單元測試（改寫）**：`tests/unit/parent/composables/useChildSelection.test.ts`
- localStorage mock（取代既有的 sessionStorage mock）
- 跨 module reload 驗證持久化（重 import 後 selectedId 仍是上次值）
- v1 sessionStorage 殘留不影響 v2 行為
- private mode（localStorage throw）fallback 不 crash

### 5.2 `<ChildContextHeader>` 新元件

**檔案**：`src/parent/components/ChildContextHeader.vue`

**接口**：
```ts
defineProps<{
  variant?: 'page' | 'hero'  // 預設 'page'
}>()
```

state 全部從 `useChildSelection` + `useChildrenStore` 自取，不從 props 傳 child id——確保 7 view 跨頁一致性。

**單孩家庭（`childrenStore.items.length <= 1`）**：純顯示 div，不可 tap。

```
[avatar] 小明  ·  星辰班
```

**多寶家庭（`length > 1`）**：button[aria-haspopup="dialog"]，右側 chevron-down，tap → 開 `ParentBottomSheet`。

```
[avatar] 小明  ·  星辰班    ⌄
   tap 後 ↓
┌────────────────────┐
│ 切換孩子            │
│ ● 小明  星辰班      │
│ ○ 小華  晨曦班      │
│ ○ 小美  星辰班      │
└────────────────────┘
```

**variant 差異**：
- `page`：avatar 48×48，文案用 `pt-section-title` 尺寸，無背景
- `hero`：avatar 62×62，文案用 `today-hero` 尺寸右側排版，承接 TodayView 既有 laurel 背景

**為什麼選 BottomSheet 而非保留 chip selector**：
- chip 在多寶 ≥4 位時橫向 scroll 不順手；BottomSheet 統一處理
- 7 view 移除 chip selector 上方版面省 ~50px 留給內容
- TodayView 的 `ChildrenStrip` 本身是更豐富的卡片清單已涵蓋切換 + 額外資訊（班級 / 關係 / tag），與 BottomSheet 不重複

**可訪問性**：
- `button[aria-haspopup="dialog"][aria-label="切換孩子"]`
- BottomSheet 自帶 focus trap
- 單孩時 div 不加 aria-label，避免假裝可互動

**單元測試**：`tests/unit/parent/components/ChildContextHeader.test.ts`
- 單孩：渲染 div 不可 tap
- 多寶：渲染 button 可 tap，tap 後 BottomSheet 開
- 選 item 後 `selectedId` 更新且 BottomSheet 關閉
- `variant='hero'` vs `variant='page'` 樣式分支

### 5.3 TodayView 重整

**檔案**：`src/parent/views/TodayView.vue`

**改動 A：`ChildrenStrip` 從 navigation cards 改成 selector cards**

`src/parent/components/home/ChildrenStrip.vue` 修改：
- props 新增 `selectedId?: number | null`
- emits 新增 `select: [studentId: number]`，`navigate` 改為次要動作
- 點卡片本體 → `emit('select', c.student_id)`（不再 navigate）
- 加 `active` 視覺狀態（border 加粗 + box-shadow 加強 + avatar 用 `brand-primary-soft`），條件 `selectedId === c.student_id`
- 卡片右上角加 secondary IconButton（`person` icon，44×44 touch target），tap = `emit('navigate', '/children/${id}')`——進 profile 的入口保留
- 移除卡片內 `<ParentIcon name="chevron-right" />`（避免暗示「點下去會跳走」）

**改動 B：TodayView hero 區架構**

```
LaurelWreath（背景不動）
今日 5 月 22 日 星期五            ← today-date 不動
─────────────────────────────
[ChildContextHeader variant="hero"] ← 新增，覆蓋 hero h1+note
  [62 avatar] 小明              ⌄
              星辰班 · 已離園
─────────────────────────────
[ChildrenStrip selector mode]   ← 多寶才顯示，現役 v-if="children.length > 1" 不變
─────────────────────────────
[今日聯絡簿 hero card]           ← 不動，仍綁 selectedChild
[TodayTimeline]                  ← 不動
```

**改動 C：`hero` computed 重寫**
- `hero.kind === 'multi'`（既有「今天 N 位小朋友」聚合文案）**移除**，改成顯示 selected 單孩的 `childStatusLabel(selectedTodayChild)`
- `hero.kind === 'empty'`（沒綁孩子）邏輯保留
- `hero.kind === 'single'` 邏輯保留（單孩家庭未受影響）

**改動 D：ChildrenStrip 接線**
```vue
<ChildrenStrip
  v-if="children.length > 1"
  :children="children"
  :selected-id="selectedStudentId"
  @select="setSelected"
  @navigate="go"
/>
```

**watch 連動**：
- 既有 `watch(selectedStudentId, () => loadContactBook())` 保留
- `todayStatus` 是全家總表，無需新增 watch

### 5.4 7 個子 view 接 `<ChildContextHeader>`

**統一改動 diff**（ContactBook / Attendance / Leaves / Fees / Medication / Activity / Family）：

```diff
- import ChildSelector from '../components/ChildSelector.vue'
+ import ChildContextHeader from '../components/ChildContextHeader.vue'

  <template>
+   <ChildContextHeader variant="page" />
    <existing page hero / 內容>
-   <ChildSelector />
  </template>
```

**保留**：
- `useChildSelection` import 保留（view 內仍需讀 `selectedId` 拿 data）
- `ensureSelected(children.value)` 呼叫保留（store load 完才能 ensure）
- 各 view 的 fetch / watch 邏輯不動

**`ChildSelector.vue` 元件本體**：保留檔案不刪，0 引用。spec §3 註明「下個 sprint 確認無引用後可刪」。

**FamilyView 特例**：
- FamilyView 的 hero 是「家庭時間軸 + 全家活動」，selected 意義是「看誰的 timeline」而非「看誰的資料」
- 仍套 `<ChildContextHeader variant="page" />`，UX 一致
- `watch(selectedId)` refresh timeline 邏輯不動

## 6. 測試策略

**新增 / 改寫**：
- `tests/unit/parent/composables/useChildSelection.test.ts`（改寫，localStorage mock）
- `tests/unit/parent/components/ChildContextHeader.test.ts`（新增）
- `tests/unit/parent/components/home/ChildrenStrip.test.ts`（改寫，selector mode 行為）
- TodayView 既有 test：改 hero 文案 assertion（multi → 顯示 selected 單孩狀態，非聚合）

**不需新增測試**：
- 7 子 view 的測試不變（資料 fetch / 渲染邏輯未動）
- store layer 不變

## 7. 風險與決策紀錄

### 7.1 `ChildrenStrip` 主 tap 區從「進 profile」改「切 selector」是 breaking UX

**風險**：既有用戶若習慣點卡片進 profile 會困惑。

**緩解**：
- 進 profile 入口保留為卡片右上 IconButton（44×44 touch target，可訪問）
- `/me` 頁面也能進 child profile，入口未消失
- 多寶家庭使用「進 profile」的頻率遠低於「切看誰」，trade-off 合理

### 7.2 BottomSheet 切換 vs chip selector

**決策**：BottomSheet。
- chip 在 ≥4 寶家庭橫向 scroll 不順
- 7 view 移除 chip 上方版面省 ~50px
- TodayView 的 ChildrenStrip 已涵蓋切換場景

### 7.3 localStorage 換裝置不同步

**決策**：接受。本 spec 不引入後端 user preference（工程量過大），跨裝置不同步是已知限制。未來若要做，是獨立的後端 API + migration。

### 7.4 ChildSelector.vue 保留檔案

**決策**：本 PR 不刪檔。
- 避免破壞 `import { ChildSelector }` 的測試或殘留引用
- 下個 sprint 確認全 codebase 無引用後可刪

## 8. 實作順序（4 commits）

1. **commit 1**：`useChildSelection` localStorage 升級 + 測試改寫
2. **commit 2**：新增 `<ChildContextHeader>` + BottomSheet 整合 + 測試
3. **commit 3**：TodayView 重整（ChildrenStrip selector mode、hero 收斂、移除聚合文案）+ 測試調整
4. **commit 4**：7 子 view 接 ChildContextHeader + 移除 ChildSelector 引用 + 既有測試調整

預估 ~600 LOC（含測試）。前端 only，0 後端、0 router、0 store 結構改動。

## 9. 驗收條件

- [ ] 多寶家庭重開 PWA 後 selectedId 仍記得上次選擇
- [ ] TodayView 多寶家庭看得到 ChildContextHeader（hero variant）+ ChildrenStrip selector cards（active state 對齊 selectedId）
- [ ] 點 TodayView 的 ChildrenStrip 卡片本體 → selectedId 改變、hero / 今日聯絡簿 hero card 同步
- [ ] 點 TodayView 的 ChildrenStrip 卡片右上 IconButton → navigate 到 child profile
- [ ] 7 個子 view 進站時看得到 ChildContextHeader（page variant），多寶可 tap 開 BottomSheet
- [ ] 從 TodayView 選「小華」→ tap ContactBook tab → 看到 ChildContextHeader 顯示「小華」+ 小華的聯絡簿（不重置）
- [ ] 單孩家庭：ChildContextHeader 顯示但不可 tap、ChildrenStrip 不顯示（v-if 仍 `length > 1`）
- [ ] 全套 parent vitest 綠
- [ ] `npm run typecheck` 綠
- [ ] `npm run build` 綠

## 10. 後續可能

（不在本 spec，僅備忘）

- 後端 user preference 表（跨裝置同步）
- `ChildSelector.vue` 刪檔
- `/contact-book/:sid` 深連結（轉實時可分享）
- ChildContextHeader 加未讀數 badge（哪個孩子有新聯絡簿 / 待簽核）
