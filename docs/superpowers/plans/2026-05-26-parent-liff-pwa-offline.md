# 家長 LIFF PWA + 離線寫入佇列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 家長端 LIFF 補完 PWA shell（manifest + SW 註冊驗證）並加入 5 種高頻寫入動作的 IndexedDB queue，含 client_uuid + DB partial UNIQUE INDEX 防重送髒資料。

**Architecture:** 3 phase 順序：(0) 4 機種真機 spike 驗 LIFF webview 對 PWA 的支援邊界 → (1) 家長獨立 manifest + parent.html link → (2) IndexedDB queue 共用 `ivy-offline` DB，`src/utils/offlineQueue.ts` 升 shared-common 擴 OP_KINDS、`src/parent/utils/parentOfflineQueue.ts` thin facade 注 client_uuid + dispatch saveFn、ParentOfflineIndicator 觀察+觸發、5 view 接入。BE 前置：3 表 Alembic migration + 3 endpoint accept client_uuid 23505 視同成功。

**Tech Stack:** Vue 3 (composition API + `<script setup lang="ts">`), Vite 5, vite-plugin-pwa (Workbox), idb (IndexedDB wrapper), Element Plus, Pinia, axios. BE: FastAPI + Pydantic + SQLAlchemy + Alembic + PostgreSQL.

**Spec:** `ivy-frontend/docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md`

---

## File Structure（決策已鎖）

### 新增

- `ivy-frontend/public/parent.webmanifest` — 家長獨立 PWA manifest（name / icon / theme / scope）
- `ivy-frontend/src/parent/utils/parentOfflineQueue.ts` — thin facade，注 client_uuid + dispatch saveFn
- `ivy-frontend/src/parent/utils/__tests__/parentOfflineQueue.test.ts` — vitest
- `ivy-frontend/src/parent/components/ParentOfflineIndicator.vue` — 全域 banner + 點按 flush
- `ivy-frontend/src/parent/components/__tests__/ParentOfflineIndicator.test.ts` — vitest
- `ivy-backend/alembic/versions/20260527_paroff01_parent_offline_client_uuid.py` — 3 表加 client_uuid + partial UNIQUE
- `ivy-backend/tests/test_parent_offline_idempotency.py` — pytest 含 6 重複 POST 視同成功 test
- `.scratch/parent-pwa-liff-spike-2026-05-26.md` — Phase 0 報告

### 修改

- `ivy-frontend/parent.html` — 加 `<link rel="manifest">` + 視情況 SW 註冊 fallback
- `ivy-frontend/vite.config.js` — `manualChunks` 加 `offlineQueue.ts` 到 shared-common
- `ivy-frontend/src/utils/offlineQueue.ts` — 擴 `OP_KINDS`（API 不變）
- `ivy-frontend/src/parent/main.ts` — 加 boot flush + online / visibilitychange listener
- `ivy-frontend/src/parent/layouts/*` — mount `ParentOfflineIndicator`（找 parent layout 實際路徑）
- `ivy-frontend/src/parent/views/MessageThreadView.vue` — 送訊息接 enqueue
- `ivy-frontend/src/parent/views/ContactBookDetailView.vue` — 回應 + ack 接 enqueue
- `ivy-frontend/src/parent/views/ContactBookView.vue` — 列表 ack 接 enqueue
- `ivy-frontend/src/parent/views/EventAckView.vue` — 事件 ack 接 enqueue
- `ivy-frontend/src/parent/views/LeavesView.vue` — 新建假單接 enqueue
- `ivy-backend/api/parent_portal/messages.py` — 訊息 POST accept client_uuid + idempotent
- `ivy-backend/api/parent_portal/contact_book.py` — reply POST accept client_uuid + idempotent
- `ivy-backend/api/parent_portal/leaves.py` — leave POST accept client_uuid + idempotent
- `ivy-backend/models/parent_message.py` / `models/contact_book.py` / `models/student_leave.py` — 3 個 model 加 `client_uuid` column
- `ivy-backend/schemas/parent.py`（或對應 schema 檔）— 3 個 Pydantic request schema 加 optional `client_uuid`
- `ivy-frontend/docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md` — Phase 0 完成後回填 §10

---

## Task 1: Phase 0 — LIFF webview spike

**屬性**：純手動測試 + 撰寫報告。**不**走 TDD（spike 性質）。

**Files:**
- Create: `.scratch/parent-pwa-liff-spike-2026-05-26.md`
- Modify (最後一步): `ivy-frontend/docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md` §10

**Prerequisites:**
- iPhone 一台 + Mac（Safari 開發者模式啟用）
- Android 一台 + USB 連線
- LINE App 兩端皆登入家長測試帳號
- ivy-frontend dev server 跑起（`./start.sh` 或 `npm run dev` from ivy-frontend）
- 確認家長測試帳號已 bind LINE，可進 LIFF webview

- [ ] **Step 1: 建 spike report 骨架**

Create `.scratch/parent-pwa-liff-spike-2026-05-26.md`：

```markdown
# Parent LIFF PWA Spike — 2026-05-26

## Matrix 4 機種 × 5 測項

| 測項 | iOS LINE | Android LINE | iOS Safari | Android Chrome |
|---|---|---|---|---|
| 1. SW 註冊成功 + scope=/ 涵蓋 parent.html | | | | |
| 2. SW 第二次開啟 (webview 重建) persist | | | | |
| 3. caches API 可讀寫（看 parent-* cache name）| | | | |
| 4. IndexedDB 切回前景仍 persist（30 秒背景）| | | | |
| 5. `<link rel="manifest">` served 正確（200 + JSON）— 目前預期 404，Phase 1 補 | | | | |

## 每 cell 觀察記錄

### iOS LINE webview
- 測項 1: ...
...

## 結論

- spike 整體：[✅ 全綠 / ⚠️ 部分 / ❌ 失敗]
- iOS LINE webview SW 可用？
- Android LINE webview SW 可用？
- IndexedDB eviction 風險：[低 / 中 / 高]

## Phase 1 路徑選擇

依 spec §4.4 三種結論：
- [ ] 全綠 → Phase 1 照原計畫
- [ ] iOS LINE SW 不可用 + Android LINE SW 可用 → Phase 1 manifest+SW 仍上，spec §10 註記
- [ ] 兩平台 LINE SW 都不可用 → Phase 1 縮水成只對外部瀏覽器
```

- [ ] **Step 2: 跑 4×5 matrix（4 機種逐一）**

每機種重複以下：
1. 把 ivy-frontend dev URL（或 staging）灌進對應載體（iOS LINE App 內開 LIFF / iOS Safari / Android LINE App 內 LIFF / Android Chrome）
2. 接 Safari Web Inspector（Mac → 開發 → iPhone → 該 webview tab）或 `chrome://inspect/#devices`（Android）
3. Application tab → Service Workers / IndexedDB / Cache Storage 各看一遍
4. enqueue 一筆 dummy op（暫無 UI 可用 devtools console 跑 `(await import('/src/utils/offlineQueue.ts')).enqueueOp({ kind: 'CLASS_ATTENDANCE', payload: { _spike: true }, userId: 'spike-test' })`）
5. 切到 LINE 主畫面 30 秒 → 切回 → 觀察 IndexedDB 是否還在
6. 強殺 LINE App → 重開 → 進 LIFF → 看 SW status

每 cell 填 ✅ / ❌ / partial+notes。

- [ ] **Step 3: 寫結論**

依 matrix 結果在 spike report「結論」與「Phase 1 路徑選擇」章節 tick 對應勾選並寫 1-2 段 rationale。

- [ ] **Step 4: 回填 spec §10**

Edit `ivy-frontend/docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md` §10「實測結論」TODO 區塊，貼回精簡版（matrix table + 一段結論 + 路徑選擇）。

- [ ] **Step 5: Commit**

```bash
cd ivy-frontend  # spike report 不入 git（.scratch/ 在 .gitignore），只 commit spec 更新
git add docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md
git commit -m "docs(parent): Phase 0 spike 結論回填 parent-liff-pwa-offline spec §10

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 2: Phase 1 — PWA manifest + parent.html link

**Files:**
- Create: `ivy-frontend/public/parent.webmanifest`
- Modify: `ivy-frontend/parent.html`

- [ ] **Step 1: 新增 parent.webmanifest**

Create `ivy-frontend/public/parent.webmanifest`：

```json
{
  "name": "常春藤家長 App",
  "short_name": "家長 App",
  "description": "常春藤幼兒園家長端",
  "theme_color": "#0d9053",
  "background_color": "#ffffff",
  "display": "standalone",
  "orientation": "portrait",
  "start_url": "/parent.html",
  "scope": "/parent/",
  "icons": [
    { "src": "/parent-pwa-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/parent-pwa-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/parent-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Icon fallback 處理**（spec §5.3）：若 `public/parent-pwa-*.png` 尚未存在，先複製 admin 既有 icon 過去：

```bash
cd ivy-frontend/public
test -f parent-pwa-192.png || cp pwa-192x192.png parent-pwa-192.png
test -f parent-pwa-512.png || cp pwa-512x512.png parent-pwa-512.png
test -f parent-maskable-512.png || cp maskable-icon-512x512.png parent-maskable-512.png
```

- [ ] **Step 2: parent.html 加 manifest link**

Edit `ivy-frontend/parent.html`，在 `<head>` 內 `theme-color` meta 後加：

```html
<link rel="manifest" href="/parent.webmanifest">
```

- [ ] **Step 3: 視 spike 結論決定 SW 註冊 fallback（依 Task 1 結果）**

A. 如果 Task 1 結論「`autoUpdate` 已自動 inject `registerSW.js` 到 parent.html」→ 不動 parent.html
B. 如果 Task 1 結論「沒自動 inject」→ 在 parent.html `<body>` 內、`<script type="module" src="/src/parent/main.ts">` **之後**加：

```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/registerSW.js', { type: 'module' })
    })
  }
</script>
```

C. 如果 Task 1 結論「LIFF webview SW 不可用 → 縮水成外部瀏覽器」→ 用條件式 + 偵測 LIFF：

```html
<script>
  // LIFF webview 內 SW 多不可用，避免註冊失敗噴 console error
  const isLiff = /Line\//i.test(navigator.userAgent)
  if ('serviceWorker' in navigator && !isLiff) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/registerSW.js', { type: 'module' })
    })
  }
</script>
```

- [ ] **Step 4: build 驗證**

```bash
cd ivy-frontend
npm run build
ls dist/parent.webmanifest dist/parent.html
grep "parent.webmanifest" dist/parent.html
```

Expected: 兩檔都存在；grep 找到 manifest link。

- [ ] **Step 5: 手測加到主畫面**

1. 用 iPhone Safari **外部瀏覽器** 開 `https://<staging or dev tunnel>/parent.html`
2. Safari 分享 → 加到主畫面
3. 觀察 icon（家長 brand 或 admin fallback） + theme `#0d9053`
4. 從主畫面開 → 看 App splash + standalone display mode

- [ ] **Step 6: Commit**

```bash
cd ivy-frontend
git add public/parent.webmanifest public/parent-pwa-*.png public/parent-maskable-*.png parent.html
git commit -m "feat(parent): 家長端獨立 PWA manifest + SW 註冊

新增 public/parent.webmanifest（家長 brand theme #0d9053 / scope /parent/）。
parent.html 加 manifest link。SW 註冊路徑依 spike 結論決定條件式 / 直接 / autoUpdate。
家長 brand icon 待設計師補，目前 fallback admin icon。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 3: BE — Alembic migration 3 表加 client_uuid

**Files:**
- Create: `ivy-backend/alembic/versions/20260527_paroff01_parent_offline_client_uuid.py`
- Modify: `ivy-backend/models/parent_message.py` / `models/contact_book.py` / `models/student_leave.py`

**遵守 CLAUDE.md `superpowers:sqlalchemy-alembic-expert-best-practices-code-review` 規範**：idempotent up/down、partial UNIQUE WHERE NOT NULL、不破壞 head chain。

- [ ] **Step 1: 寫 migration**

Create `ivy-backend/alembic/versions/20260527_paroff01_parent_offline_client_uuid.py`：

```python
"""parent offline client_uuid 3 tables

Revision ID: paroff01
Revises: mergeheads05
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'paroff01'
down_revision = 'mergeheads05'
branch_labels = None
depends_on = None

TABLES = ('parent_messages', 'student_contact_book_replies', 'student_leave_requests')


def upgrade():
    for tbl in TABLES:
        op.add_column(
            tbl,
            sa.Column('client_uuid', postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_index(
            f'ix_{tbl}_client_uuid',
            tbl,
            ['client_uuid'],
            unique=True,
            postgresql_where=sa.text('client_uuid IS NOT NULL'),
        )


def downgrade():
    for tbl in TABLES:
        op.drop_index(f'ix_{tbl}_client_uuid', table_name=tbl)
        op.drop_column(tbl, 'client_uuid')
```

- [ ] **Step 2: 加 model column 3 處**

Edit `ivy-backend/models/parent_message.py` `class ParentMessage` 內加：

```python
from sqlalchemy.dialects.postgresql import UUID
# ...
client_uuid = Column(UUID(as_uuid=True), nullable=True, index=False)
```

（index 由 alembic UNIQUE 創建，model 不需重複宣告）

對 `models/contact_book.py` `class StudentContactBookReply` 同樣加。
對 `models/student_leave.py` `class StudentLeaveRequest` 同樣加。

- [ ] **Step 3: 驗證 alembic heads 沒分裂**

```bash
cd ivy-backend
alembic heads
```

Expected: 單一 head = `paroff01`。若有多 head → 開 mergeheads06。

- [ ] **Step 4: alembic upgrade head（local dev DB）**

```bash
cd ivy-backend
alembic upgrade head
```

Expected: 沒錯誤；可用 `psql ivymanagement -c "\d parent_messages"` 驗欄位 + index。

- [ ] **Step 5: alembic downgrade 驗 idempotent**

```bash
cd ivy-backend
alembic downgrade -1
alembic upgrade head
```

Expected: 兩次都成功，無錯誤。

- [ ] **Step 6: Commit**

```bash
cd ivy-backend
git add alembic/versions/20260527_paroff01_parent_offline_client_uuid.py \
        models/parent_message.py models/contact_book.py models/student_leave.py
git commit -m "feat(parent-offline): 3 表加 client_uuid + partial UNIQUE index

Alembic migration paroff01：parent_messages / student_contact_book_replies /
student_leave_requests 各加 client_uuid UUID nullable + partial UNIQUE
WHERE client_uuid IS NOT NULL。對應 model 加 column。

Spec：ivy-frontend/docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md §6.2.5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 4: BE — 3 endpoint accept client_uuid + 23505 idempotent + pytest

**Files:**
- Modify: `ivy-backend/api/parent_portal/messages.py`
- Modify: `ivy-backend/api/parent_portal/contact_book.py`
- Modify: `ivy-backend/api/parent_portal/leaves.py`
- Modify: 對應 Pydantic schema 檔（grep 找）
- Create: `ivy-backend/tests/test_parent_offline_idempotency.py`

**TDD pattern**：先寫 test，跑失敗，再改 endpoint。

- [ ] **Step 1: 找 3 endpoint 對應 request schema 位置**

```bash
cd ivy-backend
grep -rn "class.*Create.*Schema\|class.*Reply.*Schema\|class.*Leave.*Schema" schemas/ | head -20
grep -n "Pydantic\|BaseModel" api/parent_portal/messages.py | head -10
```

定位 3 schema（暫稱 `ParentMessageCreate` / `ContactBookReplyCreate` / `ParentLeaveCreate`）。

- [ ] **Step 2: 寫失敗 pytest（idempotent test for messages endpoint）**

Create `ivy-backend/tests/test_parent_offline_idempotency.py`：

```python
"""家長端離線 queue 對應的 3 endpoint idempotency tests

3 個 endpoint 都應該：
- 接受 optional client_uuid (UUID v4)
- 同 client_uuid 重複 POST → 200 + 回原紀錄 + DB row count 不增加
"""
import uuid
import pytest
from sqlalchemy import select, func


@pytest.fixture
def parent_thread_id(db_session, sample_parent_user, sample_student):
    """建一個 thread 給訊息測試用。實作時依 fixture 慣例調整。"""
    from models.parent_message import ParentMessageThread
    thread = ParentMessageThread(
        student_id=sample_student.student_id,
        parent_user_id=sample_parent_user.id,
    )
    db_session.add(thread)
    db_session.commit()
    return thread.id


def test_parent_message_repeat_client_uuid_returns_original(
    parent_client, parent_thread_id, db_session
):
    from models.parent_message import ParentMessage
    cu = str(uuid.uuid4())
    body = {"content": "hello", "client_uuid": cu}
    # 第一次 POST
    r1 = parent_client.post(
        f"/api/parent/messages/threads/{parent_thread_id}/messages", json=body
    )
    assert r1.status_code == 200
    first_id = r1.json()["id"]
    # 第二次 POST 同 client_uuid
    r2 = parent_client.post(
        f"/api/parent/messages/threads/{parent_thread_id}/messages", json=body
    )
    assert r2.status_code == 200
    assert r2.json()["id"] == first_id, "重複 POST 應回原紀錄"
    # DB row count 不變
    count = db_session.scalar(
        select(func.count(ParentMessage.id)).where(
            ParentMessage.client_uuid == cu
        )
    )
    assert count == 1, "DB 不應重複新建"


def test_parent_message_no_client_uuid_still_works(parent_client, parent_thread_id):
    """既有 caller 沒 client_uuid 應正常運作（向後相容）。"""
    body = {"content": "no-uuid"}
    r = parent_client.post(
        f"/api/parent/messages/threads/{parent_thread_id}/messages", json=body
    )
    assert r.status_code == 200


# === contact book reply ===

def test_contact_book_reply_repeat_client_uuid_returns_original(
    parent_client, sample_contact_book_entry, db_session
):
    from models.contact_book import StudentContactBookReply
    cu = str(uuid.uuid4())
    body = {"content": "reply", "client_uuid": cu}
    r1 = parent_client.post(
        f"/api/parent/contact-book/{sample_contact_book_entry.id}/reply", json=body
    )
    assert r1.status_code == 200
    first_id = r1.json()["id"]
    r2 = parent_client.post(
        f"/api/parent/contact-book/{sample_contact_book_entry.id}/reply", json=body
    )
    assert r2.status_code == 200
    assert r2.json()["id"] == first_id
    count = db_session.scalar(
        select(func.count(StudentContactBookReply.id)).where(
            StudentContactBookReply.client_uuid == cu
        )
    )
    assert count == 1


def test_contact_book_reply_no_client_uuid_still_works(
    parent_client, sample_contact_book_entry
):
    r = parent_client.post(
        f"/api/parent/contact-book/{sample_contact_book_entry.id}/reply",
        json={"content": "no-uuid"},
    )
    assert r.status_code == 200


# === parent leave ===

def test_parent_leave_repeat_client_uuid_returns_original(
    parent_client, sample_student, db_session
):
    from models.student_leave import StudentLeaveRequest
    cu = str(uuid.uuid4())
    body = {
        "student_id": sample_student.student_id,
        "leave_type": "sick",
        "start_date": "2026-06-01",
        "end_date": "2026-06-01",
        "reason": "test",
        "client_uuid": cu,
    }
    r1 = parent_client.post("/api/parent/student-leaves", json=body)
    assert r1.status_code == 200
    first_id = r1.json()["id"]
    r2 = parent_client.post("/api/parent/student-leaves", json=body)
    assert r2.status_code == 200
    assert r2.json()["id"] == first_id
    count = db_session.scalar(
        select(func.count(StudentLeaveRequest.id)).where(
            StudentLeaveRequest.client_uuid == cu
        )
    )
    assert count == 1


def test_parent_leave_no_client_uuid_still_works(parent_client, sample_student):
    r = parent_client.post(
        "/api/parent/student-leaves",
        json={
            "student_id": sample_student.student_id,
            "leave_type": "sick",
            "start_date": "2026-06-01",
            "end_date": "2026-06-01",
            "reason": "test",
        },
    )
    assert r.status_code == 200
```

**Note for implementer**：fixture 名（`parent_client`、`sample_parent_user`、`sample_contact_book_entry`、`sample_student`）依 ivy-backend conftest.py 慣例調整；endpoint path 用 grep 校正。

- [ ] **Step 3: 跑 test 確認失敗**

```bash
cd ivy-backend
pytest tests/test_parent_offline_idempotency.py -v
```

Expected: 6 個 test 全 FAIL（client_uuid 欄位被忽略 / 重複 POST 視為新紀錄）。

- [ ] **Step 4: 改 3 Pydantic schema 加 optional client_uuid**

對 3 個 schema 都加：

```python
from uuid import UUID
from typing import Optional

class ParentMessageCreate(BaseModel):
    content: str
    # ...
    client_uuid: Optional[UUID] = None
```

- [ ] **Step 5: 改 3 endpoint 處理 23505**

範例（messages，其他 2 個 endpoint 同 pattern）：

```python
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select

@router.post("/threads/{thread_id}/messages")
def create_thread_message(thread_id: int, body: ParentMessageCreate, db: Session = Depends(get_db), ...):
    # 既有商業邏輯先構造 ParentMessage 物件 ...
    msg = ParentMessage(
        thread_id=thread_id,
        # ...
        client_uuid=body.client_uuid,
    )
    db.add(msg)
    try:
        db.commit()
    except IntegrityError as e:
        # 23505 UNIQUE 衝突 = idempotent retry
        if 'ix_parent_messages_client_uuid' in str(e.orig) and body.client_uuid:
            db.rollback()
            existing = db.scalar(
                select(ParentMessage).where(
                    ParentMessage.client_uuid == body.client_uuid
                )
            )
            if existing:
                return existing  # 視同成功
        raise
    db.refresh(msg)
    return msg
```

3 endpoint 套同 pattern；INDEX name 替換成對應的 `ix_student_contact_book_replies_client_uuid` / `ix_student_leave_requests_client_uuid`。

- [ ] **Step 6: 跑 test 確認通過**

```bash
cd ivy-backend
pytest tests/test_parent_offline_idempotency.py -v
```

Expected: 6 個 test 全 PASS。

- [ ] **Step 7: 跑全套 pytest 確認零 regression**

```bash
cd ivy-backend
pytest -x --ff
```

Expected: 既有 pre-existing fail 不變、無新 regression。

- [ ] **Step 8: Commit**

```bash
cd ivy-backend
git add api/parent_portal/messages.py api/parent_portal/contact_book.py \
        api/parent_portal/leaves.py schemas/ tests/test_parent_offline_idempotency.py
git commit -m "feat(parent-offline): 3 endpoint accept client_uuid + idempotent

messages POST / contact_book reply POST / leaves POST 接 optional
client_uuid 欄位；INSERT 觸發 partial UNIQUE 衝突（23505）→ SELECT
回原紀錄回 200，達成 retry-safe idempotent。沒帶 client_uuid 維持原行為。

Test: 3 endpoint × 2 case (重複 client_uuid / 不帶 client_uuid)

Spec：ivy-frontend/docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md §6.2.5 §6.3.3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 5: FE — 擴 OP_KINDS + vite.config chunk

**Files:**
- Modify: `ivy-frontend/src/utils/offlineQueue.ts`
- Modify: `ivy-frontend/vite.config.js`

**API 不變動，向後相容**：教師端 `attendanceSync.ts` 不需改。

- [ ] **Step 1: 擴 OP_KINDS**

Edit `ivy-frontend/src/utils/offlineQueue.ts` 末尾的 `OP_KINDS`：

```ts
export const OP_KINDS = Object.freeze({
    CLASS_ATTENDANCE: 'class_attendance',
    // 家長端 offline queue（spec 2026-05-26）
    PARENT_MESSAGE: 'parent_message',
    CONTACT_BOOK_REPLY: 'contact_book_reply',
    CONTACT_BOOK_ACK: 'contact_book_ack',
    EVENT_ACK: 'event_ack',
    PARENT_LEAVE_REQUEST: 'parent_leave_request',
})

export type OpKind = typeof OP_KINDS[keyof typeof OP_KINDS]
```

- [ ] **Step 2: vite.config.js 加 chunk 規則**

Edit `ivy-frontend/vite.config.js` `manualChunks` 內 `shared-common` 條件：

```js
if (
    id.includes('/src/utils/format.ts') ||
    id.includes('/src/utils/apiDedupe.ts') ||
    id.includes('/src/utils/offlineQueue.ts') ||   // ← 新增
    id.includes('/src/composables/useCachedAsync.ts') ||
    id.includes('/src/components/common/MobileErrorRetry.vue')
) {
    return 'shared-common'
}
```

- [ ] **Step 3: 驗證教師端既有 test 不破**

```bash
cd ivy-frontend
npm run test -- src/utils/__tests__/offlineQueue
npm run test -- src/views/portal/__tests__
```

Expected: 既有 portal offline queue 相關 test 全綠。

- [ ] **Step 4: 驗證 build 不破**

```bash
cd ivy-frontend
npm run build
```

Expected: build 成功，dist/assets 內 shared-common-*.js 包含 offlineQueue 內容；parent-app-*.js 不包含。可用：

```bash
grep -l "pending_ops" dist/assets/shared-common-*.js
grep -l "pending_ops" dist/assets/parent-app-*.js  # 預期 no match
```

- [ ] **Step 5: Commit**

```bash
cd ivy-frontend
git add src/utils/offlineQueue.ts vite.config.js
git commit -m "feat(offline-queue): 擴 OP_KINDS 6 個家長端 kind + 升 shared-common chunk

OP_KINDS 從 {CLASS_ATTENDANCE} 擴成 6 個。offlineQueue.ts 進 shared-common
chunk，admin/parent 兩端共用同一份 IndexedDB CRUD 核心。

Spec：ivy-frontend/docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md §6.2.1 §6.2.2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 6: FE — parentOfflineQueue facade + vitest

**Files:**
- Create: `ivy-frontend/src/parent/utils/parentOfflineQueue.ts`
- Create: `ivy-frontend/src/parent/utils/__tests__/parentOfflineQueue.test.ts`

**TDD**：先寫 test，跑失敗，再寫 facade。

- [ ] **Step 1: 寫失敗 vitest**

Create `ivy-frontend/src/parent/utils/__tests__/parentOfflineQueue.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// 用 fake IndexedDB（idb 套件可用 fake-indexeddb 起 in-memory）
import 'fake-indexeddb/auto'

import {
  enqueueParent,
  flushParentQueue,
} from '../parentOfflineQueue'
import { OP_KINDS } from '@/utils/offlineQueue'

describe('parentOfflineQueue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // 清 IndexedDB
    indexedDB.deleteDatabase('ivy-offline')
  })

  it('enqueueParent 自動注入 client_uuid (UUID v4 格式)', async () => {
    vi.mock('@/parent/stores/parentAuth', () => ({
      useParentAuthStore: () => ({ user: { user_id: 42 } }),
    }))
    const op = await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { thread_id: 1, content: 'hi' },
    })
    expect(op.payload.client_uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })

  it('enqueueParent 從 parentAuth 拿 user_id 當 partition key', async () => {
    vi.mock('@/parent/stores/parentAuth', () => ({
      useParentAuthStore: () => ({ user: { user_id: 99 } }),
    }))
    const op = await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'hi' },
    })
    expect(op.user_id).toBe(99)
  })

  it('flushParentQueue 200 → removeOp succeeded++', async () => {
    const saveFn = vi.fn().mockResolvedValue({ data: { id: 1 } })
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'hi' },
    })
    const result = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)
    expect(result.succeeded).toBe(1)
    expect(result.kept).toBe(0)
  })

  it('flushParentQueue 23505 / Conflict 視同成功', async () => {
    const saveFn = vi.fn().mockRejectedValue({
      response: { status: 200 },  // BE 23505 dedupe → 回 200 + 原紀錄
    })
    // 實際 BE 把 23505 轉成 200，client 不會看到 409；這裡 mock 200 即可
    // 但若 BE 改成 return 409，這個 case 也要 cover：
    const saveFnConflict = vi.fn().mockRejectedValue({
      response: { status: 409 },
    })
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'hi' },
    })
    const result = await flushParentQueue(
      OP_KINDS.PARENT_MESSAGE,
      saveFnConflict
    )
    expect(result.succeeded).toBe(1)
  })

  it('flushParentQueue 401 走 refresh interceptor 後仍 401 → auth_failed + break', async () => {
    const saveFn = vi.fn().mockRejectedValue({ response: { status: 401 } })
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'hi' },
    })
    const result = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)
    expect(result.auth_failed).toBe(true)
    expect(result.kept).toBeGreaterThanOrEqual(1)
  })

  it('flushParentQueue 403 → needs_review', async () => {
    const saveFn = vi.fn().mockRejectedValue({
      response: { status: 403, data: { detail: 'forbidden' } },
    })
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'hi' },
    })
    const result = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)
    expect(result.needs_review).toBe(1)
  })

  it('flushParentQueue 5xx attempts++ 累積 5 次標 needs_review', async () => {
    const saveFn = vi.fn().mockRejectedValue({ response: { status: 500 } })
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'hi' },
    })
    for (let i = 0; i < 4; i++) {
      const r = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)
      expect(r.kept).toBe(1)
    }
    const final = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)
    expect(final.needs_review).toBe(1)
  })
})
```

- [ ] **Step 2: 跑 test 確認失敗**

```bash
cd ivy-frontend
npm run test -- src/parent/utils/__tests__/parentOfflineQueue.test.ts
```

Expected: import 失敗（模組不存在）。

- [ ] **Step 3: 確認 fake-indexeddb 已安裝**

```bash
cd ivy-frontend
npm ls fake-indexeddb 2>&1 || npm install -D fake-indexeddb
```

教師端 offlineQueue test 應該已用過此套件，若無需要裝。

- [ ] **Step 4: 寫 parentOfflineQueue.ts facade**

Create `ivy-frontend/src/parent/utils/parentOfflineQueue.ts`：

```ts
/**
 * 家長端離線寫入佇列 facade。
 *
 * Wraps src/utils/offlineQueue.ts 的純 CRUD 核心：
 * - enqueueParent: 自動注入 client_uuid 進 payload + 從 parentAuth store 抓 user_id
 * - flushParentQueue: 依 kind dispatch 對應 api saveFn，含 401 refresh / 403 needs_review / 5xx attempts++
 * - flushAllParent: 5 kind 全跑、debounce 1s
 *
 * 不取代 src/utils/offlineQueue（教師端仍直接用 core API）。
 */
import {
  enqueueOp,
  listOps,
  removeOp,
  updateOp,
  OP_KINDS,
  OP_STATUS,
  type OpKind,
} from '@/utils/offlineQueue'
import { isNetworkError } from '@/composables/useOnlineStatus'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import { sendThreadMessage } from '@/parent/api/messages'
import { replyContactBook, ackContactBook } from '@/parent/api/contactBook'
import { acknowledgeEvent } from '@/parent/api/events'
import { createLeave } from '@/parent/api/leaves'

const PARENT_KINDS = [
  OP_KINDS.PARENT_MESSAGE,
  OP_KINDS.CONTACT_BOOK_REPLY,
  OP_KINDS.CONTACT_BOOK_ACK,
  OP_KINDS.EVENT_ACK,
  OP_KINDS.PARENT_LEAVE_REQUEST,
] as const

type ParentOpKind = typeof PARENT_KINDS[number]

export interface ParentEnqueueArgs {
  kind: ParentOpKind
  payload: Record<string, unknown>
  meta?: Record<string, unknown>
}

export interface FlushResult {
  succeeded: number
  needs_review: number
  kept: number
  auth_failed: boolean
}

function genClientUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // fallback：較舊環境（spike 結果可能要強化）
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

export async function enqueueParent(args: ParentEnqueueArgs) {
  const authStore = useParentAuthStore()
  const userId = authStore.user?.user_id
  if (!userId) throw new Error('enqueueParent 需要已登入家長 user_id')
  const payloadWithUuid = {
    ...args.payload,
    client_uuid: args.payload.client_uuid ?? genClientUuid(),
  }
  return enqueueOp({
    kind: args.kind,
    payload: payloadWithUuid,
    userId,
    meta: args.meta ?? {},
  })
}

// kind -> saveFn dispatch
const SAVE_FN_BY_KIND: Record<ParentOpKind, (payload: any) => Promise<unknown>> = {
  [OP_KINDS.PARENT_MESSAGE]: (p) =>
    sendThreadMessage(p.thread_id as number, p),
  [OP_KINDS.CONTACT_BOOK_REPLY]: (p) =>
    replyContactBook(p.entry_id as number, p),
  [OP_KINDS.CONTACT_BOOK_ACK]: (p) =>
    ackContactBook(p.entry_id as number),
  [OP_KINDS.EVENT_ACK]: (p) =>
    acknowledgeEvent(p.event_id as number, p),
  [OP_KINDS.PARENT_LEAVE_REQUEST]: (p) =>
    createLeave(p),
}

export async function flushParentQueue(
  kind: ParentOpKind,
  saveFn?: (payload: any) => Promise<unknown>
): Promise<FlushResult> {
  const fn = saveFn ?? SAVE_FN_BY_KIND[kind]
  const authStore = useParentAuthStore()
  const ops = await listOps({
    kind,
    status: OP_STATUS.PENDING,
    userId: authStore.user?.user_id,
  })
  const result: FlushResult = {
    succeeded: 0,
    needs_review: 0,
    kept: 0,
    auth_failed: false,
  }
  for (const op of ops) {
    try {
      await fn(op.payload)
      await removeOp(op.id)
      result.succeeded += 1
    } catch (e) {
      const err = e as {
        response?: { status?: number; data?: { detail?: string } }
        message?: string
      }
      const status = err?.response?.status
      // 409 (Conflict) / BE 改成 23505 dedupe → 視同成功
      if (status === 409 || status === 200) {
        await removeOp(op.id)
        result.succeeded += 1
        continue
      }
      if (status === 401) {
        // 家長端依賴 parent/api/index.ts axios refresh interceptor，
        // 走到這裡代表 interceptor 已試過 refresh 仍 401 → break
        result.auth_failed = true
        const remaining = ops.length - result.succeeded - result.needs_review
        result.kept += remaining
        break
      }
      if (status === 403) {
        await updateOp(op.id, {
          status: OP_STATUS.NEEDS_REVIEW,
          last_error: err?.response?.data?.detail ?? 'forbidden',
        })
        result.needs_review += 1
        continue
      }
      if (isNetworkError(e)) {
        await updateOp(op.id, {
          attempts: ((op as any).attempts || 0) + 1,
          last_error: '網路連線失敗',
        })
        result.kept += 1
        continue
      }
      // 4xx/5xx: attempts++ ≥5 標 needs_review
      const attempts = ((op as any).attempts || 0) + 1
      if (attempts >= 5) {
        await updateOp(op.id, {
          status: OP_STATUS.NEEDS_REVIEW,
          attempts,
          last_error: err?.response?.data?.detail ?? err?.message ?? '重試次數過多',
        })
        result.needs_review += 1
      } else {
        await updateOp(op.id, {
          attempts,
          last_error: err?.response?.data?.detail ?? err?.message ?? '未知錯誤',
        })
        result.kept += 1
      }
    }
  }
  return result
}

let _flushAllDebounceTimer: ReturnType<typeof setTimeout> | null = null
let _flushAllInFlight: Promise<FlushResult> | null = null

export function flushAllParent(): Promise<FlushResult> {
  if (_flushAllInFlight) return _flushAllInFlight
  if (_flushAllDebounceTimer) clearTimeout(_flushAllDebounceTimer)
  _flushAllInFlight = new Promise((resolve) => {
    _flushAllDebounceTimer = setTimeout(async () => {
      const total: FlushResult = {
        succeeded: 0,
        needs_review: 0,
        kept: 0,
        auth_failed: false,
      }
      for (const kind of PARENT_KINDS) {
        const r = await flushParentQueue(kind)
        total.succeeded += r.succeeded
        total.needs_review += r.needs_review
        total.kept += r.kept
        total.auth_failed = total.auth_failed || r.auth_failed
        if (r.auth_failed) break
      }
      _flushAllInFlight = null
      resolve(total)
    }, 1000)
  })
  return _flushAllInFlight
}

export { PARENT_KINDS, type ParentOpKind }
```

- [ ] **Step 5: 跑 test 確認 PASS**

```bash
cd ivy-frontend
npm run test -- src/parent/utils/__tests__/parentOfflineQueue.test.ts
```

Expected: 全綠。若有 mock 順序或 store import 問題，調整 vi.mock 順序（必須在 import 前 hoist）。

- [ ] **Step 6: typecheck**

```bash
cd ivy-frontend
npm run typecheck
```

Expected: 0 error。

- [ ] **Step 7: Commit**

```bash
cd ivy-frontend
git add src/parent/utils/parentOfflineQueue.ts src/parent/utils/__tests__/parentOfflineQueue.test.ts
git commit -m "feat(parent-offline): parentOfflineQueue facade 注 client_uuid + dispatch saveFn

src/parent/utils/parentOfflineQueue.ts thin wrapper：
- enqueueParent 自動注入 crypto.randomUUID() client_uuid + 從 parentAuth 抓 user_id
- flushParentQueue 5 kind 各自 saveFn dispatch + 23505/409 視同成功 + 401 break + 403 needs_review + 5xx attempts++ ≥5 needs_review
- flushAllParent debounce 1s 防 5 trigger 同時打

含 7 個 vitest（uuid 注入 / user_id partition / 200 / 409 / 401 / 403 / 5xx 5 次）。

Spec：ivy-frontend/docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md §6.2.3 §6.3.2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 7: FE — ParentOfflineIndicator.vue + vitest

**Files:**
- Create: `ivy-frontend/src/parent/components/ParentOfflineIndicator.vue`
- Create: `ivy-frontend/src/parent/components/__tests__/ParentOfflineIndicator.test.ts`

- [ ] **Step 1: 寫失敗 vitest**

Create `ivy-frontend/src/parent/components/__tests__/ParentOfflineIndicator.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import 'fake-indexeddb/auto'
import ElementPlus from 'element-plus'

import ParentOfflineIndicator from '../ParentOfflineIndicator.vue'
import { enqueueOp, OP_KINDS, OP_STATUS, updateOp, clearAll } from '@/utils/offlineQueue'

enableAutoUnmount(afterEach)

describe('ParentOfflineIndicator', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await clearAll()
    vi.mock('@/parent/stores/parentAuth', () => ({
      useParentAuthStore: () => ({ user: { user_id: 7 } }),
    }))
  })

  it('0 pending + 0 needs_review → 不顯示', async () => {
    const wrapper = mount(ParentOfflineIndicator, {
      global: { plugins: [ElementPlus] },
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(wrapper.text()).not.toContain('等待同步')
    expect(wrapper.text()).not.toContain('無法同步')
  })

  it('N pending → 顯示「N 筆等待同步」', async () => {
    for (let i = 0; i < 3; i++) {
      await enqueueOp({
        kind: OP_KINDS.PARENT_MESSAGE,
        payload: { content: 'x' },
        userId: 7,
      })
    }
    const wrapper = mount(ParentOfflineIndicator, {
      global: { plugins: [ElementPlus] },
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(wrapper.text()).toContain('3 筆等待同步')
  })

  it('K needs_review → 顯示「K 筆無法同步」', async () => {
    const op = await enqueueOp({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'x' },
      userId: 7,
    })
    await updateOp(op.id, { status: OP_STATUS.NEEDS_REVIEW })
    const wrapper = mount(ParentOfflineIndicator, {
      global: { plugins: [ElementPlus] },
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(wrapper.text()).toContain('無法同步')
  })

  it('點按 pending banner 觸 flushAllParent', async () => {
    const flushSpy = vi.fn().mockResolvedValue({
      succeeded: 1, needs_review: 0, kept: 0, auth_failed: false,
    })
    vi.mock('@/parent/utils/parentOfflineQueue', async () => {
      const actual = await vi.importActual<any>('@/parent/utils/parentOfflineQueue')
      return { ...actual, flushAllParent: flushSpy }
    })
    await enqueueOp({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'x' },
      userId: 7,
    })
    const wrapper = mount(ParentOfflineIndicator, {
      global: { plugins: [ElementPlus] },
    })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.find('[data-testid="manual-flush"]').trigger('click')
    expect(flushSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑 test 確認失敗**

```bash
cd ivy-frontend
npm run test -- src/parent/components/__tests__/ParentOfflineIndicator.test.ts
```

Expected: 失敗（元件不存在）。

- [ ] **Step 3: 寫元件**

Create `ivy-frontend/src/parent/components/ParentOfflineIndicator.vue`：

```vue
<script setup lang="ts">
/**
 * 家長端離線同步狀態 indicator。
 *
 * 三狀態：
 * - 0 pending + 0 needs_review → 隱藏
 * - N pending → 顯示「N 筆等待同步」+ 點按手動 flush
 * - K needs_review → 顯示「K 筆無法同步」+ 點開 ElMessageBox 列詳情
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { listOps, OP_KINDS, OP_STATUS, updateOp } from '@/utils/offlineQueue'
import { flushAllParent, PARENT_KINDS } from '@/parent/utils/parentOfflineQueue'
import { useParentAuthStore } from '@/parent/stores/parentAuth'

const authStore = useParentAuthStore()

const pendingCount = ref(0)
const reviewCount = ref(0)
const reviewOps = ref<Record<string, unknown>[]>([])

async function refresh() {
  const uid = authStore.user?.user_id
  if (!uid) {
    pendingCount.value = 0
    reviewCount.value = 0
    return
  }
  let pending = 0
  let needs = 0
  const reviewList: Record<string, unknown>[] = []
  for (const kind of PARENT_KINDS) {
    const p = await listOps({ kind, status: OP_STATUS.PENDING, userId: uid })
    const r = await listOps({ kind, status: OP_STATUS.NEEDS_REVIEW, userId: uid })
    pending += p.length
    needs += r.length
    reviewList.push(...r)
  }
  pendingCount.value = pending
  reviewCount.value = needs
  reviewOps.value = reviewList
}

async function manualFlush() {
  await flushAllParent()
  await refresh()
}

async function openReviewDialog() {
  const html = reviewOps.value.map((op) => {
    const meta = op.meta as Record<string, unknown> || {}
    const created = op.created_at as string
    const lastErr = op.last_error as string
    return `<div style="margin:8px 0;padding:8px;border-left:3px solid #f56c6c;">
      <strong>${op.kind}</strong><br>
      建立：${created}<br>
      錯誤：${lastErr ?? '—'}<br>
      備註：${JSON.stringify(meta)}
    </div>`
  }).join('')
  try {
    await ElMessageBox.confirm(html, '無法同步的操作', {
      confirmButtonText: '全部重試',
      cancelButtonText: '聯絡管理員',
      dangerouslyUseHTMLString: true,
    })
    // 重試：reset attempts=0, status=pending
    for (const op of reviewOps.value) {
      await updateOp(op.id as string, {
        status: OP_STATUS.PENDING,
        attempts: 0,
        last_error: null,
      })
    }
    await manualFlush()
  } catch {
    // 取消 = 聯絡管理員：開 messages（或顯示電話）
    // v1：簡單導向 messages list
    window.location.href = '/parent.html#/messages'
  }
}

const show = computed(() => pendingCount.value > 0 || reviewCount.value > 0)

onMounted(() => {
  refresh()
  // 自動輪詢 5s 一次（也可改用 storage event / pinia listener）
  const timer = setInterval(refresh, 5000)
  // cleanup on unmount
  ;(window as any).__parent_indicator_timer = timer
})
</script>

<template>
  <div v-if="show" class="parent-offline-indicator">
    <button
      v-if="pendingCount > 0"
      data-testid="manual-flush"
      class="indicator-btn pending"
      @click="manualFlush"
    >
      <span class="material-symbols-rounded">sync</span>
      {{ pendingCount }} 筆等待同步
    </button>
    <button
      v-if="reviewCount > 0"
      data-testid="open-review"
      class="indicator-btn review"
      @click="openReviewDialog"
    >
      <span class="material-symbols-rounded">error</span>
      {{ reviewCount }} 筆無法同步
    </button>
  </div>
</template>

<style scoped>
.parent-offline-indicator {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 0) + 80px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  gap: 8px;
}
.indicator-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 9999px;
  border: none;
  font: inherit;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(0, 0, 0, .15);
}
.indicator-btn.pending {
  background: #0d9053;
  color: #fff;
}
.indicator-btn.review {
  background: #f56c6c;
  color: #fff;
}
</style>
```

- [ ] **Step 4: 跑 test 確認通過**

```bash
cd ivy-frontend
npm run test -- src/parent/components/__tests__/ParentOfflineIndicator.test.ts
```

Expected: 4 個 test 全綠。

- [ ] **Step 5: typecheck**

```bash
cd ivy-frontend
npm run typecheck
```

Expected: 0 error。

- [ ] **Step 6: Commit**

```bash
cd ivy-frontend
git add src/parent/components/ParentOfflineIndicator.vue \
        src/parent/components/__tests__/ParentOfflineIndicator.test.ts
git commit -m "feat(parent-offline): ParentOfflineIndicator 全域 banner

固定底部 indicator，三狀態：
- 0 pending + 0 review → 隱藏
- N pending → 綠色 banner「N 筆等待同步」+ 點按手動 flush
- K needs_review → 紅色 banner「K 筆無法同步」+ ElMessageBox 列詳情 + 全部重試 / 聯絡管理員

含 4 個 vitest。

Spec：ivy-frontend/docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md §6.2.4 §7.5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 8: FE — main.ts flush triggers + ParentLayout mount Indicator

**Files:**
- Modify: `ivy-frontend/src/parent/main.ts`
- Modify: `ivy-frontend/src/parent/layouts/*` (找 parent layout 實際路徑)

- [ ] **Step 1: 找 parent layout 實際檔案**

```bash
cd ivy-frontend
ls src/parent/layouts/ 2>&1
grep -rn "RouterView\|<router-view" src/parent/ 2>&1 | head -5
```

定位主 layout（很可能 `src/parent/layouts/ParentLayout.vue` 或 `src/parent/App.vue`）。

- [ ] **Step 2: main.ts 加 boot/online/visibilitychange flush triggers**

Edit `ivy-frontend/src/parent/main.ts`，在 `app.mount('#app')` 之**前**加：

```ts
// 離線寫入佇列：boot / online / visibilitychange flush triggers
// Spec §6.3.2
import { flushAllParent } from '@/parent/utils/parentOfflineQueue'

function setupOfflineFlushTriggers() {
  // boot：等 session probe + auth hydrate 後跑一次（router.afterEach 確保已認證）
  router.afterEach(() => {
    // 只在第一次 nav 結束時跑一次
    if ((window as any).__parent_boot_flushed) return
    ;(window as any).__parent_boot_flushed = true
    queueMicrotask(() => { flushAllParent().catch(() => {}) })
  })
  // online event
  window.addEventListener('online', () => {
    flushAllParent().catch(() => {})
  })
  // visibilitychange 切回前景
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      flushAllParent().catch(() => {})
    }
  })
}
setupOfflineFlushTriggers()
```

- [ ] **Step 3: 在 ParentLayout 掛 ParentOfflineIndicator**

Edit `src/parent/layouts/ParentLayout.vue`（或實際 layout 檔），在 `<template>` 內加：

```vue
<script setup lang="ts">
// ... existing imports
import ParentOfflineIndicator from '@/parent/components/ParentOfflineIndicator.vue'
</script>

<template>
  <!-- ... existing layout markup -->
  <ParentOfflineIndicator />
</template>
```

- [ ] **Step 4: build + typecheck**

```bash
cd ivy-frontend
npm run typecheck
npm run build
```

Expected: 0 error。

- [ ] **Step 5: 既有 vitest 不破**

```bash
cd ivy-frontend
npm run test
```

Expected: 全綠（既有測試零 regression）。

- [ ] **Step 6: Commit**

```bash
cd ivy-frontend
git add src/parent/main.ts src/parent/layouts/
git commit -m "feat(parent-offline): main.ts flush triggers + ParentLayout mount Indicator

main.ts 加 3 個自動 flush trigger：
- router.afterEach 首次 nav 後 boot flush
- window 'online' event
- document 'visibilitychange' (visible) 切回前景

ParentLayout 掛 ParentOfflineIndicator 全域 banner。

Spec：ivy-frontend/docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md §6.3.2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 9: FE — 5 view 接入 enqueue

**Files:**
- Modify: `ivy-frontend/src/parent/views/MessageThreadView.vue`
- Modify: `ivy-frontend/src/parent/views/ContactBookDetailView.vue`
- Modify: `ivy-frontend/src/parent/views/ContactBookView.vue`
- Modify: `ivy-frontend/src/parent/views/EventAckView.vue`
- Modify: `ivy-frontend/src/parent/views/LeavesView.vue`

每 view 改造 pattern 一樣：

1. import `enqueueParent`、`flushParentQueue`、`OP_KINDS`
2. 送出 handler 包成 online/offline 分流
3. `onMounted` 加 `flushParentQueue(kind)` once
4. 樂觀 UI 顯示「等待同步」inline tag

每 view 各 1 個 vitest（offline path 走 enqueue 不走 axios POST）。

- [ ] **Step 1: MessageThreadView.vue 改造**

Edit `ivy-frontend/src/parent/views/MessageThreadView.vue`，找送訊息 handler（grep `sendThreadMessage`），改成：

```ts
import { enqueueParent, flushParentQueue } from '@/parent/utils/parentOfflineQueue'
import { OP_KINDS } from '@/utils/offlineQueue'
import { onMounted } from 'vue'

const DRAFT_KEY = `parent-msg-draft-${threadId.value}`

async function submitMessage(content: string) {
  if (!content.trim()) return
  const hasAttachment = photoFiles.value.length > 0  // 依實際 ref 名
  // 線上 + 有/沒附件 → 直接送
  if (navigator.onLine) {
    try {
      await sendThreadMessage(threadId.value, { content })
      sessionStorage.removeItem(DRAFT_KEY)
      // ... 既有 success 處理
    } catch (e) { /* 既有 */ }
    return
  }
  // 離線 + 有附件 → 阻擋（但保留文字草稿到 sessionStorage，spec §6.5）
  if (hasAttachment) {
    sessionStorage.setItem(DRAFT_KEY, content)
    toast.warn('需連線才能上傳附件，文字已暫存草稿，下次進此對話可恢復')
    return
  }
  // 離線 + 純文字 → enqueue
  await enqueueParent({
    kind: OP_KINDS.PARENT_MESSAGE,
    payload: { thread_id: threadId.value, content },
    meta: { thread_id: threadId.value, content_preview: content.slice(0, 20) },
  })
  sessionStorage.removeItem(DRAFT_KEY)
  toast.success('已暫存，連線後自動送出')
  // 樂觀 UI append 訊息泡泡 + inline tag「等待同步」
  appendOptimisticMessage({ content, pending: true })
  // enqueue 後立刻 try flush 一次（緩解 LIFF eviction）
  flushParentQueue(OP_KINDS.PARENT_MESSAGE).catch(() => {})
}

onMounted(() => {
  // prefill 上次離線含附件時的文字草稿（spec §6.5）
  const draft = sessionStorage.getItem(DRAFT_KEY)
  if (draft) messageInput.value = draft
  flushParentQueue(OP_KINDS.PARENT_MESSAGE).catch(() => {})
})
```

對應 vitest（`src/parent/views/__tests__/MessageThreadView.test.ts`）：

```ts
it('offline 純文字 → enqueueParent 而非 sendThreadMessage', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
  const sendSpy = vi.fn()
  const enqueueSpy = vi.fn().mockResolvedValue({ id: 'op-1' })
  // mock api + parentOfflineQueue
  // mount + 觸發 submitMessage('hi')
  expect(sendSpy).not.toHaveBeenCalled()
  expect(enqueueSpy).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'parent_message',
    payload: expect.objectContaining({ content: 'hi' }),
  }))
})
```

跑 test 確認綠 → commit。

- [ ] **Step 2: ContactBookDetailView.vue 改造**

兩種 action：reply（CONTACT_BOOK_REPLY） + ack（CONTACT_BOOK_ACK）。

reply handler 套同樣 online/offline 分流：

```ts
async function submitReply(content: string) {
  if (navigator.onLine) {
    await replyContactBook(entryId.value, { content })
    return
  }
  await enqueueParent({
    kind: OP_KINDS.CONTACT_BOOK_REPLY,
    payload: { entry_id: entryId.value, content },
    meta: { entry_id: entryId.value, content_preview: content.slice(0, 20) },
  })
  toast.success('已暫存')
  flushParentQueue(OP_KINDS.CONTACT_BOOK_REPLY).catch(() => {})
}

async function submitAck() {
  if (navigator.onLine) {
    await ackContactBook(entryId.value)
    return
  }
  await enqueueParent({
    kind: OP_KINDS.CONTACT_BOOK_ACK,
    payload: { entry_id: entryId.value },
    meta: { entry_id: entryId.value },
  })
  toast.success('已暫存')
  flushParentQueue(OP_KINDS.CONTACT_BOOK_ACK).catch(() => {})
}

onMounted(() => {
  flushParentQueue(OP_KINDS.CONTACT_BOOK_REPLY).catch(() => {})
  flushParentQueue(OP_KINDS.CONTACT_BOOK_ACK).catch(() => {})
})
```

對應 vitest 2 個（reply / ack 各一）。

- [ ] **Step 3: ContactBookView.vue 改造（列表上的 ack）**

只有 ack 動作（在 entry 列表卡片上點「已讀」），改造 handler：

```ts
import { enqueueParent, flushParentQueue } from '@/parent/utils/parentOfflineQueue'
import { OP_KINDS } from '@/utils/offlineQueue'
import { onMounted } from 'vue'

async function quickAck(entryId: number) {
  if (navigator.onLine) {
    await ackContactBook(entryId)
    // ... 既有 list refresh
    return
  }
  await enqueueParent({
    kind: OP_KINDS.CONTACT_BOOK_ACK,
    payload: { entry_id: entryId },
    meta: { entry_id: entryId },
  })
  toast.success('已暫存')
  // 樂觀 UI：列表項加 pending tag
  markEntryPending(entryId)
  flushParentQueue(OP_KINDS.CONTACT_BOOK_ACK).catch(() => {})
}

onMounted(() => {
  flushParentQueue(OP_KINDS.CONTACT_BOOK_ACK).catch(() => {})
})
```

對應 vitest（`src/parent/views/__tests__/ContactBookView.test.ts`）：

```ts
it('offline ack → enqueueParent 而非 ackContactBook', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
  const ackSpy = vi.fn()
  const enqueueSpy = vi.fn().mockResolvedValue({ id: 'op-1' })
  // mock @/parent/api/contactBook + @/parent/utils/parentOfflineQueue
  // mount + 觸發 quickAck(123)
  expect(ackSpy).not.toHaveBeenCalled()
  expect(enqueueSpy).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'contact_book_ack',
    payload: { entry_id: 123 },
  }))
})
```

- [ ] **Step 4: EventAckView.vue 改造**

```ts
async function submitAck(payload: Record<string, unknown>) {
  // 含簽名 blob 路徑（uploadAckSignature）走線上路徑直送，不 queue
  const hasSignature = !!signatureBlob.value
  if (navigator.onLine) {
    await acknowledgeEvent(eventId.value, payload)
    if (hasSignature) await uploadAckSignature(eventId.value, studentId.value, signatureBlob.value!)
    return
  }
  if (hasSignature) {
    toast.warn('簽名上傳需連線，請稍後再試')
    return
  }
  await enqueueParent({
    kind: OP_KINDS.EVENT_ACK,
    payload: { event_id: eventId.value, ...payload },
    meta: { event_id: eventId.value },
  })
  toast.success('已暫存')
  flushParentQueue(OP_KINDS.EVENT_ACK).catch(() => {})
}
```

1 個 vitest（offline 無簽名 → enqueue）。

- [ ] **Step 5: LeavesView.vue 改造**

```ts
async function submitLeave(form: Record<string, unknown>) {
  const hasAttachment = leaveAttachmentFiles.value.length > 0
  if (navigator.onLine) {
    const res = await createLeave(form)
    if (hasAttachment) await uploadLeaveAttachment(res.data.id, leaveAttachmentFiles.value[0])
    return
  }
  if (hasAttachment) {
    toast.warn('附件上傳需連線，請稍後再試')
    return
  }
  await enqueueParent({
    kind: OP_KINDS.PARENT_LEAVE_REQUEST,
    payload: form,
    meta: { student_id: form.student_id, leave_type: form.leave_type },
  })
  toast.success('已暫存')
  flushParentQueue(OP_KINDS.PARENT_LEAVE_REQUEST).catch(() => {})
}
```

1 個 vitest。

- [ ] **Step 6: 跑全套 vitest 確認綠**

```bash
cd ivy-frontend
npm run test
npm run typecheck
npm run build
```

Expected: 全綠、0 typecheck error、build 成功。

- [ ] **Step 7: Commit 5 view（可分 5 commit 或 1 commit，依 implementer 偏好）**

建議**單一 commit** 因為都是同 pattern 重複套：

```bash
cd ivy-frontend
git add src/parent/views/MessageThreadView.vue \
        src/parent/views/ContactBookDetailView.vue \
        src/parent/views/ContactBookView.vue \
        src/parent/views/EventAckView.vue \
        src/parent/views/LeavesView.vue \
        src/parent/views/__tests__/*
git commit -m "feat(parent-offline): 5 view 接 enqueueParent 離線寫入

MessageThreadView (PARENT_MESSAGE) / ContactBookDetailView (CONTACT_BOOK_REPLY+ACK) /
ContactBookView (CONTACT_BOOK_ACK) / EventAckView (EVENT_ACK) / LeavesView (PARENT_LEAVE_REQUEST)
五個 view 改造 send handler：

- online → 直送（含附件路徑既有）
- offline + 含附件（含簽名 / 照片）→ toast 阻擋
- offline + 純文字 → enqueueParent 注 client_uuid + 樂觀 UI 顯示「等待同步」
- onMounted 各自 flushParentQueue(kind) 一次
- enqueue 後立刻 try flush 一次緩解 LIFF eviction

含 6 個 vitest（5 view × offline path + 1 ack）。

Spec：ivy-frontend/docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md §6.4

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 10: Acceptance 手測 §8.4 + 收尾

**屬性**：手測 + 撰寫 acceptance 報告。

**Files:**
- Create: `.scratch/parent-pwa-offline-acceptance-2026-05-26.md`

- [ ] **Step 1: 跑 5 條手測 §8.4**

確認 BE + FE 兩端都已 deploy（dev DB alembic upgrade head 過 + frontend npm run build dist 跑起或 dev server）。

5 條腳本逐一跑（spec §8.4）：

1. 飛航 → 開家長 App → 發 5 筆訊息 → Indicator 顯示「5 筆等待同步」
2. 解除飛航 → 自動 flush → 訊息送出、Indicator 消失
3. 飛航 → 發 1 筆 → 解除飛航前 kill app → 重開 → boot flush → 訊息送出
4. 線上發訊息 → BE 收到 → IndexedDB 不應有對應紀錄（不 enqueue）
5. 同 device LINE 換帳號 → A 的 pending 不被 B 送出、Indicator 顯示「其他帳號待同步」提示

Create `.scratch/parent-pwa-offline-acceptance-2026-05-26.md`：

```markdown
# Parent PWA Offline Acceptance — 2026-05-26

## §8.4 五條手測

| # | 腳本 | 結果 | Notes |
|---|---|---|---|
| 1 | 飛航 → 5 筆訊息 → Indicator 5 | | |
| 2 | 解除飛航 → 自動 flush | | |
| 3 | kill app + boot flush | | |
| 4 | 線上不 enqueue | | |
| 5 | 跨帳號 partition | | |

## 結論

[全綠 / 部分通過 / 未通過 + 列出 follow-up]
```

- [ ] **Step 2: 跑全套 BE + FE 測試零 regression 最終驗**

```bash
cd ivy-backend && pytest -x --ff
cd ../ivy-frontend && npm run test && npm run typecheck && npm run build
```

Expected: 既有 pre-existing fail 不變、沒新 regression、build 成功。

- [ ] **Step 3: 更新 spec 狀態**

Edit `ivy-frontend/docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md` header `Status` 從 `pending plan` 改為 `Phase 2 complete / pending merge`。

- [ ] **Step 4: 通知 user 手測 + merge 決策**

寫總結 message：列出 5 條腳本結果、acceptance 是否通過、是否準備好合 origin/main。**不主動 merge / push**（CLAUDE.md 規範未授權不 push）。

- [ ] **Step 5: Commit acceptance 報告**

acceptance 報告在 `.scratch/`，不入 git（`.gitignore` 擋）。只 commit spec status 更新：

```bash
cd ivy-frontend
git add docs/superpowers/specs/2026-05-26-parent-liff-pwa-offline-design.md
git commit -m "docs(parent): parent-liff-pwa-offline spec status → Phase 2 complete

5 條 acceptance 手測通過（見 .scratch/parent-pwa-offline-acceptance-2026-05-26.md）。
等 user merge + push origin。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## 結束清單

完成所有 task 後：

- [ ] BE 8 commits（migration / 3 endpoint / pytest）
- [ ] FE 7 commits（spec / spike / manifest / OP_KINDS / facade / Indicator / main.ts+layout / 5 view / acceptance）
- [ ] 全套 BE pytest 零 regression
- [ ] 全套 FE vitest + typecheck + build 零 regression
- [ ] Phase 0 spike report + Phase 2 acceptance report 在 `.scratch/`
- [ ] spec §10 已回填、status=Phase 2 complete
- [ ] worktree（若有開）清理（CLAUDE.md 規範）

User 接手：
- 合 BE + FE main / push origin
- 必要時通知 admin 注意 3 表 client_uuid 新欄位
- 觀察 Sentry 一週看 offline path 錯誤分佈
