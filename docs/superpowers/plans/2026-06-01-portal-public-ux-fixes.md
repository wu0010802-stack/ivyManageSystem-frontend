# Portal / Public UX 小修批次 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 2026-06-01 UX audit 选出的 4 处低风险前端项：公开页过期 fallback、报名课程必选常驻引导、点名页冗余按钮、教师端命名一致性。

**Architecture:** 纯前端、无 schema/API 变动。A 把会过期的 fallback 常数清掉、唯一有逻辑的 formCardTitle 拼接抽成可测纯函数；B 改 CoursePickerSection 的 step 说明文案；C1/C2 移除按钮 + 改命名字符串。

**Tech Stack:** Vue 3 `<script setup lang="ts">` + Vite + Vitest + @vue/test-utils；vue-tsc typecheck。

**Worktree:** `ivy-frontend/.claude/worktrees/portal-public-ux-fixes-2026-06-01`（分支 `feat/portal-public-ux-fixes-2026-06-01-frontend`，base origin/main `0d493e32`）。**所有命令在此 worktree 内执行**（用 `git -C <worktree>` 或先 `cd <worktree>`）。

---

## Task 0: Worktree 依赖安装（一次性）

**Files:** 无（环境准备）

- [ ] **Step 1: 安装依赖**

git worktree 不复制 `node_modules`，需在 worktree 内单独安装。

Run（在 worktree 根）: `npm ci`
Expected: 安装完成，无 error。（若 `npm ci` 因 lockfile 慢/失败可改 `npm install`）

- [ ] **Step 2: 确认基线 typecheck + 测试绿**

Run: `npm run typecheck`
Expected: 0 error。

Run: `npx vitest run`
Expected: 全绿（记下既有 pass 数作为回归基线）。

---

## Task 1: A — 公开页过期 fallback

**Files:**
- Create: `src/utils/activityDisplay.ts`
- Create: `src/utils/__tests__/activityDisplay.test.ts`
- Modify: `src/views/public/ActivityPublicView.vue`（computed :488-496 + 模板 :64）

- [ ] **Step 1: 写 buildFormCardTitle 的失败测试**

Create `src/utils/__tests__/activityDisplay.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildFormCardTitle } from '../activityDisplay'

describe('buildFormCardTitle', () => {
  it('有活動日期時，主標題（去｜副標）後接「· 日期」', () => {
    expect(buildFormCardTitle('114 下藝童趣｜課後才藝報名', '2026-02-23')).toBe(
      '114 下藝童趣 · 2026-02-23',
    )
  })

  it('無活動日期時，不留尾部「 · 」', () => {
    expect(buildFormCardTitle('課後才藝報名', '')).toBe('課後才藝報名')
  })

  it('title 為空字串時不報错，回傳空字串', () => {
    expect(buildFormCardTitle('', '')).toBe('')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/utils/__tests__/activityDisplay.test.ts`
Expected: FAIL — 找不到 `../activityDisplay` 模块。

- [ ] **Step 3: 建 buildFormCardTitle 纯函数**

Create `src/utils/activityDisplay.ts`:

```ts
/**
 * 公開報名頁表單卡片標題組裝。
 * 規則：取主標題（去掉「｜」後的副標），僅在有活動日期時接「 · 日期」，
 * 避免後端未提供 event_date_label 時殘留尾部「 · 」。
 */
export function buildFormCardTitle(rawTitle: string, eventDate: string): string {
  const base = (rawTitle || '').split('｜')[0]
  return eventDate ? `${base} · ${eventDate}` : base
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/utils/__tests__/activityDisplay.test.ts`
Expected: PASS（3 cases）。

- [ ] **Step 5: 改 ActivityPublicView 的 fallback 常数 + formCardTitle + 模板 v-if**

在 `src/views/public/ActivityPublicView.vue` 的 `<script setup>` 顶部 import 区加入：

```ts
import { buildFormCardTitle } from '@/utils/activityDisplay'
```

将 :488-496 这段：

```ts
const displayTitle = computed(() => timeInfoExt.value?.page_title?.trim() || '114 下藝童趣｜課後才藝報名')
const displayTermLabel = computed(() => timeInfoExt.value?.term_label?.trim() || '114 下學期')
const displayEventDate = computed(() => timeInfoExt.value?.event_date_label?.trim() || '2026-02-23')
const displayAudience = computed(() => timeInfoExt.value?.target_audience?.trim() || '本園在學幼兒')
const displayFormCardTitle = computed(() => {
  const custom = timeInfoExt.value?.form_card_title?.trim()
  if (custom) return custom
  return `${displayTitle.value.split('｜')[0]} · ${displayEventDate.value}`
})
```

改为（去除会过期的 title/term/date 硬编码；audience 保留——「本園在學幼兒」不随时间过期）：

```ts
const displayTitle = computed(() => timeInfoExt.value?.page_title?.trim() || '課後才藝報名')
const displayTermLabel = computed(() => timeInfoExt.value?.term_label?.trim() || '')
const displayEventDate = computed(() => timeInfoExt.value?.event_date_label?.trim() || '')
const displayAudience = computed(() => timeInfoExt.value?.target_audience?.trim() || '本園在學幼兒')
const displayFormCardTitle = computed(() => {
  const custom = timeInfoExt.value?.form_card_title?.trim()
  if (custom) return custom
  return buildFormCardTitle(displayTitle.value, displayEventDate.value)
})
```

将模板 :64（学期标签）：

```html
<span class="page-meta-term">{{ displayTermLabel }}</span>
```

改为（缺值时隐藏，与 :65 日期、:69 招生对象同样用 v-if）：

```html
<span v-if="displayTermLabel" class="page-meta-term">{{ displayTermLabel }}</span>
```

- [ ] **Step 6: typecheck + 全测试回归**

Run: `npm run typecheck`
Expected: 0 error。

Run: `npx vitest run`
Expected: 全绿（既有数 + 新 activityDisplay 3 cases）。

- [ ] **Step 7: Commit**

```bash
git add src/utils/activityDisplay.ts src/utils/__tests__/activityDisplay.test.ts src/views/public/ActivityPublicView.vue
git commit -m "fix(public): 移除報名頁會過期的 fallback 文案

後端未回傳客製欄位時，原 fallback 寫死過去的日期/學期（'2026-02-23'/
'114 下學期'），會在頁面渲染過期活動。改為：缺值則隱藏日期/學期行、
標題兜底改中性「課後才藝報名」；formCardTitle 抽純函式避免尾部殘留「 · 」。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: B — 报名课程区常驻「必選」引导

**Files:**
- Create: `src/views/public/components/__tests__/CoursePickerSection.test.ts`
- Modify: `src/views/public/components/CoursePickerSection.vue:111`

- [ ] **Step 1: 写 CoursePickerSection 的失败测试**

Create `src/views/public/components/__tests__/CoursePickerSection.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CoursePickerSection from '../CoursePickerSection.vue'

const baseProps = {
  courses: [],
  selectedCourses: [],
  availabilityState: () => ({ text: '', cssClass: '', full: false }),
  formatSchedule: () => '',
  courseAdvisory: () => [],
}

describe('CoursePickerSection', () => {
  it('Step 2 說明文常駐顯示「必選」引導（不需送出即可見）', () => {
    const wrapper = mount(CoursePickerSection, { props: baseProps })
    expect(wrapper.find('.step-desc').text()).toContain('必選')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/views/public/components/__tests__/CoursePickerSection.test.ts`
Expected: FAIL — 现 `.step-desc` 文字为「可複選；剩餘名額即時顯示」，不含「必選」。

- [ ] **Step 3: 改 step-desc 加常驻必选引导**

在 `src/views/public/components/CoursePickerSection.vue:111`，将：

```html
      <span class="step-desc">可複選；剩餘名額即時顯示</span>
```

改为（与 Step 3「選填；…」对称，明示必填）：

```html
      <span class="step-desc">必選，至少一門；可複選、剩餘名額即時顯示</span>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/views/public/components/__tests__/CoursePickerSection.test.ts`
Expected: PASS。

- [ ] **Step 5: typecheck + 全测试回归**

Run: `npm run typecheck`
Expected: 0 error。

Run: `npx vitest run`
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add src/views/public/components/CoursePickerSection.vue src/views/public/components/__tests__/CoursePickerSection.test.ts
git commit -m "feat(public): 報名頁課程區常駐必選引導

原「至少選一門」僅在送出後才紅字提示。Step 2 說明文加常駐「必選，至少一門」，
與 Step 3「選填」對稱，家長報名時即知課程必填，減少送出被擋的往返。
不改 validateForm/紅字校驗邏輯。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: C1 — 移除点名页冗余「載入」按钮

**Files:**
- Modify: `src/views/portal/PortalStudentAttendanceView.vue:310`

- [ ] **Step 1: 移除按钮**

在 `src/views/portal/PortalStudentAttendanceView.vue`，删除 :310 这一行：

```html
          <el-button type="primary" @click="fetchDailyAttendance">載入</el-button>
```

`daily-filters` 区保留日期 picker（:303-309）。watcher（:230-232 `watch([classroomId, dailyDate])`）已在班级/日期变更时自动 `fetchDailyAttendance`，不依赖此按钮。

- [ ] **Step 2: 确认 fetchDailyAttendance 仍被引用（避免变成未使用而 typecheck 报错）**

Run: `grep -n 'fetchDailyAttendance' src/views/portal/PortalStudentAttendanceView.vue`
Expected: 仍有 watcher / 其他 caller 引用（非仅被删除的按钮）。若删除后 `fetchDailyAttendance` 完全无引用，需保留 watcher 引用即可——确认 watcher 仍调用它。

- [ ] **Step 3: typecheck + 全测试回归**

Run: `npm run typecheck`
Expected: 0 error（无 `noUnusedLocals` 报 `fetchDailyAttendance` 未使用）。

Run: `npx vitest run`
Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
git add src/views/portal/PortalStudentAttendanceView.vue
git commit -m "refactor(portal): 移除點名頁冗餘「載入」按鈕

watcher 已在班級/日期變更時自動載入當日點名，此按鈕多餘且易讓使用者
誤以為需手動點才會載入。移除後切換日期/班級仍自動抓取。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: C2 — 教师端命名一致性

**Files:**
- Modify: `src/router/index.ts:447`
- Modify: `src/views/portal/PortalAttendanceView.vue:167`

- [ ] **Step 1: class-hub route title 对齐侧栏**

在 `src/router/index.ts:447`，将：

```ts
                    meta: { title: '今日工作台' },
```

改为（与侧栏 `PortalLayout.vue:408`「今日班級工作台」一致，消除与 `/portal/home`「今日工作台」撞名）：

```ts
                    meta: { title: '今日班級工作台' },
```

- [ ] **Step 2: 出勤页表头对齐侧栏 label**

在 `src/views/portal/PortalAttendanceView.vue:167`，将：

```html
        <h2>出勤紀錄表</h2>
```

改为（与侧栏 `PortalLayout.vue:360`「我的出勤」一致）：

```html
        <h2>我的出勤</h2>
```

- [ ] **Step 3: 确认无其他硬编码引用旧文案的断言**

Run: `grep -rn '出勤紀錄表' src/ | grep -v node_modules`
Expected: 无残留引用（若有测试断言旧文案需同步更新）。

Run: `grep -rn "title: '今日工作台'" src/router/index.ts`
Expected: 仅剩 `/portal/home` 那一处（class-hub 已改）。

- [ ] **Step 4: typecheck + 全测试回归**

Run: `npm run typecheck`
Expected: 0 error。

Run: `npx vitest run`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/router/index.ts src/views/portal/PortalAttendanceView.vue
git commit -m "fix(portal): 統一今日工作台/出勤命名

class-hub 的 route title 與側欄「今日班級工作台」不一致且與 /home
「今日工作台」撞名，改為對齊側欄；出勤頁表頭「出勤紀錄表」與側欄入口
「我的出勤」不一致，統一為「我的出勤」。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 最终验收（所有 task 完成后）

- [ ] **typecheck 0 error**：`npm run typecheck`
- [ ] **vitest 全绿、无新增 fail**：`npx vitest run`（相对 Task 0 基线）
- [ ] **build 通过**：`npm run build`
- [ ] **手测清单**（需起 dev server）：
  1. 公开页后端无客制字段 → 不显示过期日期/学期、h1 显示「課後才藝報名」、表单卡片标题无尾部 ` · `
  2. 公开页 Step 2 可见「必選，至少一門」引导
  3. 点名页切日期/班级自动载入、无「載入」按钮
  4. 教师端：class-hub 标题「今日班級工作台」、出勤页表头「我的出勤」与侧栏一致
- [ ] 4 个 commit 分项清晰，分支 `feat/portal-public-ux-fixes-2026-06-01-frontend`

## 风险

低。纯前端、无 schema/API。A 仅在后端漏给客制字段时改变渲染（边缘）；C1/C2 为移除/字符串。门槛 typecheck + vitest 无回归。
