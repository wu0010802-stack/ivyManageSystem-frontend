# 家長端一致性與守衛強化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把家長端 design system 的覆蓋面從「主流程乾淨、末端斷層」拉滿，並修掉兩條 silent bug 與一條破壞性操作守衛缺失，同時清掉品牌切換殘骸與 dark mode 雙寫債。

**Architecture:** 純前端 polish/refactor。10 個 atomic commits、單支 branch `feat/parent-portal-consistency-v1`、單一 PR。每個 commit 自完整、可獨立 revert。涵蓋三類改動：(1) bug 修補 + 守衛補位（commits 1-2、8）、(2) 視覺 token 一致化（commits 3-6）、(3) 結構性 refactor（commits 7-8）+ polish/grep 防回歸（commits 9-10）。

**Tech Stack:** Vue 3 (`<script setup>`)、Vue Router 4 (hash mode)、Pinia、Vite、Vitest + happy-dom + @vue/test-utils、純 CSS（design tokens via custom properties）

**Spec：** [`docs/superpowers/specs/2026-05-06-parent-portal-consistency-design.md`](../specs/2026-05-06-parent-portal-consistency-design.md)
**Audit：** [`docs/superpowers/audits/2026-05-06-parent-portal-ux-audit.md`](../audits/2026-05-06-parent-portal-ux-audit.md)

---

## File Structure（總覽）

### 新增檔案

| 路徑 | 用途 | 在 task |
|---|---|---|
| `tests/unit/parent/views/HomeView.pullRefresh.test.js` | 防回歸：pullRefresh 不再 throw | T1 |
| `tests/unit/parent/views/ContactBookDetailView.deleteReply.test.js` | 刪除回覆走 ConfirmDialog | T2 |
| `tests/unit/parent/composables/useTheme.systemAttribute.test.js` | system mode 也設 data-theme | T7 |
| `tests/unit/parent/router.catchAll.test.js` | catch-all → /home | T8 |
| `scripts/parent-audit-grep.sh` | 防回歸 grep（綠 fallback / hex / info-link 主按鈕） | T10 |

### 修改檔案（依 task 分布）

| 檔案 | 影響 task |
|---|---|
| `src/parent/views/HomeView.vue` | T1 |
| `src/parent/views/ContactBookDetailView.vue` | T2、T6 |
| `src/parent/views/ChildProfileView.vue` | T3 |
| `src/parent/views/MedicationListView.vue` | T4 |
| `src/parent/views/MedicationDetailView.vue` | T4 |
| `src/parent/views/MedicationFormView.vue` | T4、T9 |
| `src/parent/views/EventAckView.vue` | T4、T6 |
| `src/parent/views/NotificationPrefsView.vue` | T4 |
| `src/parent/views/CalendarView.vue` | T6 |
| `src/parent/views/ContactBookView.vue` | T6 |
| `src/parent/views/EventsView.vue` | T6 |
| `src/parent/views/AttendanceView.vue` | T6 |
| `src/parent/views/BindView.vue` | T6 |
| `src/parent/views/AnnouncementsView.vue` | T9 |
| `src/parent/views/MoreView.vue` | T9 |
| `src/parent/views/LeavesView.vue` | T5 |
| `src/parent/components/ConnectionBanner.vue` | T6、T9 |
| `src/parent/components/AppHeader.vue` | T5 |
| `src/parent/components/ConfirmDialog.vue` | T5 |
| `src/parent/components/PullToRefresh.vue` | T5 |
| `src/parent/components/activity/RegistrationStatusList.vue` | T4 |
| `src/parent/utils/toast.js` | T5 |
| `src/parent/styles/globals.css` | T5、T6、T7、T9 |
| `src/parent/composables/useTheme.js` | T7 |
| `src/parent/router.js` | T8 |
| `package.json` | T10 |

---

## 前置作業（建議在 worktree 內執行）

- [ ] **建立 branch**

```bash
cd ~/Desktop/ivy-frontend
git checkout -b feat/parent-portal-consistency-v1
```

- [ ] **確認 baseline 測試與 build 都綠**

```bash
npm run test
npm run build
```

兩者都應 PASS / 無新 warning。若紅，請先回報，不要在紅燈 baseline 上開工。

---

## Task 1: 修 HomeView pull-to-refresh `refreshToday` undefined（H2）

**Files:**
- Create: `tests/unit/parent/views/HomeView.pullRefresh.test.js`
- Modify: `src/parent/views/HomeView.vue:69-74`

### Why

`pullRefresh()` 內呼叫的 `refreshToday(true)` 從未在 `<script setup>` 內定義。實際下拉刷新會 throw ReferenceError，被 PullToRefresh `try/catch` 接住寫一條 `console.warn('refresh failed')`，使用者看到 indicator 收回但今日狀態 cache 沒被刷新（silent failure）。

### Steps

- [ ] **Step 1: 寫 failing test**

建立 `tests/unit/parent/views/HomeView.pullRefresh.test.js`：

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mockProfileApi = vi.hoisted(() => ({
  getHomeSummary: vi.fn(),
  getMe: vi.fn(),
  getChildProfile: vi.fn(),
  getTodayStatus: vi.fn(),
}))
vi.mock('@/parent/api/profile', () => mockProfileApi)

const mockAnnApi = vi.hoisted(() => ({ listAnnouncements: vi.fn(), markRead: vi.fn(), getUnreadCount: vi.fn() }))
vi.mock('@/parent/api/announcements', () => mockAnnApi)

import HomeView from '@/parent/views/HomeView.vue'
import PullToRefresh from '@/parent/components/PullToRefresh.vue'

describe('HomeView pullRefresh', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    mockProfileApi.getHomeSummary.mockResolvedValue({
      data: {
        me: { name: '測試家長', can_push: true },
        children: [],
        summary: { fees: { outstanding_count: 0, outstanding: 0, overdue: 0 } },
      },
    })
    mockProfileApi.getTodayStatus.mockResolvedValue({ data: { children: [] } })
  })

  it('下拉刷新不會 throw 且兩支 API 都被重打', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(HomeView, {
      global: { stubs: { teleport: true, RouterLink: true } },
      attachTo: document.body,
    })
    await flushPromises()

    // 第一次 onMounted 已呼叫一次 summary + today
    mockProfileApi.getHomeSummary.mockClear()
    mockProfileApi.getTodayStatus.mockClear()

    const ptr = wrapper.findComponent(PullToRefresh)
    await ptr.vm._triggerRefresh()
    await flushPromises()

    // 沒有任何 PullToRefresh 的 refresh failed 警告（即 pullRefresh 內未 throw）
    const ptrWarnings = consoleWarnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[PullToRefresh] refresh failed'),
    )
    expect(ptrWarnings).toHaveLength(0)

    // summary 與 today 都被重打
    expect(mockProfileApi.getHomeSummary).toHaveBeenCalledTimes(1)
    expect(mockProfileApi.getTodayStatus).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    consoleWarnSpy.mockRestore()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/views/HomeView.pullRefresh.test.js
```

**預期：** FAIL — `[PullToRefresh] refresh failed` warning 數量為 1（因為 `refreshToday is not defined` ReferenceError）。

- [ ] **Step 3: 修 HomeView**

`src/parent/views/HomeView.vue` 的 `pullRefresh` 函式（line 69-74）改為：

```js
// 下拉刷新：等兩支 API 都完成才結束 indicator
async function pullRefresh() {
  await Promise.all([
    refreshSummary(true),
    todayRef.value?.refresh(),
  ])
}
```

把 `refreshToday(true)` 改為 `todayRef.value?.refresh()`（與 line 65 既有 `refresh` 函式同一寫法）。

- [ ] **Step 4: 跑測試確認通過**

```bash
npx vitest run tests/unit/parent/views/HomeView.pullRefresh.test.js
```

**預期：** PASS。

- [ ] **Step 5: 跑全部測試確認沒打到別人**

```bash
npm run test
```

**預期：** 全部綠。

- [ ] **Step 6: Commit**

```bash
git add tests/unit/parent/views/HomeView.pullRefresh.test.js src/parent/views/HomeView.vue
git commit -m "fix(parent): HomeView pull-to-refresh 呼叫未定義 refreshToday

pullRefresh 內 refreshToday(true) 從未在 setup 內宣告，下拉刷新會 throw
ReferenceError 被 PullToRefresh try/catch 接住寫一條 console.warn，使用者
看到 indicator 收回但今日狀態 cache 沒被刷新（silent failure）。

改為呼叫 todayRef.value?.refresh()，與既有 refresh() 函式同一寫法。

補單元測試：mount HomeView 觸發 PullToRefresh._triggerRefresh，斷言
console.warn 沒被打且 getHomeSummary / getTodayStatus 都被重打。"
```

---

## Task 2: ContactBookDetail 刪除回覆補 ConfirmDialog（H5）

**Files:**
- Create: `tests/unit/parent/views/ContactBookDetailView.deleteReply.test.js`
- Modify: `src/parent/views/ContactBookDetailView.vue`

### Why

刪除回覆是破壞性操作，但目前 `removeReply(id)` 直接打 API 刪除，沒守衛。其他破壞性操作（刪附件、取消請假、登出、撤回訊息、刪用藥照片）都用 `ConfirmDialog`。要對齊 pattern。

### Steps

- [ ] **Step 1: 寫 failing test**

建立 `tests/unit/parent/views/ContactBookDetailView.deleteReply.test.js`：

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mockApi = vi.hoisted(() => ({
  getContactBookDetail: vi.fn(),
  ackContactBook: vi.fn(),
  replyContactBook: vi.fn(),
  deleteContactBookReply: vi.fn(),
}))
vi.mock('@/parent/api/contactBook', () => mockApi)

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { entryId: '1' } }),
}))

import ContactBookDetailView from '@/parent/views/ContactBookDetailView.vue'
import ConfirmDialog from '@/parent/components/ConfirmDialog.vue'

describe('ContactBookDetailView 刪除回覆', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockApi.getContactBookDetail.mockResolvedValue({
      data: {
        id: 1,
        log_date: '2026-05-06',
        my_acknowledged_at: '2026-05-06T08:00:00',
        replies: [
          { id: 10, body: '謝謝老師', created_at: '2026-05-06T09:00:00' },
        ],
      },
    })
    mockApi.deleteContactBookReply.mockResolvedValue({ data: { ok: true } })
    mockApi.ackContactBook.mockResolvedValue({ data: {} })
  })

  it('點刪除按鈕後跳出 ConfirmDialog 而非直接 API call', async () => {
    const wrapper = mount(ContactBookDetailView, {
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await flushPromises()

    const deleteBtn = wrapper.find('.link-btn')
    expect(deleteBtn.exists()).toBe(true)
    await deleteBtn.trigger('click')

    // API 不應該被呼叫，confirm dialog 應該顯示
    expect(mockApi.deleteContactBookReply).not.toHaveBeenCalled()
    const dialog = wrapper.findComponent(ConfirmDialog)
    expect(dialog.exists()).toBe(true)
    expect(dialog.props('open')).toBe(true)

    wrapper.unmount()
  })

  it('confirm 後才呼叫 API', async () => {
    const wrapper = mount(ContactBookDetailView, {
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await flushPromises()
    await wrapper.find('.link-btn').trigger('click')

    const dialog = wrapper.findComponent(ConfirmDialog)
    await dialog.vm.$emit('confirm')
    await flushPromises()

    expect(mockApi.deleteContactBookReply).toHaveBeenCalledWith(1, 10)

    wrapper.unmount()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/views/ContactBookDetailView.deleteReply.test.js
```

**預期：** FAIL — 第一條因 API 已被呼叫；第二條因 ConfirmDialog 不存在。

- [ ] **Step 3: 修 ContactBookDetailView.vue**

修改 `<script setup>` 區塊：

(a) 補 import：

```js
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { computed } from 'vue'  // 若已有就不重複加
```

(b) 加 state（在 `const newReply = ref('')` 附近）：

```js
const removeReplyTarget = ref(null) // 待刪除的 reply id 或 null
const removeReplyOpen = computed({
  get: () => removeReplyTarget.value !== null,
  set: (v) => { if (!v) removeReplyTarget.value = null },
})
```

(c) 改寫 `removeReply` → 拆兩階：

```js
function askRemoveReply(replyId) {
  removeReplyTarget.value = replyId
}

async function doRemoveReply() {
  const replyId = removeReplyTarget.value
  removeReplyTarget.value = null
  if (!replyId) return
  try {
    await deleteContactBookReply(entryId, replyId)
    replies.value = replies.value.filter((r) => r.id !== replyId)
  } catch (err) {
    toast.error(err?.displayMessage || '刪除失敗')
  }
}
```

(d) template 內把 `<button class="link-btn" @click="removeReply(r.id)">刪除</button>` 改為：

```html
<button class="link-btn" @click="askRemoveReply(r.id)">刪除</button>
```

(e) template 末端在 `</div></div>` 之前加 ConfirmDialog：

```html
<ConfirmDialog
  v-model:open="removeReplyOpen"
  title="確定刪除這則回覆？"
  message="刪除後無法還原。"
  confirm-label="刪除"
  destructive
  @confirm="doRemoveReply"
/>
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npx vitest run tests/unit/parent/views/ContactBookDetailView.deleteReply.test.js
```

**預期：** 兩條都 PASS。

- [ ] **Step 5: 確認沒打到其他**

```bash
npm run test
```

- [ ] **Step 6: Commit**

```bash
git add tests/unit/parent/views/ContactBookDetailView.deleteReply.test.js src/parent/views/ContactBookDetailView.vue
git commit -m "fix(parent): ContactBookDetail 刪除回覆補 ConfirmDialog 守衛

刪除回覆是破壞性操作但缺二階段確認；其他破壞性操作（刪附件/取消請假/
登出/撤回訊息/刪用藥照片）都已走 ConfirmDialog，這頁是唯一漏網。

拆 askRemoveReply / doRemoveReply 兩階，補 ConfirmDialog destructive 樣式。
補測試：點刪除應顯 dialog 不打 API；confirm 後才打。"
```

---

## Task 3: 修 ChildProfileView broken CSS + 整頁 token 化（H1, M6 ChildProfile 段）

**Files:**
- Modify: `src/parent/views/ChildProfileView.vue`

### Why

`background: var(--neutral-0)eb;`（line 265）是早期 sweep 留下的殘骸（原意為 `#fffbeb`），CSS 解析失敗 → 整條 background 規則被丟掉，warning 卡片在實際渲染中沒有黃底。同檔還有 SEVERITY_COLOR 三組 hardcoded hex、`.change-card` border `#fbbf24`、`.change-text` color `#78350f`、`.primary-btn background: --pt-warning-text-mid`（語意錯誤：警告色當主按鈕底）。整頁脫離 design system。

### Steps

本 task 是純 CSS / view 改寫，無單元測試新增。改完用視覺檢查 + grep 驗證。

- [ ] **Step 1a: 在 globals.css 補 severity tokens（light + dark）**

`src/parent/styles/globals.css` 的 `:root` 區塊（約 line 174 後、`/* Backdrop / blur */` 之前）加入：

```css
  /* ============================================================
   * Severity（過敏 / 醫療警示三階）
   * ============================================================ */
  --pt-severity-mild-bg:   #FFF4C9;  --pt-severity-mild-fg:   #9C7300;  /* sun-soft */
  --pt-severity-mod-bg:    #FFE3E0;  --pt-severity-mod-fg:    #B14545;  /* coral-soft */
  --pt-severity-severe-bg: #FECACA;  --pt-severity-severe-fg: #991B1B;  /* 比 coral 更強，獨立紅 */
```

並在 `:root[data-theme='dark']` 區塊內（約 line 370 對應 tint 附近）加入 dark mode 變體：

```css
  --pt-severity-mild-bg:   rgba(255, 217, 61, 0.20);  --pt-severity-mild-fg:   #FFE285;
  --pt-severity-mod-bg:    rgba(255, 139, 139, 0.20); --pt-severity-mod-fg:    #FFB5AD;
  --pt-severity-severe-bg: rgba(239, 68, 68, 0.22);   --pt-severity-severe-fg: #FECACA;
```

> 暫不修 `@media (prefers-color-scheme: dark)` 區塊（會在 T7 整塊刪除）；系統 dark 偏好下短暫落到 light 預設，視覺微差但功能不破。

- [ ] **Step 1b: 改 SEVERITY_COLOR**

`src/parent/views/ChildProfileView.vue` 內 SEVERITY_COLOR（line 17-21）：

```js
const SEVERITY_COLOR = {
  mild:     { bg: 'var(--pt-severity-mild-bg)',     color: 'var(--pt-severity-mild-fg)' },
  moderate: { bg: 'var(--pt-severity-mod-bg)',      color: 'var(--pt-severity-mod-fg)' },
  severe:   { bg: 'var(--pt-severity-severe-bg)',   color: 'var(--pt-severity-severe-fg)' },
}
```

- [ ] **Step 2: 改 .change-card / .change-text / .primary-btn**

`<style scoped>` 內：

把 line 264-273 區塊：

```css
.change-card {
  background: var(--neutral-0)eb;
  border: 1px solid #fbbf24;
}
.change-text {
  font-size: 13px;
  color: #78350f;
  margin: 0 0 10px;
  line-height: 1.5;
}
.primary-btn {
  width: 100%;
  padding: 10px;
  background: var(--pt-warning-text-mid);
  color: var(--neutral-0);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
```

改為：

```css
.change-card {
  background: var(--color-warning-soft);
  border: 1px solid var(--pt-warning-text);
}
.change-text {
  font-size: 13px;
  color: var(--pt-warning-text-soft);
  margin: 0 0 10px;
  line-height: 1.5;
}
.primary-btn {
  width: 100%;
  padding: 10px;
  background: var(--brand-primary);
  color: var(--neutral-0);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background var(--transition-fast, 0.15s ease);
}
.primary-btn:active {
  background: var(--brand-primary-hover);
}
```

> 改 `--brand-primary` 是因 「開啟訊息聯絡導師」是主要 CTA，用 brand 才符合語意；warning 色只用於 card 自身的「注意感」。

- [ ] **Step 3: 視覺檢查**

```bash
npm run dev
```

打開 `http://localhost:5173/parent.html#/children/1`（需先登入；若無 LIFF dev 環境，跳到 step 4 用 grep + build 替代視覺）。

預期：「資料有誤？」卡片有黃淡底色、橘色邊框、warning 文字色；按鈕為 coral brand 色。

```bash
# 停 dev server
lsof -ti :5173 | xargs kill -9 2>/dev/null
```

- [ ] **Step 4: grep 驗證無 broken CSS / hardcoded hex**

```bash
git grep 'var(--neutral-0)eb' src/parent/
git grep -E '#(fbbf24|78350f|fed7aa|9a3412|fecaca|991b1b)' src/parent/views/ChildProfileView.vue
```

兩條都應為空輸出。

- [ ] **Step 5: build 確認 CSS 無 parse error**

```bash
npm run build
```

**預期：** 無新 warning。

- [ ] **Step 6: Commit**

```bash
git add src/parent/styles/globals.css src/parent/views/ChildProfileView.vue
git commit -m "fix(parent): ChildProfileView 修 broken CSS background + 整頁 token 化

修 .change-card 內 \`background: var(--neutral-0)eb\` 解析失敗（早期 sweep
殘骸，原意為 #fffbeb）→ 改用 var(--color-warning-soft)；
SEVERITY_COLOR 三階改用 --pt-severity-{mild,mod,severe}-{bg,fg}（同 commit
內補入 globals.css light + dark tokens）；
.change-text 用 --pt-warning-text-soft；.primary-btn 由 --pt-warning-text-mid
誤用為主按鈕底色，改用 --brand-primary（CTA 語意正確）。

H1 + M6（ChildProfile 段）"
```

---

## Task 4: 主按鈕 7 處 info-link → brand-primary（H4）

**Files:**
- Modify: `src/parent/views/MedicationListView.vue`
- Modify: `src/parent/views/MedicationDetailView.vue`
- Modify: `src/parent/views/MedicationFormView.vue`
- Modify: `src/parent/views/EventAckView.vue`
- Modify: `src/parent/views/NotificationPrefsView.vue`
- Modify: `src/parent/components/activity/RegistrationStatusList.vue`

### Why

`--pt-info-link`(sky-700) 設計用途為「資訊類連結色」，被誤用成主按鈕底色 7 處。家長進「+ 新增用藥單」「上傳照片」「簽收」「儲存通知偏好」等高頻 CTA 看到藍色，跟首頁/請假/才藝/繳費的 coral CTA 不一致。

### Steps

- [ ] **Step 1: 修 MedicationListView**

`src/parent/views/MedicationListView.vue` `<style scoped>` 區塊：

把：

```css
.new-btn { padding: 8px 14px; background: var(--pt-info-link); color: var(--neutral-0); border: none; border-radius: 6px; font-size: 14px; }
```

改為：

```css
.new-btn { padding: 8px 14px; background: var(--brand-primary); color: var(--neutral-0); border: none; border-radius: 6px; font-size: 14px; transition: background var(--transition-fast, 0.15s ease); }
.new-btn:active { background: var(--brand-primary-hover); }
```

把 `.card.today` 區塊（line 124）：

```css
.card.today { border-color: var(--pt-info-link); box-shadow: 0 1px 4px rgba(44,123,229,.1); }
```

改為：

```css
.card.today { border-color: var(--brand-primary); box-shadow: 0 1px 4px rgba(255, 139, 139, 0.18); }
```

- [ ] **Step 2: 修 MedicationDetailView**

`src/parent/views/MedicationDetailView.vue` `<style scoped>`：

把：

```css
.upload-btn { display: inline-block; padding: 8px 16px; background: var(--pt-info-link); color: var(--neutral-0); border-radius: 6px; cursor: pointer; margin-top: 12px; font-size: 14px; }
```

改為：

```css
.upload-btn { display: inline-block; padding: 8px 16px; background: var(--brand-primary); color: var(--neutral-0); border-radius: 6px; cursor: pointer; margin-top: 12px; font-size: 14px; transition: background var(--transition-fast, 0.15s ease); }
.upload-btn:active { background: var(--brand-primary-hover); }
```

- [ ] **Step 3: 修 MedicationFormView .submit fallback**

`src/parent/views/MedicationFormView.vue` `<style scoped>`：

把：

```css
.submit {
  background: var(--brand-primary, var(--pt-info-link));
  color: var(--neutral-0);
}
```

改為：

```css
.submit {
  background: var(--brand-primary, #FF8B8B);
  color: var(--neutral-0);
}
```

> 第二層 fallback 從 info-link 改為 coral hex；T5 會把 `#3f7d48` 統一改為 `#FF8B8B`，本檔已經沒有綠 fallback，但雙層的內層 fallback 也要改 coral。

- [ ] **Step 4: 修 EventAckView .submit**

`src/parent/views/EventAckView.vue` line 112：

把：

```css
.submit { width: 100%; padding: 12px; background: var(--pt-info-link); color: var(--neutral-0); border: none; border-radius: 6px; font-size: 15px; }
```

改為：

```css
.submit { width: 100%; padding: 12px; background: var(--brand-primary); color: var(--neutral-0); border: none; border-radius: 6px; font-size: 15px; transition: background var(--transition-fast, 0.15s ease); }
.submit:active { background: var(--brand-primary-hover); }
```

- [ ] **Step 5: 移除 NotificationPrefsView 自畫 .back 按鈕**

`src/parent/views/NotificationPrefsView.vue`：

(a) template 內移除 `<button class="back" @click="router.back()">← 返回</button>`（line 66）。

(b) `<style scoped>` 內移除 `.back { ... }`（line 96）。

(c) script setup 內可拿掉 `import { useRouter }` 與 `const router = useRouter()` 若僅給 .back 使用。檢查整檔，若無其他用途則移除。

> AppHeader 已會依 router meta `showBack: true` 顯示返回鈕，view 內這顆是視覺重複。

- [ ] **Step 6: 確認 RegistrationStatusList.vue:91 用途**

打開檔案找 line 91 上下文。判斷：

```bash
sed -n '85,95p' src/parent/components/activity/RegistrationStatusList.vue
```

若是「連結／可點動作」用途，保留 `var(--pt-info-link)` 並在該行末加註解：`/* link 色，保留 info-link */`。

若是「資訊強調」用途（如數字、日期 emphasis），改為 `var(--pt-text-strong)` 或 `var(--brand-primary)`（依語意）。

> 此微決策依 spec §10.1。Plan 階段一致地交給執行者本地判讀；commit message 內附對應 rationale。

- [ ] **Step 7: build 與 grep 驗證**

```bash
npm run build
git grep 'var(--pt-info-link)' src/parent/views/
```

views 目錄內 `var(--pt-info-link)` 仍可能存在的合理位置：
- AttendanceView.vue line 95（事假 chip 是 status 語意，不改）

若除此之外還有 `background: var(--pt-info-link)` 或主按鈕用法，回頭補；其他 `color:` 用法但屬連結 / 資訊請保留並加註解。

- [ ] **Step 8: 跑測試**

```bash
npm run test
```

**預期：** 全綠（NotificationPrefsView 沒測試影響）。

- [ ] **Step 9: Commit**

```bash
git add src/parent/views/MedicationListView.vue src/parent/views/MedicationDetailView.vue src/parent/views/MedicationFormView.vue src/parent/views/EventAckView.vue src/parent/views/NotificationPrefsView.vue src/parent/components/activity/RegistrationStatusList.vue
git commit -m "style(parent): 主按鈕 7 處由 info-link → brand-primary 並移除 NotificationPrefs 自畫返回鈕

--pt-info-link (sky-700) 為連結色，被誤用為主按鈕底 7 處：
- MedicationListView .new-btn / .card.today border
- MedicationDetailView .upload-btn
- MedicationFormView .submit 第二層 fallback
- EventAckView .submit

同時移除 NotificationPrefsView 自畫的 .back（router 已 showBack: true，
AppHeader 提供統一返回鈕）。

RegistrationStatusList.vue:91 依用途個案處理（plan 階段微決策）。

H4"
```

---

## Task 5: `#3f7d48` 綠 fallback → coral fallback（M1）

**Files:**
- Modify: `src/parent/utils/toast.js`
- Modify: `src/parent/components/ConfirmDialog.vue`
- Modify: `src/parent/components/AppHeader.vue`
- Modify: `src/parent/components/PullToRefresh.vue`
- Modify: `src/parent/views/LeavesView.vue`
- Modify: `src/parent/styles/globals.css`（focus outline）

### Why

7 處 `var(--brand-primary, #3f7d48)` 是上次 brand 切換（綠 → 珊瑚）的殘骸。`--brand-primary` 一定有定義，fallback 永遠不觸發，但若有人錯刪 token，落地是綠 — 跟頁面其他 coral 元素混色。統一改為新 brand `#FF8B8B`。

> 例外：`globals.css:118` 的 `#3f7d48` 在註解內描述歷史品牌切換，不動。

### Steps

- [ ] **Step 1: 一次性 sweep**

```bash
cd ~/Desktop/ivy-frontend
# 先看一遍將被改的位置
grep -rn '#3f7d48' src/parent/ --include='*.vue' --include='*.js' --include='*.css' | grep -v '從深綠'
```

預期看到 7 條（按本 task 開頭列出）。

- [ ] **Step 2: 替換**

對下列檔案內每一處 `var(--brand-primary, #3f7d48)`，改為 `var(--brand-primary, #FF8B8B)`：

| 檔案 | 行 |
|---|---|
| `src/parent/utils/toast.js` | 39（success bg fallback）|
| `src/parent/components/ConfirmDialog.vue` | 133 |
| `src/parent/components/AppHeader.vue` | 80（注意是 `var(--pt-gradient-brand, var(--brand-primary, #3f7d48))` — 替換最內層 hex）|
| `src/parent/components/PullToRefresh.vue` | 165 |
| `src/parent/views/LeavesView.vue` | 406 |
| `src/parent/styles/globals.css` | 384（focus outline）|

> AppHeader 是雙層 fallback，內層 hex 換掉就好。

- [ ] **Step 3: grep 確認**

```bash
grep -rn '#3f7d48' src/parent/ --include='*.vue' --include='*.js' --include='*.css' | grep -v '從深綠'
```

**預期：** 空輸出。

- [ ] **Step 4: build**

```bash
npm run build
```

- [ ] **Step 5: 跑測試**

```bash
npm run test
```

**預期：** 全綠。

- [ ] **Step 6: Commit**

```bash
git add src/parent/utils/toast.js src/parent/components/ConfirmDialog.vue src/parent/components/AppHeader.vue src/parent/components/PullToRefresh.vue src/parent/views/LeavesView.vue src/parent/styles/globals.css
git commit -m "style(parent): #3f7d48 綠 fallback → #FF8B8B coral fallback（7 處）

家長 App 已從綠 brand 切到 Sunny Skyline coral，但 7 處 var() fallback
仍是舊綠 hex，token 萬一錯刪會落地綠色與當前 design system 視覺斷裂。
統一改為當前 brand-primary coral hex。

globals.css:118 註解內 #3f7d48 描述歷史品牌切換，保留不動。

M1"
```

---

## Task 6: hardcoded hex sweep + 新增 severity / late tokens（H3, M6 其餘）

**Files:**
- Modify: `src/parent/styles/globals.css`（新增 token，light + dark）
- Modify: `src/parent/views/ContactBookDetailView.vue`
- Modify: `src/parent/views/CalendarView.vue`
- Modify: `src/parent/views/ContactBookView.vue`
- Modify: `src/parent/views/MedicationListView.vue`（status.correction）
- Modify: `src/parent/views/MedicationDetailView.vue`（status.correction）
- Modify: `src/parent/views/EventsView.vue`（ack badge）
- Modify: `src/parent/views/AttendanceView.vue`（遲到色）
- Modify: `src/parent/views/BindView.vue`（漸層）
- Modify: `src/parent/components/ConnectionBanner.vue`（fallback hex）

### Why

清掉 8 個檔內遺留的 hardcoded hex，全部走 design tokens。新增 4 對 severity / late tint tokens（spec §4）。

### Steps

- [ ] **Step 1: 補 `--pt-tint-late` 到 globals.css**

> Severity tokens 已在 T3 加入 globals.css。本 task 只需補 `--pt-tint-late`（給 AttendanceView 遲到 chip 用）。

在 `src/parent/styles/globals.css` 的 `:root` 區塊內（接續 T3 加入的 severity tokens 後）加入：

```css
  /* ============================================================
   * Late chip 專用 tint（與 warning 區隔）
   * ============================================================ */
  --pt-tint-late:    #FFF4C9;  --pt-tint-late-fg: #7A6500;
```

並在 `:root[data-theme='dark']` 區塊（接續 T3 加入的 severity dark 變體後）加入：

```css
  --pt-tint-late: rgba(255, 217, 61, 0.20); --pt-tint-late-fg: #FFE285;
```

- [ ] **Step 3: ContactBookDetailView 整頁 sweep**

`src/parent/views/ContactBookDetailView.vue` `<style scoped>`：

把：

```css
.cell { padding: 8px; background: #f7f9fc; border-radius: 6px; }
...
.link-btn { background: none; border: none; color: #d33; margin-left: 8px; cursor: pointer; }
...
.primary {
  background: #4a90e2;
  color: var(--neutral-0);
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
}
.primary:disabled { background: #aac4e2; }
```

改為：

```css
.cell { padding: 8px; background: var(--pt-surface-mute-soft); border-radius: 6px; }
...
.link-btn { background: none; border: none; color: var(--color-danger); margin-left: 8px; cursor: pointer; }
...
.primary {
  background: var(--brand-primary);
  color: var(--neutral-0);
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  transition: background var(--transition-fast, 0.15s ease);
}
.primary:active { background: var(--brand-primary-hover); }
.primary:disabled { background: var(--brand-primary-soft); color: var(--pt-text-disabled); cursor: not-allowed; }
```

- [ ] **Step 4: CalendarView CATEGORY_META**

`src/parent/views/CalendarView.vue` line 14-23：

把 `contact_book` 與 `leave` 兩條：

```js
  contact_book: { icon: 'notebook', label: '聯絡簿', color: '#0e8e6f' },
  ...
  leave: { icon: 'clipboard', label: '請假', color: '#7c3aed' },
```

改為：

```js
  contact_book: { icon: 'notebook', label: '聯絡簿', color: 'var(--pt-tint-contact-fg)' },
  ...
  leave: { icon: 'clipboard', label: '請假', color: 'var(--pt-tint-event-fg)' },
```

> 註：這兩個 hex 出現在 `:style` 計算屬性內，CSS 計算時 var() 仍會解析，無問題。

把 `.badge`（line 207）：

```css
.badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--color-danger-soft);
  color: #991b1b;
  border-radius: 8px;
  flex-shrink: 0;
}
```

改為：

```css
.badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--color-danger-soft);
  color: var(--color-danger);
  border-radius: 8px;
  flex-shrink: 0;
}
```

- [ ] **Step 5: ContactBookView**

`src/parent/views/ContactBookView.vue` `<style scoped>`：

把：

```css
.today-card { border: 1px solid #cfe6ff; }
...
.dot-unread { background: #ff5252; }
...
.chip {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  background: #f0f4f8;
  color: var(--pt-text-muted);
}
```

改為：

```css
.today-card { border: 1px solid var(--pt-border-strong); }
...
.dot-unread { background: var(--color-danger); }
...
.chip {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--pt-surface-mute);
  color: var(--pt-text-muted);
}
```

- [ ] **Step 6: MedicationListView 與 DetailView correction status**

`src/parent/views/MedicationListView.vue` line 135：

```css
.slot.correction { background: #ede4ff; color: #5a3da5; }
```

改為：

```css
.slot.correction { background: var(--pt-tint-medication); color: var(--pt-violet-text); }
```

`src/parent/views/MedicationDetailView.vue` line 146：

```css
.status.correction { background: #ede4ff; color: #5a3da5; }
```

改為：

```css
.status.correction { background: var(--pt-tint-medication); color: var(--pt-violet-text); }
```

- [ ] **Step 7: AttendanceView 遲到色**

`src/parent/views/AttendanceView.vue` line 96 `statusColor` 內：

```js
遲到: { bg: '#fff8d6', color: '#7a6500' },
```

改為：

```js
遲到: { bg: 'var(--pt-tint-late)', color: 'var(--pt-tint-late-fg)' },
```

- [ ] **Step 8: BindView 漸層**

`src/parent/views/BindView.vue` line 93：

```css
background: linear-gradient(135deg, var(--brand-primary) 0%, #5fa46a 100%);
```

改為：

```css
background: var(--pt-gradient-brand);
```

- [ ] **Step 9: ConnectionBanner fallback hex**

`src/parent/components/ConnectionBanner.vue` line 78-85：

```css
.pt-conn-offline {
  background: var(--pt-tint-money, #fef3c7);
  color: var(--pt-tint-money-fg, #b45309);
}
.pt-conn-ws {
  background: var(--pt-tint-message, #dbeafe);
  color: var(--pt-tint-message-fg, #1d4ed8);
}
```

改為（移除 fallback hex，token 一定有定義）：

```css
.pt-conn-offline {
  background: var(--pt-tint-announcement);
  color: var(--pt-tint-announcement-fg);
}
.pt-conn-ws {
  background: var(--pt-tint-message);
  color: var(--pt-tint-message-fg);
}
```

> 說明：原 offline 用 tint-money(綠)做警示色不對，應該是 warning 暖黃 → 改用 announcement tint（黃色暖警示）；ws 維持 message 藍。

- [ ] **Step 10: EventsView ack badge（已含在 step 4 ContactBook badge 一併處理 → 確認）**

打開 `src/parent/views/EventsView.vue` 找 hex：

```bash
grep -n '#' src/parent/views/EventsView.vue | grep -E '#[0-9a-f]{3,8}'
```

如有 hardcoded hex（如 `#991b1b`）一併替換為 `var(--color-danger)`。

- [ ] **Step 11: build + grep + 測試**

```bash
npm run build
# views 目錄 hex sweep 應接近 0（保留 box-shadow rgba 內 / 註解）
git grep -E '(background|color|border-color):[^;]*#[0-9a-fA-F]{3,8}' src/parent/views/ src/parent/components/ | grep -vE '(rgba|/\*|//)'
```

**預期：** 上面 grep 為空或只剩 spec §3.6 表格未列的合理保留項。

```bash
npm run test
```

- [ ] **Step 12: Commit**

```bash
git add src/parent/styles/globals.css src/parent/views/ContactBookDetailView.vue src/parent/views/CalendarView.vue src/parent/views/ContactBookView.vue src/parent/views/MedicationListView.vue src/parent/views/MedicationDetailView.vue src/parent/views/EventsView.vue src/parent/views/AttendanceView.vue src/parent/views/BindView.vue src/parent/components/ConnectionBanner.vue
git commit -m "style(parent): 8 檔 hardcoded hex sweep + 新增 --pt-tint-late token

- globals.css 新增 --pt-tint-late 與 dark mode 變體（severity tokens 已在
  前一個 commit 加入）
- ContactBookDetail .primary/.cell/.link-btn 由 #4a90e2/#aac4e2/#d33/#f7f9fc → token
- Calendar CATEGORY_META contact_book/leave 與 .badge color 改 token
- ContactBook today-card/dot-unread/chip 改 token
- Medication List/Detail correction status 改 --pt-tint-medication
- Attendance 遲到 chip 改 --pt-tint-late
- Bind 背景漸層由 coral→綠混色改 var(--pt-gradient-brand) 純 brand
- ConnectionBanner offline 由 tint-money(綠) 改 tint-announcement(暖黃) +
  全部 fallback hex 移除（token 必有定義）
- Events ack badge 改 --color-danger

H3, M6（其餘）"
```

---

## Task 7: dark mode 區塊單一化 + useTheme system 顯式 data-theme（H7）

**Files:**
- Modify: `src/parent/composables/useTheme.js`
- Modify: `src/parent/styles/globals.css`
- Create: `tests/unit/parent/composables/useTheme.systemAttribute.test.js`

### Why

globals.css 內 `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) {...} }`（line 211-296）與 `:root[data-theme='dark'] {...}`（line 297-373）定義同一組 token，內容幾乎一字不差。新增 / 修改任何 token 必須同步兩處。改成 useTheme 在 system mode 也顯式設 `data-theme` 屬性，globals.css 只留單一 `[data-theme='dark']` 區塊（業界 Tailwind / shadcn / Radix 模式）。

### Steps

- [ ] **Step 1: 寫 failing test**

建立 `tests/unit/parent/composables/useTheme.systemAttribute.test.js`：

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('useTheme — system mode 顯式設 data-theme', () => {
  let originalMatchMedia

  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
    originalMatchMedia = window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('preference=system + OS prefers dark → data-theme=dark', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true, // OS dark
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    // 動態 import 確保拿到新 module state（避免 module-level singleton 殘留）
    vi.resetModules()
    const { initTheme } = await import('@/parent/composables/useTheme')
    initTheme()

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('preference=system + OS prefers light → data-theme=light', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false, // OS light
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    vi.resetModules()
    const { initTheme } = await import('@/parent/composables/useTheme')
    initTheme()

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('preference=dark 顯式覆寫 OS', async () => {
    localStorage.setItem('parent-theme', 'dark')
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false, // OS light
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    vi.resetModules()
    const { initTheme } = await import('@/parent/composables/useTheme')
    initTheme()

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/composables/useTheme.systemAttribute.test.js
```

**預期：** FAIL — 第一條期待 `'dark'` 拿到 `null`（system 時 useTheme 目前 removeAttribute）。

- [ ] **Step 3: 改 useTheme.js applyToDOM**

`src/parent/composables/useTheme.js` line 34-42：

把：

```js
function applyToDOM(pref) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (pref === 'system') {
    root.removeAttribute('data-theme')
    return
  }
  root.setAttribute('data-theme', pref)
}
```

改為：

```js
function applyToDOM(pref) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const effective =
    pref === 'system' ? (getSystemPrefersDark() ? 'dark' : 'light') : pref
  root.setAttribute('data-theme', effective)
}
```

- [ ] **Step 4: 改 useTheme.js OS 變化監聽**

useTheme.js line 71-85 onMounted 內：

把：

```js
onChange = () => {
  // 觸發 effective recompute（透過 ref 再賦值同值不會 trigger，需用 trick）
  if (preference.value === 'system') {
    // 透過重新賦值同值 + nextTick 強制 effective recompute；
    // 簡單做法：把 ref 設為非自身再設回。
    const v = preference.value
    preference.value = ''
    preference.value = v
  }
}
```

改為：

```js
onChange = () => {
  // OS 偏好變了；若使用者 preference=system，重套 attribute 即可
  if (preference.value === 'system') {
    applyToDOM('system')
  }
}
```

- [ ] **Step 5: 跑單元測試確認通過**

```bash
npx vitest run tests/unit/parent/composables/useTheme.systemAttribute.test.js
```

**預期：** 三條都 PASS。

- [ ] **Step 6: 刪 globals.css `@media (prefers-color-scheme: dark)` 區塊**

`src/parent/styles/globals.css` 內：

刪除整個 line 196-296 區塊（從 `/* ========== 註解 Dark Mode 兩種觸發路徑 ========== */` 開始到 `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { ... } }` 結束）。

註解保留但精簡為：

```css
/* ============================================================
 * Dark Mode
 *
 * 觸發路徑：useTheme composable 永遠顯式設 <html data-theme="light|dark">
 * （system 偏好下也會依 matchMedia 結果寫入），所以 CSS 只需單一
 * [data-theme='dark'] 選擇器，不需 @media (prefers-color-scheme: dark)。
 *
 * 設計原則：
 *  - 不改視覺結構，只覆寫色彩 token；既有元件 scoped style 走 token 即自動切換
 *  - dark surface 用 sky-tinted slate；brand 提亮一階確保對比
 *  - softs（warning-soft / danger-soft 等）改用半透明色，避免光害
 * ============================================================ */
```

並把原 `@media` 區塊刪除。`:root[data-theme='dark']` 區塊保留（注意已包含 T6 加進去的 severity / late dark 變體）。

- [ ] **Step 7: build + 測試**

```bash
npm run build
npm run test
```

**預期：** 全綠。

- [ ] **Step 8: 視覺 smoke test**

```bash
npm run dev
```

到 `http://localhost:5173/parent.html`：
1. 系統設 dark mode → 進入 LoginView 觀察底色
2. 系統設 light mode → 觀察底色
3. （若可進 More 頁）切「強制 dark」→ 觀察

預期：三個情境都能正確切換（Login/Bind 是 public 頁，可不登入直接看）。

```bash
lsof -ti :5173 | xargs kill -9 2>/dev/null
```

- [ ] **Step 9: Commit**

```bash
git add tests/unit/parent/composables/useTheme.systemAttribute.test.js src/parent/composables/useTheme.js src/parent/styles/globals.css
git commit -m "refactor(parent): dark mode 區塊單一化 + useTheme system 模式顯式 data-theme

useTheme.applyToDOM 在 preference=system 時依 matchMedia 結果顯式設
data-theme=light|dark（取代 removeAttribute）；OS 偏好變化 listener 同步
重套 attribute。

副作用：globals.css 內 @media (prefers-color-scheme: dark) 區塊（與
[data-theme='dark'] 完全重複的 token 列表）整塊刪除。新增/修改任何 token
不再需要同步兩處。對齊 Tailwind / shadcn / Radix 業界主流模式。

補單元測試：preference=system + OS dark/light，與 preference=dark 覆寫
OS 三種情境的 data-theme 屬性正確性。

H7"
```

---

## Task 8: 深層頁 router meta.tab 拆除 + catch-all → /home（M9, M8 後續）

**Files:**
- Modify: `src/parent/router.js`
- Create: `tests/unit/parent/router.catchAll.test.js`

### Why

8 條深層路由 (`/leaves /fees /events /events/:eventId/ack /medications /medications/new /medications/:id /activity /calendar /contact-book /contact-book/:entryId /children/:studentId /bind-additional /notifications/preferences`) 寫死 `meta.tab='more'` 或 `'home'`，從首頁 QuickActions 點進去 tab bar 高亮錯誤 tab。spec §3.1 決議拿掉這些 tab metadata，讓 ParentLayout `currentTab=''` → 不高亮（業界 Twitter/X webview 模式）。

catch-all redirect `/login` 對「已登入但 typo URL」使用者不友善 — 改 `/home` + 由 navigation guard 處理未登入轉 login。

### Steps

- [ ] **Step 1: 寫 failing test**

建立 `tests/unit/parent/router.catchAll.test.js`：

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { createRouter, createWebHashHistory } from 'vue-router'

// 直接重建 router 結構測 catch-all redirect target；不引 main.js（避免 pinia 初始化）
function buildRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: '/home' },
      { path: '/login', name: 'parent-login', component: { template: '<div/>' }, meta: { public: true } },
      { path: '/home', name: 'parent-home', component: { template: '<div/>' }, meta: { tab: 'home' } },
      // catch-all 由 plan 改寫
      { path: '/:pathMatch(.*)*', redirect: '/home' },
    ],
  })
}

describe('router catch-all', () => {
  it('未知路徑 → /home（不再導 /login）', async () => {
    const router = buildRouter()
    await router.push('/some-typo-url')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/home')
  })
})

describe('router meta.tab — 深層頁不持續高亮', () => {
  // 此 test 直接讀 routes meta，避免 import 真 router 的 LIFF 副作用
  it('深層頁路由 meta 不含 tab 欄位', async () => {
    // 動態載入真實 router 以拿到完整 routes
    const { default: router } = await import('@/parent/router')
    const routes = router.options.routes

    const deepPaths = [
      '/leaves',
      '/fees',
      '/events',
      '/events/:eventId/ack',
      '/medications',
      '/medications/new',
      '/medications/:id',
      '/activity',
      '/calendar',
      '/contact-book',
      '/contact-book/:entryId',
      '/children/:studentId',
      '/bind-additional',
      '/notifications/preferences',
    ]
    for (const p of deepPaths) {
      const r = routes.find((x) => x.path === p)
      expect(r, `route ${p} not found`).toBeTruthy()
      expect(r.meta?.tab, `${p} 應移除 meta.tab`).toBeUndefined()
    }

    // 主 tab 路由仍保留 tab
    const tabPaths = ['/home', '/attendance', '/announcements', '/messages', '/messages/:threadId', '/more']
    for (const p of tabPaths) {
      const r = routes.find((x) => x.path === p)
      expect(r.meta?.tab, `${p} 應保留 meta.tab`).toBeDefined()
    }
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/router.catchAll.test.js
```

**預期：** 兩個 describe block 都 FAIL（catch-all 目前是 /login；深層頁仍有 meta.tab）。

- [ ] **Step 3: 改 router.js — 移除深層頁 meta.tab**

`src/parent/router.js` 對下列路由的 `meta` 物件移除 `tab` 欄位（保留 `title` 與 `showBack`）：

| 路由 path | 修改 |
|---|---|
| `/leaves` | meta `{ title: '請假', tab: 'more', showBack: true }` → `{ title: '請假', showBack: true }` |
| `/fees` | 同上模式：移除 `tab: 'more'` |
| `/events` | 移除 `tab: 'more'` |
| `/events/:eventId/ack` | 移除 `tab: 'more'` |
| `/medications` | 移除 `tab: 'more'` |
| `/medications/new` | 移除 `tab: 'more'` |
| `/medications/:id` | 移除 `tab: 'more'` |
| `/activity` | 移除 `tab: 'more'` |
| `/bind-additional` | 移除 `tab: 'more'` |
| `/notifications/preferences` | 移除 `tab: 'more'` |
| `/children/:studentId` | 移除 `tab: 'home'` |
| `/calendar` | 移除 `tab: 'home'` |
| `/contact-book` | 移除 `tab: 'home'` |
| `/contact-book/:entryId` | 移除 `tab: 'home'` |

**保留 `tab` 的：** `/home`、`/attendance`、`/announcements`、`/messages`、`/messages/:threadId`、`/more`。

範例（`/leaves`）：

```js
{
  path: '/leaves',
  name: 'parent-leaves',
  component: () => import('./views/LeavesView.vue'),
  meta: { title: '請假', showBack: true },
},
```

- [ ] **Step 4: 改 catch-all redirect**

`src/parent/router.js` line 140-142：

```js
{
  path: '/:pathMatch(.*)*',
  redirect: '/login',
},
```

改為：

```js
{
  path: '/:pathMatch(.*)*',
  redirect: '/home',
},
```

> 未登入使用者打 typo → 進 /home → main.js navigation guard 攔下 → 導 /login（行為等同舊版）。
> 已登入使用者打 typo → 進 /home（合理）。

- [ ] **Step 5: 跑測試確認通過**

```bash
npx vitest run tests/unit/parent/router.catchAll.test.js
```

**預期：** 兩個 describe block 全 PASS。

- [ ] **Step 6: 視覺 smoke test**

```bash
npm run dev
```

打開 `http://localhost:5173/parent.html#/login`（不需登入即能驗證 tab 邏輯，因為 LoginView 是 public + hideTabBar，先觀察）。

實際要驗 tab active 行為需登入後從首頁 QuickActions 點「請假」進入 → 預期看到 tab bar 沒有任何 tab 高亮 → 點 home tab 回首頁。

```bash
lsof -ti :5173 | xargs kill -9 2>/dev/null
```

- [ ] **Step 7: 跑全部測試**

```bash
npm run test
```

**預期：** 全綠（含可能的 ParentLayout 既有測試 — 看是否仍驗證 tab='more' 邏輯，若是要修）。

> 若有測試斷言「進 /leaves 後 currentTab='more'」，更新為斷言 `currentTab=''` 即可（這就是 spec 期待的新行為）。

- [ ] **Step 8: Commit**

```bash
git add src/parent/router.js tests/unit/parent/router.catchAll.test.js
git commit -m "refactor(parent): 深層頁 router meta.tab 拆除 + catch-all redirect /home

14 條深層路由（leaves/fees/events/medications/activity/calendar/contact-book/
children/bind-additional/notifications-preferences）移除 meta.tab，
ParentLayout currentTab='' 不持續高亮原 tab。對齊 Twitter/X 等業界 webview
模式：深層頁有 AppHeader 標題提供導航位置，tab bar 不該誤導。

catch-all redirect /login → /home：已登入 typo 落腳功能首頁；未登入由
navigation guard 接手導 /login，行為等同舊版。

保留 tab 的：home/attendance/announcements/messages/messages-thread/more
（這些是 tab 直接路由 + thread 仍屬 messages 上下文）。

補單元測試覆蓋 catch-all 與 14 條深層路由 meta.tab 缺失。

M9 + M8 後續"
```

---

## Task 9: 小修補（L4 L6 L9 L14 L15）

**Files:**
- Modify: `src/parent/views/AnnouncementsView.vue`（L4 line-clamp）
- Modify: `src/parent/views/MoreView.vue`（L6 add tint）
- Modify: `src/parent/views/MedicationFormView.vue`（L9 useId）
- Modify: `src/parent/styles/globals.css`（L14 stagger 擴充）
- Modify: `src/parent/components/ConnectionBanner.vue`（L15 註解修正）

### Steps

- [ ] **Step 1: L4 — AnnouncementsView preview 改 line-clamp**

`src/parent/views/AnnouncementsView.vue`：

template 內把 line 102：

```html
<div class="preview">
  {{ item.content?.slice(0, 60) }}{{ item.content?.length > 60 ? '...' : '' }}
</div>
```

改為：

```html
<div class="preview">{{ item.content || '' }}</div>
```

`<style scoped>` 的 `.preview` 區塊改為：

```css
.preview {
  margin-top: 6px;
  color: var(--pt-text-soft);
  font-size: 13px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

> 改用 line-clamp 後不分中英字寬，2 行截斷依視覺一致。

- [ ] **Step 2: L6 — MoreView「加綁子女」tint**

`src/parent/views/MoreView.vue` line 42：

```js
{ icon: 'plus', title: '加綁子女', path: '/bind-additional', tint: 'message' },
```

改為：

```js
{ icon: 'plus', title: '加綁子女', path: '/bind-additional', tint: 'activity' },
```

> 暫用 activity tint（grape 紫），與「加新項目」感較貼近。若想加新 tint，留作未來擴充。

- [ ] **Step 3: L9 — MedicationFormView modal id 由寫死改 useId**

`src/parent/views/MedicationFormView.vue` `<script setup>` 開頭加 import：

```js
import { useId } from 'vue'
```

`<script setup>` 內加：

```js
const allergyTitleId = useId()
const allergyDescId = useId()
```

template 內把 line 220-221：

```html
labelled-by="allergy-modal-title"
described-by="allergy-modal-desc"
```

改為：

```html
:labelled-by="allergyTitleId"
:described-by="allergyDescId"
```

並把 line 225 與 229 的 ID 屬性：

```html
<h3 id="allergy-modal-title" class="allergy-title">
...
<p id="allergy-modal-desc">偵測到該藥名與以下過敏原相關：</p>
```

改為：

```html
<h3 :id="allergyTitleId" class="allergy-title">
...
<p :id="allergyDescId">偵測到該藥名與以下過敏原相關：</p>
```

- [ ] **Step 4: L14 — globals.css `.pt-stagger` 延遲擴充**

`src/parent/styles/globals.css` 內 `.pt-stagger` 區塊（line 541-550）：

把：

```css
.pt-stagger > *:nth-child(1) { animation-delay: 0ms; }
.pt-stagger > *:nth-child(2) { animation-delay: 40ms; }
.pt-stagger > *:nth-child(3) { animation-delay: 80ms; }
.pt-stagger > *:nth-child(4) { animation-delay: 120ms; }
.pt-stagger > *:nth-child(5) { animation-delay: 160ms; }
.pt-stagger > *:nth-child(6) { animation-delay: 200ms; }
```

改為：

```css
.pt-stagger > *:nth-child(1) { animation-delay: 0ms; }
.pt-stagger > *:nth-child(2) { animation-delay: 40ms; }
.pt-stagger > *:nth-child(3) { animation-delay: 80ms; }
.pt-stagger > *:nth-child(4) { animation-delay: 120ms; }
.pt-stagger > *:nth-child(5) { animation-delay: 160ms; }
.pt-stagger > *:nth-child(6) { animation-delay: 200ms; }
.pt-stagger > *:nth-child(7) { animation-delay: 240ms; }
.pt-stagger > *:nth-child(8) { animation-delay: 280ms; }
/* 第 9 起固定 280ms 不再遞增（避免長列表進場拖很久） */
.pt-stagger > *:nth-child(n+9) { animation-delay: 280ms; }
```

- [ ] **Step 5: L15 — ConnectionBanner 註解修正**

`src/parent/components/ConnectionBanner.vue` line 4-7：

把：

```js
/**
 * 家長端連線狀態 banner。
 * - 離線：橘色「目前離線，部分功能受限」
 * - WS 斷線（online 但 wsConnected=false 超過 delay）：淺灰「即時通知暫停，正在重連...」
 */
```

改為：

```js
/**
 * 家長端連線狀態 banner。
 * - 離線：暖黃 announcement tint「目前離線，部分功能受限」
 * - WS 斷線（online 但 wsConnected=false 超過 delay）：淺藍 message tint「即時通知暫停，正在重連...」
 */
```

> 註解描述對齊 T6 改完的實際視覺。

- [ ] **Step 6: build + 測試**

```bash
npm run build
npm run test
```

- [ ] **Step 7: Commit**

```bash
git add src/parent/views/AnnouncementsView.vue src/parent/views/MoreView.vue src/parent/views/MedicationFormView.vue src/parent/styles/globals.css src/parent/components/ConnectionBanner.vue
git commit -m "style(parent): 小修補（L4 L6 L9 L14 L15）

- AnnouncementsView preview 改 -webkit-line-clamp，不分中英字寬截 2 行
- MoreView「加綁子女」tint 由 message(綠) 改 activity(紫) 較貼近「新增」語意
- MedicationFormView allergy modal labelled-by / described-by 由寫死 ID
  改用 useId() 確保多 modal 同頁不衝突
- globals.css .pt-stagger 子層延遲擴充至 nth-child(8)，第 9 起固定 280ms
- ConnectionBanner 註解描述（橘色/淺灰）對齊 T6 後實際視覺（暖黃/淺藍）"
```

---

## Task 10: parent:audit npm script + grep 防回歸

**Files:**
- Create: `scripts/parent-audit-grep.sh`
- Modify: `package.json`

### Why

防止後續開發再次塞回 `#3f7d48` 綠 fallback、`var(--pt-info-link)` 主按鈕、或 hex 直接寫 `background:`。CI 跑這條 grep，發現即紅燈。

### Steps

- [ ] **Step 1: 建立 grep 腳本**

建立 `scripts/parent-audit-grep.sh`：

```sh
#!/usr/bin/env bash
# 家長端視覺一致性防回歸 grep
#
# 失敗條件：
# 1. parent/ 內出現 #3f7d48 綠 fallback（僅 globals.css 註解放行）
# 2. parent/ 內主按鈕 background: var(--pt-info-link)（連結 color 用法保留）
# 3. parent/ views / components 內出現 background: #xxxxxx 或 color: #xxxxxx 直寫 hex
#    （rgba 內、box-shadow 內、註解內放行）

set -e

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

FAIL=0

# 1. 綠 fallback
GREEN=$(git grep -nE '#3f7d48' src/parent/ -- ':!src/parent/styles/globals.css' || true)
if [ -n "$GREEN" ]; then
  echo "❌ 找到 #3f7d48 綠 fallback 殘骸："
  echo "$GREEN"
  FAIL=1
fi

# 2. info-link 主按鈕
INFO_BTN=$(git grep -nE 'background:[^;]*var\(--pt-info-link' src/parent/ || true)
if [ -n "$INFO_BTN" ]; then
  echo "❌ 找到主按鈕誤用 --pt-info-link（連結 color 用法不會被 grep 抓到）："
  echo "$INFO_BTN"
  FAIL=1
fi

# 3. 直寫 hex 在 background / color / border-color
DIRECT_HEX=$(git grep -nE '(background|color|border-color):[[:space:]]*#[0-9a-fA-F]{3,8}\b' src/parent/views/ src/parent/components/ \
  | grep -vE '/\*|//|rgba\(' \
  || true)
if [ -n "$DIRECT_HEX" ]; then
  echo "❌ 找到直寫 hex（應改用 design tokens）："
  echo "$DIRECT_HEX"
  FAIL=1
fi

if [ $FAIL -eq 1 ]; then
  echo ""
  echo "請參考 docs/superpowers/specs/2026-05-06-parent-portal-consistency-design.md §3"
  exit 1
fi

echo "✅ parent audit grep 通過"
```

加可執行：

```bash
chmod +x scripts/parent-audit-grep.sh
```

- [ ] **Step 2: 補 npm script**

`package.json` 在 `"scripts"` 區塊新增：

```json
"parent:audit": "bash scripts/parent-audit-grep.sh"
```

- [ ] **Step 3: 跑一次確認綠**

```bash
npm run parent:audit
```

**預期：** 印出 `✅ parent audit grep 通過`。

> 若紅，回前面 task 補相應修補。

- [ ] **Step 4: Commit**

```bash
git add scripts/parent-audit-grep.sh package.json
git commit -m "test(parent): parent:audit npm script + 三條 grep 防回歸

- 偵測 #3f7d48 綠 fallback 殘骸
- 偵測 background: var(--pt-info-link) 主按鈕誤用
- 偵測 background/color/border-color 直寫 hex（rgba 與註解放行）

CI 紅燈防止本 slice 修補的視覺一致性債再次累積。"
```

---

## 終局驗證（送 PR 前）

- [ ] **執行完整測試**

```bash
npm run test
npm run build
npm run parent:audit
```

三者都要綠。

- [ ] **檢查 commit 數量**

```bash
git log --oneline main..feat/parent-portal-consistency-v1
```

預期 10 個 commit（依 spec §6 順序）。

- [ ] **檢查 DoD（spec §9）**

對照 spec 的 DoD 清單逐條打勾：

- [ ] 22 個 view 內 `git grep '#3f7d48'` 為 0（globals.css 註解除外）
- [ ] 22 個 view 內主要按鈕無 `var(--pt-info-link)` background 用法
- [ ] HomeView pull-to-refresh 點下去 today status 卡片重抓（測試已驗）
- [ ] ContactBookDetail 刪除回覆按下後出現 ConfirmDialog（測試已驗）
- [ ] ChildProfileView「資料有誤？」卡片有 warning-tinted 背景（手動驗）
- [ ] globals.css 內 `@media (prefers-color-scheme: dark)` 區塊已刪除
- [ ] router.js 內 14 條深層路由的 `meta` 沒有 `tab` 欄位
- [ ] catch-all redirect 為 `/home`
- [ ] `npm run test` 全綠
- [ ] `npm run build` 無 warning increase
- [ ] PR description 含 audit findings × commit 對應表

- [ ] **建 PR**

```bash
git push -u origin feat/parent-portal-consistency-v1
gh pr create --title "feat(parent): 一致性收斂 + 守衛強化（P1+P6 合併）" --body "$(cat <<'EOF'
## Summary

家長端 design system 覆蓋面拉滿、修兩條 silent bug、補一條破壞性操作守衛、
清品牌切換殘骸與 dark mode 雙寫債。

依據 audit `docs/superpowers/audits/2026-05-06-parent-portal-ux-audit.md`
與 spec `docs/superpowers/specs/2026-05-06-parent-portal-consistency-design.md`。

## Findings × Commits 對應表

| Commit | Audit IDs | 一句話 |
|---|---|---|
| 1 | H2 | HomeView pullRefresh 修 refreshToday undefined |
| 2 | H5 | ContactBookDetail 刪除回覆補 ConfirmDialog |
| 3 | H1, M6 partial | ChildProfileView 修 broken CSS + 整頁 token |
| 4 | H4 | 主按鈕 7 處 info-link → brand-primary |
| 5 | M1 | #3f7d48 綠 fallback → coral fallback（7 處） |
| 6 | H3, M6 rest | 8 檔 hex sweep + 新增 --pt-tint-late token |
| 7 | H7 | dark mode 區塊單一化 + useTheme 顯式 attribute |
| 8 | M9, M8 後續 | 深層頁 meta.tab 拆除 + catch-all → /home |
| 9 | L4 L6 L9 L14 L15 | 小修補 |
| 10 | (5.3) | parent:audit grep 防回歸 script |

## Test plan

- [ ] `npm run test` 全綠（含 4 條新測試）
- [ ] `npm run build` 無新 warning
- [ ] `npm run parent:audit` 綠
- [ ] HomeView 下拉刷新觀察今日狀態實際更新
- [ ] ContactBookDetail 刪除回覆出現 ConfirmDialog
- [ ] ChildProfileView「資料有誤？」卡片黃淡底色顯著
- [ ] LIFF 環境內 dark/light/system 三模式都正確切換
- [ ] 從首頁 QuickActions 點「請假」進入後 tab bar 無任何 tab 高亮
- [ ] 打 typo URL（如 `#/foo`）已登入導 /home，未登入 guard 導 /login

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of Scope（明確 NOT 動）

- H6 MedicationFormView 風格對齊（拆 sub-components / BottomSheet 化）→ P3
- M2/M3/M4/M5/M7/M10/M11/M12/M13/M14/M15/M16/M17/M19/M20、L1/L2/L3/L5/L7/L8/L10/L11/L12/L13/L16/L17 → P2/P3/P4/P5
- 任何後端改動

如過程中發現 spec 漏項，請開新的 follow-up issue / commit，不要在本 PR 內擴張範圍。
