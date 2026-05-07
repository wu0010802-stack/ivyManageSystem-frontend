# 教師端 Portal 大 polish — Phase 3 實作計畫（簡化版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 修補後端 contact_book photos N+1（30 student × 1 photos query → 1 batch query）與 409 衝突 payload；前端 PortalContactBookView 從 890 行拆為 ~280 行 + 5 子元件、改樂觀更新、套 LazyImage。

**Architecture:** 後端純 N+1 修補 + 衝突 payload schema 擴充；前端純拆元件 + 樂觀更新。前後端各一條 branch，後端先 merge。

**Tech Stack:** FastAPI / SQLAlchemy 2.x（後端）；Vue 3 + `<script setup>` / Element Plus / Vitest（前端）

**Spec:** `docs/superpowers/specs/2026-05-06-teacher-portal-acd-phase-3-design.md`

**Branches:**
- 後端：`feat/teacher-acd-v1-3-contact-book-be` from `ivy-backend` `origin/main`
- 前端：`feat/teacher-acd-v1-3-contact-book` from `feat/teacher-acd-v1-2-home-dashboard`

---

# 後端 — Phase 3B

**Worktree**：`/Users/yilunwu/Desktop/ivy-backend/.worktrees/teacher-acd-3-be`

---

### Task 3B.1: 開後端 worktree + baseline

- [ ] **Step 1: 確認 ivy-backend 狀態**

```bash
cd /Users/yilunwu/Desktop/ivy-backend && git status -sb | head -3
```

- [ ] **Step 2: 開 worktree**

```bash
cd /Users/yilunwu/Desktop/ivy-backend
git fetch origin main
git worktree add .worktrees/teacher-acd-3-be -b feat/teacher-acd-v1-3-contact-book-be origin/main
cd .worktrees/teacher-acd-3-be
pip install -r requirements.txt 2>&1 | tail -3
```

- [ ] **Step 3: Baseline**

```bash
python3 -m pytest tests/ -k "contact_book or contactbook" --tb=no -q 2>&1 | tail -10
```

記下既有 contact_book 相關 test 數。

---

### Task 3B.2: 寫 N+1 regression test (failing)

**Files:** Modify: `tests/test_portal_contact_book.py`（如不存在則 grep 找：可能叫 `tests/test_contact_book*.py`）

- [ ] **Step 1: 找既有測試檔**

```bash
find tests -name "*contact*" -o -name "*portfolio*" 2>/dev/null | head -10
grep -rln "compute_class_completion\|_load_photos\|/portal/contact-book" tests/ 2>/dev/null | head -5
```

決定加在哪一個既有檔（`test_portal_contact_book.py` 或類似），或新建。

- [ ] **Step 2: 加 query count test**

加在既有 contact_book 測試檔末尾：

```python
class TestContactBookListQueryCount:
    def test_list_endpoint_under_baseline(self, contact_book_client):
        """30 student class，list endpoint 不應 N+1：baseline ~35-40 → ≤ 8。"""
        from tests.conftest import QueryCounter

        client, sf = contact_book_client  # 沿用既有 fixture pattern
        seed = _seed_class_with_n_students(sf, n=30)  # 仿既有 seed helper
        tk = _token(seed)
        engine = sf.kw["bind"] if hasattr(sf, "kw") else sf().get_bind()

        with QueryCounter(engine) as counter:
            rsp = client.get(
                f"/api/portal/contact-book"
                f"?classroom_id={seed['classroom_id']}&log_date={date.today().isoformat()}",
                cookies={"access_token": tk},
            )

        assert rsp.status_code == 200
        assert counter.count <= 8, (
            f"query count regressed: {counter.count} (baseline ~35-40, target ≤ 8). "
            f"Last 5: {counter.statements[-5:]}"
        )
```

實際 fixture 名稱（`contact_book_client` / `_seed_class_with_n_students` / `_token`）以該檔既有為準。如該檔沒有 `n students` helper，仿 `test_portal_home.py` 的 `_seed_teacher_with_n_classrooms` pattern 寫一個。

- [ ] **Step 3: 跑確認 fail**

```bash
python3 -m pytest tests/<該檔>::TestContactBookListQueryCount -v 2>&1 | tail -10
```

Expected：FAIL，message 含實際 query count > 8。

- [ ] **Step 4: Commit failing test**

```bash
git add tests/<該檔>
git commit -m "$(cat <<'EOF'
test(portal-contact-book): list endpoint photos N+1 regression test (failing)

30 student 班級 list endpoint baseline ~35-40 query；目標 ≤ 8。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3B.3: 修 list endpoint photos N+1

**Files:**
- Modify: `api/portal/contact_book.py`

- [ ] **Step 1: Read 既有 _load_photos 與 list endpoint loop**

```bash
sed -n '149,250p' api/portal/contact_book.py
```

確認：
- `_load_photos(session, entry_id)` 函式 signature
- list endpoint 內 `entries = ...query()` + `for s in roster: photos = _load_photos(...)` 結構

- [ ] **Step 2: Refactor list endpoint loop**

把 `for s in roster: photos = _load_photos(session, entry.id) if entry else []` 改為：

```python
        entries = (
            session.query(StudentContactBookEntry)
            .filter(
                StudentContactBookEntry.classroom_id == classroom_id,
                StudentContactBookEntry.log_date == log_date,
                StudentContactBookEntry.deleted_at.is_(None),
            )
            .all()
        )
        entry_by_student = {e.student_id: e for e in entries}

        # batch 一次取所有 entries 的 photos
        entry_ids = [e.id for e in entries]
        photos_by_entry: dict[int, list] = {eid: [] for eid in entry_ids}
        if entry_ids:
            atts = (
                session.query(Attachment)
                .filter(
                    Attachment.owner_type == ATTACHMENT_OWNER_CONTACT_BOOK,
                    Attachment.owner_id.in_(entry_ids),
                    Attachment.deleted_at.is_(None),
                )
                .order_by(Attachment.created_at.asc())
                .all()
            )
            for a in atts:
                photos_by_entry.setdefault(a.owner_id, []).append(a)

        items = []
        for s in roster:
            entry = entry_by_student.get(s.id)
            photos = photos_by_entry.get(entry.id, []) if entry else []
            items.append(
                {
                    "student_id": s.id,
                    "student_name": s.name,
                    "entry": _entry_to_dict(entry, photos) if entry else None,
                }
            )
```

`_load_photos` 函式保留（PUT/POST 等其他 endpoint 仍用），只是 list endpoint 改用 batch。

- [ ] **Step 3: 跑 query count test 應 pass + 既有 contact_book test 應綠**

```bash
python3 -m pytest tests/<該檔>::TestContactBookListQueryCount -v 2>&1 | tail -10
python3 -m pytest tests/ -k "contact_book or contactbook" --tb=line 2>&1 | tail -15
```

Expected：query count test 綠 + 原既有 test 全綠。

- [ ] **Step 4: Commit**

```bash
git add api/portal/contact_book.py
git commit -m "$(cat <<'EOF'
refactor(portal-contact-book): list endpoint photos N+1 修補

把 _load_photos 從每 entry 一次 query 改為列表前一次 IN clause batch：
- entries 取出後 entry_ids = [e.id for e in entries]
- 一次 query 取所有 attachments WHERE owner_id IN (...)
- dict[entry_id, list[Attachment]] lookup

效能：30 student baseline ~35-40 query → 5-7 query。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3B.4: 409 衝突 payload 擴充

**Files:**
- Modify: `api/portal/contact_book.py`（`updateEntry` 或對應的 PUT endpoint）
- Modify: 對應測試檔

- [ ] **Step 1: 找 PUT/updateEntry 衝突邏輯位置**

```bash
grep -n "409\|HTTPException.*conflict\|If-Match\|version.*mismatch" api/portal/contact_book.py | head
```

- [ ] **Step 2: 改衝突 response payload**

把既有：

```python
raise HTTPException(status_code=409, detail="版本衝突，請重新整理")
```

改為：

```python
# 衝突：回 409 + 完整 current_entry payload，前端可局部 refetch
current_photos = _load_photos(session, entry.id)
raise HTTPException(
    status_code=409,
    detail={
        "message": "版本衝突，請重新整理",
        "current_entry": _entry_to_dict(entry, current_photos),
    },
)
```

- [ ] **Step 3: 寫衝突 payload schema test**

加在 contact_book 測試檔末尾：

```python
class TestUpdateEntryConflict:
    def test_409_returns_current_entry_in_detail(self, contact_book_client):
        """版本衝突時，response.detail 應含 current_entry 完整 dict。"""
        client, sf = contact_book_client
        seed = _seed_class_with_n_students(sf, n=1)
        # 建一個 entry，version=1
        entry = _create_entry(sf, seed, version=1, fields={"mood": "happy"})
        tk = _token(seed)

        # 用過期 version 嘗試更新 → 應 409
        rsp = client.put(
            f"/api/portal/contact-book/{entry.id}",
            json={"mood": "sad"},
            headers={"If-Match": "0"},  # 過期
            cookies={"access_token": tk},
        )
        assert rsp.status_code == 409
        body = rsp.json()
        # detail 是 dict (FastAPI 會把 dict detail 整個當 detail 回)
        detail = body["detail"]
        assert isinstance(detail, dict)
        assert "current_entry" in detail
        assert detail["current_entry"]["id"] == entry.id
        assert detail["current_entry"]["mood"] == "happy"  # 仍是舊值
```

實際 `_create_entry` helper 與 If-Match 機制以該檔既有為準。

- [ ] **Step 4: 跑 conflict test 確認綠**

```bash
python3 -m pytest tests/<該檔>::TestUpdateEntryConflict -v 2>&1 | tail -10
```

- [ ] **Step 5: 跑全 contact_book test 確認沒打壞**

```bash
python3 -m pytest tests/ -k "contact_book or contactbook" --tb=line 2>&1 | tail -15
```

- [ ] **Step 6: Commit**

```bash
git add api/portal/contact_book.py tests/<該檔>
git commit -m "$(cat <<'EOF'
feat(portal-contact-book): 409 衝突 response 含 current_entry payload

讓前端衝突時可直接從 response.detail.current_entry 局部寫回，
不必再額外 GET 整份 list。

status code 保留 409（不改 412 避免 breaking change）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3B.5: 全 pytest 確認 + 後端 phase 3B 收尾

- [ ] **Step 1: 跑全 pytest**

```bash
python3 -m pytest --tb=no -q 2>&1 | tail -10
```

Expected：原 4 個 main 既有 fail 仍 fail（不關本 phase）；其他全綠。

- [ ] **Step 2: 看 commit 歷史**

```bash
git log --oneline origin/main..
```

Expected：3 commits（failing test / N+1 fix / conflict payload）。

- [ ] **Step 3: 後端 phase 3B 完成；push 留用戶批准**

不主動 push。等用戶決定統一 push 順序。

---

# 前端 — Phase 3F

**Worktree**：複用 `/Users/yilunwu/Desktop/ivy-frontend/.worktrees/teacher-acd-1`

---

### Task 3F.1: 開前端 phase-3 branch + commit spec/plan

- [ ] **Step 1: 切 branch**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/teacher-acd-1
git status -sb | head -3
git checkout -b feat/teacher-acd-v1-3-contact-book
```

- [ ] **Step 2: Commit spec + plan**

```bash
git add docs/superpowers/specs/2026-05-06-teacher-portal-acd-phase-3-design.md docs/superpowers/plans/2026-05-06-teacher-portal-acd-phase-3.md
git commit -m "$(cat <<'EOF'
docs: Phase 3 spec + plan（簡化版）

ContactBook 後端 photos N+1 + 前端拆 5 子元件 + 樂觀更新；
YAGNI 砍掉 status code 變更與虛擬列表。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Baseline 確認**

```bash
npm run test 2>&1 | tail -5
```

Expected：850 passed（phase 2 結束狀態）。

- [ ] **Step 4: 建 子元件 + 測試目錄**

```bash
mkdir -p src/views/portal/components/contactBook tests/unit/views/portal/contactBook
```

---

### Task 3F.2: 抽 ContactBookFilterBar.vue + 測試

**Files:**
- Create: `src/views/portal/components/contactBook/ContactBookFilterBar.vue`
- Create: `tests/unit/views/portal/contactBook/ContactBookFilterBar.test.js`
- Modify: `src/views/portal/PortalContactBookView.vue`（移除原本 filter bar template + 改用 child component）

- [ ] **Step 1: Read PortalContactBookView 找 filter bar 區塊**

```bash
grep -n "el-select\|el-date-picker\|fetchClassDay\|@change" src/views/portal/PortalContactBookView.vue | head -15
```

找到 template 內 filter bar（班級下拉 + 日期 picker + 範本按鈕 + 重新整理）的範圍與行號。

- [ ] **Step 2: 建子元件 ContactBookFilterBar.vue**

```vue
<script setup>
import { Refresh } from '@element-plus/icons-vue'

defineProps({
  classroomId: { type: [Number, null], default: null },
  classrooms: { type: Array, required: true },
  logDate: { type: String, required: true },
  loading: { type: Boolean, default: false },
})

defineEmits([
  'update:classroomId',
  'update:logDate',
  'refresh',
  'open-template',
  'open-batch',
])
</script>

<template>
  <div class="contact-book-filter">
    <el-select
      :model-value="classroomId"
      placeholder="選擇班級"
      style="width: 200px"
      @update:model-value="$emit('update:classroomId', $event)"
    >
      <el-option
        v-for="c in classrooms"
        :key="c.id"
        :label="c.name"
        :value="c.id"
      />
    </el-select>

    <el-date-picker
      :model-value="logDate"
      type="date"
      value-format="YYYY-MM-DD"
      placeholder="選擇日期"
      :clearable="false"
      style="width: 160px"
      @update:model-value="$emit('update:logDate', $event)"
    />

    <el-button :icon="Refresh" :loading="loading" @click="$emit('refresh')">
      重新整理
    </el-button>

    <el-button @click="$emit('open-template')">套用範本</el-button>
    <el-button @click="$emit('open-batch')">批次發布</el-button>
  </div>
</template>

<style scoped>
.contact-book-filter {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
</style>
```

- [ ] **Step 3: 寫測試**

`tests/unit/views/portal/contactBook/ContactBookFilterBar.test.js`：

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContactBookFilterBar from '@/views/portal/components/contactBook/ContactBookFilterBar.vue'

const props = {
  classroomId: 1,
  classrooms: [
    { id: 1, name: '小白兔' },
    { id: 2, name: '小綠葉' },
  ],
  logDate: '2026-05-06',
  loading: false,
}

describe('ContactBookFilterBar', () => {
  it('renders classroom select with options', () => {
    const w = mount(ContactBookFilterBar, { props })
    expect(w.findAll('.el-select').length).toBeGreaterThan(0)
  })

  it('emits update:classroomId on change', async () => {
    const w = mount(ContactBookFilterBar, { props })
    // Element Plus select 互動較複雜，直接 trigger emit 確認 binding
    await w.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 2)
    expect(w.emitted('update:classroomId')[0]).toEqual([2])
  })

  it('emits refresh / open-template / open-batch on button click', async () => {
    const w = mount(ContactBookFilterBar, { props })
    const buttons = w.findAll('button')
    // 重新整理 / 套用範本 / 批次發布 三個按鈕
    expect(buttons.length).toBeGreaterThanOrEqual(3)
    await buttons[buttons.length - 3].trigger('click')
    await buttons[buttons.length - 2].trigger('click')
    await buttons[buttons.length - 1].trigger('click')
    expect(w.emitted('refresh')).toHaveLength(1)
    expect(w.emitted('open-template')).toHaveLength(1)
    expect(w.emitted('open-batch')).toHaveLength(1)
  })
})
```

- [ ] **Step 4: 跑直到綠**

```bash
npm run test -- tests/unit/views/portal/contactBook/ContactBookFilterBar.test.js 2>&1 | tail -10
```

如 fail，看 error 對齊（el-select 互動可能要 stub）。

- [ ] **Step 5: 把 PortalContactBookView 內 filter bar 替換為 child component**

開 `src/views/portal/PortalContactBookView.vue`，找到原本 filter bar 區塊，替換為：

```vue
<ContactBookFilterBar
  v-model:classroom-id="classroomId"
  v-model:log-date="logDate"
  :classrooms="classrooms"
  :loading="listLoading"
  @refresh="fetchClassDay"
  @open-template="showTemplateDialog = true"
  @open-batch="showBatchDialog = true"
/>
```

並 import 子元件：

```javascript
import ContactBookFilterBar from './components/contactBook/ContactBookFilterBar.vue'
```

如果原檔的 state 名不同（例如 `classroomId.value` 是 ref），對齊。

- [ ] **Step 6: 跑全 vitest + dev mode 手動 verify**

```bash
npm run test 2>&1 | tail -5
```

Expected：850 + 3 (新加 ContactBookFilterBar test) = 853。

- [ ] **Step 7: Commit**

```bash
git add src/views/portal/components/contactBook/ContactBookFilterBar.vue tests/unit/views/portal/contactBook/ContactBookFilterBar.test.js src/views/portal/PortalContactBookView.vue
git commit -m "$(cat <<'EOF'
refactor(portal-contact-book): 抽出 ContactBookFilterBar 子元件

班級 / 日期 / 範本/批次/重整 5 個按鈕從 PortalContactBookView 抽出。
Phase 3F 5 子元件拆解第一步（1/5）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3F.3: 抽 ContactBookEntryCard.vue + 測試

**Files:**
- Create: `src/views/portal/components/contactBook/ContactBookEntryCard.vue`
- Create: `tests/unit/views/portal/contactBook/ContactBookEntryCard.test.js`
- Modify: `src/views/portal/PortalContactBookView.vue`

- [ ] **Step 1: Read 找學生卡片渲染區塊**

```bash
grep -n "v-for.*items\|student_name\|entry.mood\|entry.published\|click.*openDrawer" src/views/portal/PortalContactBookView.vue | head -15
```

找學生卡片 grid 在 template 哪段，看用了哪些 entry 欄位。

- [ ] **Step 2: 建子元件**

```vue
<script setup>
defineProps({
  item: { type: Object, required: true },  // { student_id, student_name, entry }
  moodEmoji: { type: Object, required: true },  // { happy: '😄', ... }
})

defineEmits(['click'])
</script>

<template>
  <div
    class="entry-card"
    :class="{
      'has-entry': !!item.entry,
      'is-published': item.entry?.is_published,
      'is-draft': item.entry && !item.entry.is_published,
    }"
    @click="$emit('click', item)"
  >
    <div class="entry-card__name">{{ item.student_name }}</div>
    <div class="entry-card__status">
      <template v-if="!item.entry">
        <span class="badge badge--missing">未填寫</span>
      </template>
      <template v-else-if="item.entry.is_published">
        <span class="badge badge--published">已發布</span>
        <span v-if="item.entry.mood" class="mood">{{ moodEmoji[item.entry.mood] }}</span>
      </template>
      <template v-else>
        <span class="badge badge--draft">草稿</span>
        <span v-if="item.entry.mood" class="mood">{{ moodEmoji[item.entry.mood] }}</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.entry-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-3);
  background: var(--pt-surface-card);
  border: var(--pt-hairline);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: box-shadow var(--transition-base);
  -webkit-tap-highlight-color: transparent;
}

.entry-card:hover {
  box-shadow: var(--pt-elev-1);
}

.entry-card.is-published { border-left: 3px solid #16a34a; }
.entry-card.is-draft { border-left: 3px solid #f59e0b; }

.entry-card__name {
  font-weight: 500;
  color: var(--pt-text-strong);
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: var(--text-xs);
}

.badge--missing { background: #f3f4f6; color: #6b7280; }
.badge--draft { background: #fef3c7; color: #92400e; }
.badge--published { background: #dcfce7; color: #166534; }

.mood { margin-left: 6px; font-size: 16px; }
</style>
```

⚠ 實際 entry 結構（`is_published` 還是 `published`、`mood` 欄位等）以原 PortalContactBookView 用的為準。讀後對齊。

- [ ] **Step 3: 寫 5-7 條 test**

`tests/unit/views/portal/contactBook/ContactBookEntryCard.test.js`：

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContactBookEntryCard from '@/views/portal/components/contactBook/ContactBookEntryCard.vue'

const MOOD_EMOJI = { happy: '😄', sad: '😢' }

const ITEM_NO_ENTRY = { student_id: 1, student_name: '小明', entry: null }
const ITEM_DRAFT = {
  student_id: 2, student_name: '小華',
  entry: { id: 10, mood: 'happy', is_published: false, version: 1 },
}
const ITEM_PUBLISHED = {
  student_id: 3, student_name: '小美',
  entry: { id: 11, mood: 'sad', is_published: true, version: 2 },
}

describe('ContactBookEntryCard', () => {
  it('renders student name', () => {
    const w = mount(ContactBookEntryCard, { props: { item: ITEM_NO_ENTRY, moodEmoji: MOOD_EMOJI } })
    expect(w.text()).toContain('小明')
  })

  it('shows missing badge when no entry', () => {
    const w = mount(ContactBookEntryCard, { props: { item: ITEM_NO_ENTRY, moodEmoji: MOOD_EMOJI } })
    expect(w.text()).toContain('未填寫')
  })

  it('shows draft badge', () => {
    const w = mount(ContactBookEntryCard, { props: { item: ITEM_DRAFT, moodEmoji: MOOD_EMOJI } })
    expect(w.text()).toContain('草稿')
    expect(w.classes()).toContain('is-draft')
  })

  it('shows published badge', () => {
    const w = mount(ContactBookEntryCard, { props: { item: ITEM_PUBLISHED, moodEmoji: MOOD_EMOJI } })
    expect(w.text()).toContain('已發布')
    expect(w.classes()).toContain('is-published')
  })

  it('shows mood emoji when entry has mood', () => {
    const w = mount(ContactBookEntryCard, { props: { item: ITEM_DRAFT, moodEmoji: MOOD_EMOJI } })
    expect(w.text()).toContain('😄')
  })

  it('emits click with item on click', async () => {
    const w = mount(ContactBookEntryCard, { props: { item: ITEM_PUBLISHED, moodEmoji: MOOD_EMOJI } })
    await w.trigger('click')
    expect(w.emitted('click')[0][0]).toEqual(ITEM_PUBLISHED)
  })
})
```

- [ ] **Step 4: 跑直到綠**

```bash
npm run test -- tests/unit/views/portal/contactBook/ContactBookEntryCard.test.js 2>&1 | tail -10
```

- [ ] **Step 5: 在 PortalContactBookView 替換原本卡片**

找原本 `<div v-for="item in items" ...>` 區塊，替換為：

```vue
<ContactBookEntryCard
  v-for="item in items"
  :key="item.student_id"
  :item="item"
  :mood-emoji="MOOD_EMOJI"
  @click="openDrawer"
/>
```

並 import：

```javascript
import ContactBookEntryCard from './components/contactBook/ContactBookEntryCard.vue'
```

- [ ] **Step 6: 跑全 vitest + commit**

```bash
npm run test 2>&1 | tail -5
git add src/views/portal/components/contactBook/ContactBookEntryCard.vue tests/unit/views/portal/contactBook/ContactBookEntryCard.test.js src/views/portal/PortalContactBookView.vue
git commit -m "refactor(portal-contact-book): 抽出 ContactBookEntryCard

學生網格的單筆卡片從 PortalContactBookView 抽出（2/5）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3F.4: 抽 ContactBookEntryDrawer.vue（核心、最大）

**Files:**
- Create: `src/views/portal/components/contactBook/ContactBookEntryDrawer.vue`
- Create: `tests/unit/views/portal/contactBook/ContactBookEntryDrawer.test.js`
- Modify: `src/views/portal/PortalContactBookView.vue`

抽 drawer = 8 欄位 + 照片區 + 草稿/發布按鈕 + 樂觀更新 emit。

- [ ] **Step 1: Read drawer 既有 template + script 邏輯**

```bash
grep -n "el-drawer\|drawerEntry\|publishEntry\|updateEntry\|isSaving\|MOOD_OPTIONS" src/views/portal/PortalContactBookView.vue | head -25
```

找 drawer template 範圍與相關 state。

- [ ] **Step 2: 建子元件 + 完整 8 欄位 form**

```vue
<script setup>
import { computed, ref, watch } from 'vue'
import ContactBookPhotoGrid from './ContactBookPhotoGrid.vue'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  entry: { type: Object, default: null },  // { id, version, mood, ..., photos }
  studentName: { type: String, default: '' },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:modelValue',
  'save-draft',  // (formPayload, version) => void
  'publish',     // (formPayload, version) => void
  'upload-photo',  // File => void
  'delete-photo',  // photoId => void
])

const MOOD_OPTIONS = [
  { value: 'happy', label: '😄 開心' },
  { value: 'normal', label: '🙂 普通' },
  { value: 'tired', label: '😴 疲倦' },
  { value: 'sad', label: '😢 難過' },
  { value: 'sick', label: '🤒 不適' },
]
const MEAL_OPTIONS = [
  { value: 0, label: '未進食' },
  { value: 1, label: '少' },
  { value: 2, label: '適中' },
  { value: 3, label: '多' },
]
const BOWEL_OPTIONS = [
  { value: 'normal', label: '正常' },
  { value: 'soft', label: '稀軟' },
  { value: 'hard', label: '硬' },
  { value: 'none', label: '未排便' },
]

const form = ref({
  mood: null, meal_lunch: null, meal_snack: null, nap_minutes: null,
  bowel: null, temperature_c: null, teacher_note: '', learning_highlight: '',
})

watch(() => props.entry, (e) => {
  if (e) {
    form.value = {
      mood: e.mood ?? null,
      meal_lunch: e.meal_lunch ?? null,
      meal_snack: e.meal_snack ?? null,
      nap_minutes: e.nap_minutes ?? null,
      bowel: e.bowel ?? null,
      temperature_c: e.temperature_c ?? null,
      teacher_note: e.teacher_note ?? '',
      learning_highlight: e.learning_highlight ?? '',
    }
  } else {
    form.value = {
      mood: null, meal_lunch: null, meal_snack: null, nap_minutes: null,
      bowel: null, temperature_c: null, teacher_note: '', learning_highlight: '',
    }
  }
}, { immediate: true })

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const isPublished = computed(() => props.entry?.is_published)
const photos = computed(() => props.entry?.photos || [])

function saveDraft() {
  emit('save-draft', { ...form.value }, props.entry?.version ?? 0)
}

function publish() {
  emit('publish', { ...form.value }, props.entry?.version ?? 0)
}
</script>

<template>
  <el-drawer v-model="visible" :title="`聯絡簿 — ${studentName}`" size="520px" direction="rtl">
    <div class="entry-form">
      <el-form label-position="top">
        <el-form-item label="心情">
          <el-select v-model="form.mood" placeholder="選擇心情" clearable>
            <el-option v-for="o in MOOD_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="午餐">
          <el-select v-model="form.meal_lunch" placeholder="選擇" clearable>
            <el-option v-for="o in MEAL_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="點心">
          <el-select v-model="form.meal_snack" placeholder="選擇" clearable>
            <el-option v-for="o in MEAL_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="午睡（分鐘）">
          <el-input-number v-model="form.nap_minutes" :min="0" :max="240" :step="15" />
        </el-form-item>

        <el-form-item label="排便">
          <el-select v-model="form.bowel" placeholder="選擇" clearable>
            <el-option v-for="o in BOWEL_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="體溫（°C）">
          <el-input-number v-model="form.temperature_c" :min="35" :max="42" :step="0.1" :precision="1" />
        </el-form-item>

        <el-form-item label="老師留言">
          <el-input v-model="form.teacher_note" type="textarea" :rows="3" />
        </el-form-item>

        <el-form-item label="今日學習亮點">
          <el-input v-model="form.learning_highlight" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>

      <ContactBookPhotoGrid
        v-if="entry"
        :photos="photos"
        @upload="(file) => $emit('upload-photo', file)"
        @delete="(id) => $emit('delete-photo', id)"
      />
    </div>

    <template #footer>
      <el-button @click="visible = false">關閉</el-button>
      <el-button :loading="saving" :disabled="isPublished" @click="saveDraft">
        存為草稿
      </el-button>
      <el-button type="primary" :loading="saving" @click="publish">
        {{ isPublished ? '更新已發布' : '發布' }}
      </el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.entry-form { display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-3); }
</style>
```

⚠ 必須與 PortalContactBookView 既有 form schema 對齊（8 欄位名稱、mood/meal/bowel option 值）。讀後修正預設 fallback 值。

- [ ] **Step 3: 寫測試**

`tests/unit/views/portal/contactBook/ContactBookEntryDrawer.test.js`：

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContactBookEntryDrawer from '@/views/portal/components/contactBook/ContactBookEntryDrawer.vue'

const ENTRY_DRAFT = {
  id: 10,
  version: 1,
  mood: 'happy',
  meal_lunch: 2,
  meal_snack: 1,
  nap_minutes: 60,
  bowel: 'normal',
  temperature_c: 36.5,
  teacher_note: 'Note A',
  learning_highlight: 'Highlight A',
  is_published: false,
  photos: [],
}

function mountDrawer(entry = ENTRY_DRAFT, opts = {}) {
  return mount(ContactBookEntryDrawer, {
    props: { modelValue: true, entry, studentName: '小華', saving: false, ...opts },
    global: { stubs: { ElDrawer: { template: '<div class="drawer"><slot /><slot name="footer" /></div>' }, ContactBookPhotoGrid: true } },
    attachTo: document.body,
  })
}

describe('ContactBookEntryDrawer', () => {
  it('renders studentName in title prop', () => {
    const w = mountDrawer()
    // ElDrawer stub 不渲染 title prop；改用 props 驗證
    expect(w.props('studentName')).toBe('小華')
  })

  it('initializes form from entry', async () => {
    const w = mountDrawer()
    // form ref 內部不可直接驗，改驗渲染後 input 是否帶值（el-input-number 等）
    expect(w.html()).toContain('Note A')
    expect(w.html()).toContain('Highlight A')
  })

  it('emits save-draft with form payload + version', async () => {
    const w = mountDrawer()
    const buttons = w.findAll('button')
    const saveBtn = buttons.find((b) => b.text().includes('草稿'))
    await saveBtn.trigger('click')
    const events = w.emitted('save-draft')
    expect(events).toHaveLength(1)
    expect(events[0][1]).toBe(1)  // version
    expect(events[0][0].mood).toBe('happy')
  })

  it('emits publish on publish button', async () => {
    const w = mountDrawer()
    const publishBtn = w.findAll('button').find((b) => b.text().includes('發布'))
    await publishBtn.trigger('click')
    expect(w.emitted('publish')).toHaveLength(1)
  })

  it('disables save-draft when entry is published', () => {
    const published = { ...ENTRY_DRAFT, is_published: true }
    const w = mountDrawer(published)
    const saveBtn = w.findAll('button').find((b) => b.text().includes('草稿'))
    // ElButton stub disabled 用 attribute 或 prop 驗
    expect(saveBtn.attributes('disabled') !== undefined || saveBtn.classes().includes('is-disabled')).toBe(true)
  })

  it('handles null entry gracefully', () => {
    expect(() => mountDrawer(null)).not.toThrow()
  })
})
```

ElDrawer stub 是因為它在 unit test 中有 teleport 行為（要 mount 到 document.body），stub 簡化。

- [ ] **Step 4: 跑直到綠**

```bash
npm run test -- tests/unit/views/portal/contactBook/ContactBookEntryDrawer.test.js 2>&1 | tail -15
```

- [ ] **Step 5: 在 PortalContactBookView 替換 drawer 區塊**

找原本 `<el-drawer v-model="drawerVisible" ...>` 整段（約 506-648 行），替換為：

```vue
<ContactBookEntryDrawer
  v-model="drawerVisible"
  :entry="drawerEntry"
  :student-name="drawerStudentName"
  :saving="isSaving"
  @save-draft="handleSaveDraft"
  @publish="handlePublish"
  @upload-photo="handleUploadPhoto"
  @delete-photo="handleDeletePhoto"
/>
```

並把原本 drawer 內的 form state 從 view 移除（form 移到子元件）；view 保留 drawerEntry（含 version）+ drawerStudentName + isSaving + 4 個 handler。

`handleSaveDraft(payload, version)` 執行 `await updateEntry(drawerEntry.value.id, payload, version)`，**改為樂觀更新本地 list**：

```javascript
async function handleSaveDraft(payload, version) {
  isSaving.value = true
  try {
    const res = await updateEntry(drawerEntry.value.id, payload, version)
    // 樂觀更新：找到 items 中 student 對應 entry，replace
    const idx = items.value.findIndex(i => i.entry?.id === drawerEntry.value.id)
    if (idx >= 0) {
      items.value[idx].entry = res.data
    }
    drawerEntry.value = res.data  // 同步 drawer 的 version
    ElMessage.success('已存為草稿')
  } catch (err) {
    if (err?.response?.status === 409) {
      // 衝突：用 payload 中的 current_entry 局部寫回
      const detail = err.response.data?.detail
      const currentEntry = typeof detail === 'object' ? detail.current_entry : null
      if (currentEntry) {
        const idx = items.value.findIndex(i => i.entry?.id === currentEntry.id)
        if (idx >= 0) items.value[idx].entry = currentEntry
        drawerEntry.value = currentEntry
        ElMessage.warning('資料已被他人更新，已載入最新版，請重新儲存')
      } else {
        await fetchClassDay()
      }
    } else {
      ElMessage.error(apiError(err, '儲存失敗'))
    }
  } finally {
    isSaving.value = false
  }
}
```

`handlePublish` / `handleUploadPhoto` / `handleDeletePhoto` 同樣套樂觀更新模式。

- [ ] **Step 6: 跑全 vitest + dev mode 手動 verify**

```bash
npm run test 2>&1 | tail -5
```

Expected：~860 passed (之前 853 + 6 新)。

- [ ] **Step 7: Commit**

```bash
git add src/views/portal/components/contactBook/ContactBookEntryDrawer.vue tests/unit/views/portal/contactBook/ContactBookEntryDrawer.test.js src/views/portal/PortalContactBookView.vue
git commit -m "$(cat <<'EOF'
refactor(portal-contact-book): 抽出 ContactBookEntryDrawer + 樂觀更新

把 8 欄位編輯抽屜拆出，並把 save / publish 從「fetchClassDay 整撈」
改為「本地 items 替換 + 409 用 current_entry 局部寫回」。

API round-trip：單筆編輯從 2 次 (PUT + GET list) 降為 1 次 (PUT)。

3/5 子元件拆解完成。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3F.5: 抽 ContactBookPhotoGrid.vue + 測試

**Files:**
- Create: `src/views/portal/components/contactBook/ContactBookPhotoGrid.vue`
- Create: `tests/unit/views/portal/contactBook/ContactBookPhotoGrid.test.js`

- [ ] **Step 1: Read 原 photo 渲染**

```bash
grep -n "uploadPhoto\|deletePhoto\|photo.url\|photos.map" src/views/portal/PortalContactBookView.vue | head
```

- [ ] **Step 2: 建子元件**

```vue
<script setup>
import { Camera, Delete } from '@element-plus/icons-vue'
import LazyImage from '@/components/common/LazyImage.vue'

defineProps({
  photos: { type: Array, required: true },
})

const emit = defineEmits(['upload', 'delete'])

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (file) emit('upload', file)
  e.target.value = ''  // reset
}
</script>

<template>
  <div class="photo-grid">
    <div v-for="p in photos" :key="p.id" class="photo-cell">
      <LazyImage :src="p.url" alt="聯絡簿照片" class="photo-img" />
      <button class="del-btn" @click="emit('delete', p.id)" data-test="delete-btn">
        <el-icon><Delete /></el-icon>
      </button>
    </div>

    <label class="upload-cell">
      <input type="file" accept="image/*" @change="onFileChange" hidden />
      <el-icon><Camera /></el-icon>
      <span>上傳照片</span>
    </label>
  </div>
</template>

<style scoped>
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: var(--space-2);
}

.photo-cell {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: var(--pt-hairline);
}

.photo-img { width: 100%; height: 100%; object-fit: cover; }

.del-btn {
  position: absolute; top: 4px; right: 4px;
  background: rgba(0, 0, 0, 0.6); color: #fff; border: none;
  width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}

.upload-cell {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  aspect-ratio: 1; border: 2px dashed var(--pt-text-faint);
  border-radius: var(--radius-md); cursor: pointer; gap: 4px;
  font-size: var(--text-xs); color: var(--pt-text-muted);
}
</style>
```

- [ ] **Step 3: 寫 4-5 條 test**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContactBookPhotoGrid from '@/views/portal/components/contactBook/ContactBookPhotoGrid.vue'

const PHOTOS = [
  { id: 1, url: 'https://example.com/p1.jpg' },
  { id: 2, url: 'https://example.com/p2.jpg' },
]

describe('ContactBookPhotoGrid', () => {
  it('renders one cell per photo', () => {
    const w = mount(ContactBookPhotoGrid, {
      props: { photos: PHOTOS },
      global: { stubs: { LazyImage: true } },
    })
    expect(w.findAll('.photo-cell').length).toBe(2)
  })

  it('renders upload cell', () => {
    const w = mount(ContactBookPhotoGrid, {
      props: { photos: [] },
      global: { stubs: { LazyImage: true } },
    })
    expect(w.find('.upload-cell').exists()).toBe(true)
  })

  it('emits delete on delete button click', async () => {
    const w = mount(ContactBookPhotoGrid, {
      props: { photos: PHOTOS },
      global: { stubs: { LazyImage: true } },
    })
    await w.findAll('[data-test="delete-btn"]')[0].trigger('click')
    expect(w.emitted('delete')[0]).toEqual([1])
  })

  it('emits upload on file selection', async () => {
    const w = mount(ContactBookPhotoGrid, {
      props: { photos: [] },
      global: { stubs: { LazyImage: true } },
    })
    const input = w.find('input[type="file"]')
    const file = new File(['x'], 'test.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    expect(w.emitted('upload')[0][0]).toBe(file)
  })

  it('handles empty photos array', () => {
    const w = mount(ContactBookPhotoGrid, {
      props: { photos: [] },
      global: { stubs: { LazyImage: true } },
    })
    expect(w.findAll('.photo-cell').length).toBe(0)
    expect(w.find('.upload-cell').exists()).toBe(true)
  })
})
```

- [ ] **Step 4: 跑直到綠 + commit**

```bash
npm run test -- tests/unit/views/portal/contactBook/ContactBookPhotoGrid.test.js 2>&1 | tail -10
git add src/views/portal/components/contactBook/ContactBookPhotoGrid.vue tests/unit/views/portal/contactBook/ContactBookPhotoGrid.test.js
git commit -m "feat(portal-contact-book): 新增 ContactBookPhotoGrid 子元件

照片 grid + 上傳/刪除 + 套用 LazyImage 懶載。
4/5 子元件拆解完成。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3F.6: 抽 ContactBookBatchDialog.vue + 測試

**Files:**
- Create: `src/views/portal/components/contactBook/ContactBookBatchDialog.vue`
- Create: `tests/unit/views/portal/contactBook/ContactBookBatchDialog.test.js`

- [ ] **Step 1: Read 原 dialog 內容**

```bash
grep -n "showTemplateDialog\|applyTemplate\|batchPublish\|copyFromYesterday" src/views/portal/PortalContactBookView.vue | head -15
```

確認既有的範本套用 / 批次發布 / 複製昨日 dialog 結構。原 plan 寫拆 1 個 ContactBookBatchDialog；如果實際是 2 個分開的 dialog（template + batch），對應拆 2 個或合併在 1 個。

- [ ] **Step 2: 建子元件（合併 template / batch / copy 三個 dialog 為單一元件，依 mode 切換 UI）**

```vue
<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  mode: { type: String, default: 'template', validator: (v) => ['template', 'batch', 'copy'].includes(v) },
  templates: { type: Array, default: () => [] },  // 範本列表
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'apply-template', 'batch-publish', 'copy-yesterday'])

const selectedTemplateId = ref(null)

watch(() => props.modelValue, (v) => {
  if (v) selectedTemplateId.value = null
})

function confirm() {
  if (props.mode === 'template') {
    if (!selectedTemplateId.value) return
    emit('apply-template', selectedTemplateId.value)
  } else if (props.mode === 'batch') {
    emit('batch-publish')
  } else if (props.mode === 'copy') {
    emit('copy-yesterday')
  }
}

const title = {
  template: '套用範本到全班草稿',
  batch: '批次發布全班草稿',
  copy: '從昨天複製到今天',
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title[mode]"
    width="480px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="mode === 'template'">
      <el-select v-model="selectedTemplateId" placeholder="選擇範本" style="width: 100%">
        <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
      </el-select>
    </template>
    <template v-else-if="mode === 'batch'">
      <p>確認將所有當日草稿一次發布？</p>
    </template>
    <template v-else>
      <p>確認從昨天複製內容到今天？已存在的條目不會被覆蓋。</p>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="confirm">確認</el-button>
    </template>
  </el-dialog>
</template>
```

如原 view 是分開三個 dialog 而合併會增加複雜度，**保留分開**：拆成 ContactBookBatchDialog（只處理 batch publish）+ ContactBookTemplateDialog + ContactBookCopyDialog 三個。先看原 view 結構決定。

- [ ] **Step 3: 寫 4-5 條 test**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContactBookBatchDialog from '@/views/portal/components/contactBook/ContactBookBatchDialog.vue'

describe('ContactBookBatchDialog', () => {
  it('renders template title in template mode', () => {
    const w = mount(ContactBookBatchDialog, {
      props: { modelValue: true, mode: 'template', templates: [] },
      global: { stubs: { ElDialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
    })
    expect(w.html()).toContain('套用範本')
  })

  it('emits apply-template with selected id', async () => {
    const templates = [{ id: 5, name: '範本A' }]
    const w = mount(ContactBookBatchDialog, {
      props: { modelValue: true, mode: 'template', templates },
      global: { stubs: { ElDialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
    })
    await w.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 5)
    const confirmBtn = w.findAll('button').find((b) => b.text().includes('確認'))
    await confirmBtn.trigger('click')
    expect(w.emitted('apply-template')[0]).toEqual([5])
  })

  it('emits batch-publish in batch mode', async () => {
    const w = mount(ContactBookBatchDialog, {
      props: { modelValue: true, mode: 'batch', templates: [] },
      global: { stubs: { ElDialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
    })
    const confirmBtn = w.findAll('button').find((b) => b.text().includes('確認'))
    await confirmBtn.trigger('click')
    expect(w.emitted('batch-publish')).toHaveLength(1)
  })

  it('emits copy-yesterday in copy mode', async () => {
    const w = mount(ContactBookBatchDialog, {
      props: { modelValue: true, mode: 'copy', templates: [] },
      global: { stubs: { ElDialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
    })
    const confirmBtn = w.findAll('button').find((b) => b.text().includes('確認'))
    await confirmBtn.trigger('click')
    expect(w.emitted('copy-yesterday')).toHaveLength(1)
  })
})
```

- [ ] **Step 4: 跑直到綠 + 在 view 替換 + commit**

```bash
npm run test -- tests/unit/views/portal/contactBook/ContactBookBatchDialog.test.js 2>&1 | tail -10

# 在 view 替換原 dialog 區塊
# 三個既有 dialog 改為一個 ContactBookBatchDialog 用 mode prop 切換
# 或保留分開（依實際結構決定）

git add src/views/portal/components/contactBook/ContactBookBatchDialog.vue tests/unit/views/portal/contactBook/ContactBookBatchDialog.test.js src/views/portal/PortalContactBookView.vue
git commit -m "refactor(portal-contact-book): 抽出 ContactBookBatchDialog

合併範本套用 / 批次發布 / 複製昨日三個動作為單一 dialog（mode-driven）。
5/5 子元件拆解完成。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3F.7: PortalContactBookView 主檔收尾 + 全 vitest

**Files:**
- Modify: `src/views/portal/PortalContactBookView.vue`

主檔此時應已大幅縮小（5 子元件抽出）。確認主檔行數 + 跑全測試。

- [ ] **Step 1: 看主檔行數**

```bash
wc -l src/views/portal/PortalContactBookView.vue
```

Expected：< 320 行（目標 280）。如仍 > 320，找重複的 helper / template 區塊看能否進一步壓。

- [ ] **Step 2: 跑全 vitest**

```bash
npm run test 2>&1 | tail -5
```

Expected：~870-880 passed（850 + 25）。

- [ ] **Step 3: dev 手動驗證**

```bash
# 在另一 terminal 跑前後端
cd /Users/yilunwu/Desktop/ivyManageSystem && ./start.sh
```

開瀏覽器登入 admin → /portal/contact-book，驗證：
- 班級切換正常
- 日期切換正常
- 開 entry drawer 編輯正常
- 存草稿 / 發布正常（注意觀察：應該不再見到「整版重撈」flash）
- 上傳照片正常
- 範本套用 dialog 正常

`Ctrl+C` 停 dev。

- [ ] **Step 4: 看 phase 3 commit 歷史**

```bash
git log --oneline feat/teacher-acd-v1-2-home-dashboard..
```

Expected：~7 commits（spec/plan + 5 子元件 + 主檔收尾）。

- [ ] **Step 5: phase 3F 完成；不主動 push**

留用戶決定 push 順序。

---

## Phase 3 完成檢核

### 後端

- [ ] photos N+1 修補（30 student → ≤ 8 query）
- [ ] 409 衝突 response 含 current_entry payload
- [ ] pytest 全綠（除既有 main 上 4 個 fail）
- [ ] 3 commits

### 前端

- [ ] 5 子元件全部建立 + vitest 覆蓋
- [ ] PortalContactBookView 主檔 < 320 行
- [ ] 樂觀更新替換 fetchClassDay 至少在 save / publish / 照片上下傳 4 處
- [ ] 全 vitest ~875 綠
- [ ] dev 手動驗收通過
