# 教師端 Portal 大 polish — Phase 2 設計（簡化版，2026-05-06）

## 背景與重大方向修正

原 spec（`2026-05-06-teacher-portal-acd-optimization-design.md` Phase 2 章節）寫「Phase 2 將 PortalHomeView 重打為新 dashboard，新建 4 個子元件 + 後端 home N+1 修補 + 新增 today-todo 端點」。

**Phase 2 開工探索後發現原 spec 假設失準**：

- `src/views/portal/PortalHomeView.vue`（111 行）已是完整 dashboard 主檔
- 4 個子元件已存在且套用 Soft UI token：`PendingActionsCard`（131 行）/ `TodayShiftCard`（75 行）/ `ClassroomOpsCard`（139 行）/ `QuickLinksCard`（79 行）
- `usePortalDashboard.js`（69 行）composable + Pinia store `usePortalDashboardStore` + cross-page invalidate event 機制都已建立
- 既有 `PendingActionsCard` 5 種待辦（unread_messages / pending_substitute / pending_swap / pending_anomaly_confirms / unread_announcements）已涵蓋原 spec 想做的 4 種
- 既有 `ClassroomOpsCard` 已用後端回傳的 `contact_book.percentage / draft / missing` 欄位

**結論**：保留既有實作不重打，避免浪費 + 規避回歸風險。

## 真正要做（兩件事）

1. **後端 `_classroom_card` N+1 修補**（必做、效能瓶頸）
2. **前端 dashboard 補 vitest 測試**（必做、phase 1 把 dashboard 改為入口後，main 上首次 dashboard 測試覆蓋）

## YAGNI 砍掉（原 spec 寫但不做）

| 原 spec 項目 | 砍掉原因 |
|---|---|
| 新建 HomeHeroCard / TodoCenter / ClassroomSummaryGrid / QuickActions | 既有 4 子元件等價，重複實作 |
| 新增 `/portal/home/today-todo` 端點 | 既有 `/home/summary` 已有 `actions` 物件涵蓋 |
| 新增 `pending_contact_book_today` 欄位 | 既有 `contact_book.draft` / `.missing` 等欄位已足夠，前端可推導 |
| 新增 `todo_count` 彙總欄位 | 前端用既有 actions 物件 sum 即可，無實質效益 |
| Hero card 新增 | 既有 `home-header` 含 greeting + 重整按鈕，視覺夠用 |

---

## 後端範圍

### `_classroom_card` 現況（api/portal/home.py:64-110）

每班 `_classroom_card()` 觸發以下 query：

1. `count(Student WHERE classroom_id = ? AND is_active)`
2. `compute_class_completion()` — 內含 roster + draft + published count
3. `count(StudentDismissalCall WHERE classroom_id = ? AND status='pending')`
4. `has_attendance_today()` — 至少 1 query
5. `compute_consecutive_absences()` — service 內 query
6. `compute_upcoming_birthdays()` — service 內 query
7. `compute_allergy_alerts()` — service 內 query
8. `count_pending_medications()` — service 內 query

**總計**：每班 8-10 query。3 班教師 ≈ 24-30 query；4 班 ≈ 32-40 query。

### 修補策略

把「迴圈內 N 次 query」改為「一次 query 涵蓋全班級 IDs」：

| 欄位 | Batch 化策略 |
|---|---|
| `student_count` | `SELECT classroom_id, COUNT(*) FROM students WHERE classroom_id IN (?,?,...) AND is_active GROUP BY classroom_id` → dict[classroom_id, count] |
| `pending_dismissal_calls` | 同上模式：`GROUP BY classroom_id` |
| `attendance_called_today` | service `has_attendance_today` 改成接收 `classroom_ids: list[int]` 一次 query → dict[classroom_id, bool] |
| `consecutive_absences` | service 改 batch 接受 `classroom_ids` |
| `upcoming_birthdays_7d` | service 改 batch 接受 `classroom_ids` |
| `allergy_alerts` | service 改 batch 接受 `classroom_ids` |
| `pending_medications_today` | service 改 batch 接受 `classroom_ids` |
| `compute_class_completion` | service 改 batch（最複雜，含 join Student × StudentContactBookEntry） |

### 服務層改動規範

每個 `compute_*` / `has_*` / `count_*` 函式新增 batch overload：

```python
# 既有 single signature 保留（向後相容，但 endpoint 不再用）
def compute_consecutive_absences(session, classroom_id: int, today: date) -> int: ...

# 新增 batch signature
def compute_consecutive_absences_batch(
    session, classroom_ids: list[int], today: date
) -> dict[int, int]: ...
```

或者：擴充原函式接受 `int | list[int]` 並回傳 dict 或 int（依輸入型別）。**選後者**，避免暴增 8 個 _batch 函式，但每個函式內部必走 IN clause + GROUP BY。

`_classroom_card` 改成接收預先計算好的 batch dicts，純做組裝：

```python
def _classroom_card(classroom, today, batches: dict) -> dict:
    cid = classroom.id
    return {
        "classroom_id": cid,
        "classroom_name": classroom.name,
        "student_count": batches["student_count"].get(cid, 0),
        "contact_book": batches["completion"][cid],  # already dict
        ...
    }
```

`get_home_summary` endpoint 在 classrooms 列出後，依 classroom_ids 一次取所有 batch，再 `[_classroom_card(c, today, batches) for c in classrooms]`。

### 預期收益

- 4 班教師：32-40 query → ~10 query（roster + 8 batch + 自己的 attendance/leave 等）
- 響應延遲：估 1-2s → < 300ms

### 後端測試（pytest）

新增於 `tests/test_portal_home.py` 的 `TestHomeSummary`：

```python
def test_classroom_cards_query_count_under_5_for_4_classrooms(
    self, home_client, db_session, factory_helpers
):
    """4 班場景下，_classroom_card batch 化後，總 query 數應 < 12（baseline 32-40）。"""
    teacher = factory_helpers.make_teacher_with_classrooms(n=4, students_per_class=15)
    factory_helpers.add_dismissal_calls_for(teacher, count=3)
    factory_helpers.add_contact_book_entries_for(teacher)

    with count_queries(db_session) as counter:
        resp = home_client(teacher).get("/portal/home/summary")
    assert resp.status_code == 200
    payload = resp.json()
    assert len(payload["classrooms"]) == 4
    # 預期 batch 後總 query <= 12（含 roster query + 8 batch + few outer queries）
    assert counter.total <= 12, f"query count regressed: {counter.total}"
```

`count_queries` helper 若不存在，加在 `tests/conftest.py` 利用 SQLAlchemy event listener。

---

## 前端範圍

**目標**：phase 1 已把 dashboard 改為 `/portal` 預設入口，但既有 dashboard 4 子元件 + composable + store 全無測試。Phase 2 補測試守護回歸。

### 測試清單（vitest）

| 測試檔 | 對應檔 | 重點 case |
|---|---|---|
| `tests/unit/components/portal/home/PendingActionsCard.test.js` | PendingActionsCard.vue | 5 種 tile render、is-empty 樣式、點擊 router push |
| `tests/unit/components/portal/home/TodayShiftCard.test.js` | TodayShiftCard.vue | 有班次 / 無班次 render、anomaly 標示 |
| `tests/unit/components/portal/home/ClassroomOpsCard.test.js` | ClassroomOpsCard.vue | percentage 計算顯示、pending dismissal 紅標、無學生空狀態 |
| `tests/unit/components/portal/home/QuickLinksCard.test.js` | QuickLinksCard.vue | links 列表 render、點擊跳路由 |
| `tests/unit/composables/usePortalDashboard.test.js` | usePortalDashboard.js | autoFetch / refresh / invalidate event 訂閱 |
| `tests/unit/stores/portalDashboard.test.js` | stores/portalDashboard.js | fetchSummary / invalidate / state shape |
| `tests/unit/views/PortalHomeView.test.js` | PortalHomeView.vue | greeting 邏輯、loading skeleton、error banner、refresh 觸發 |

預期新增測試 30-40 條，覆蓋 dashboard 全鏈路。

### 測試實作要點

- 對 Pinia store：用 `setActivePinia(createPinia())` 隔離 + mock fetch API
- 對 composable：mock store + mock `window.dispatchEvent` 驗 invalidate listener
- 對元件：mount with stub child + mock router

---

## Branch / PR 策略

| 階段 | Branch | Repo |
|---|---|---|
| 後端 | `feat/teacher-acd-v1-2-home-dashboard-be` | ivy-backend |
| 前端 | `feat/teacher-acd-v1-2-home-dashboard` | ivy-frontend |

**順序**：
1. 後端 branch 從 `origin/main`（後端 main）開分支 → batch 化 + pytest 通過 → push 開 PR
2. 後端 PR merge 後（或 review 中），前端 branch 從 `feat/teacher-acd-v1-1-foundation` 出發（stack 在 phase 1 之上）→ 補測試 → push
3. Phase 1 frontend PR merge 後，Phase 2 frontend rebase main 重新 push

**worktree**：
- 後端：`/Users/yilunwu/Desktop/ivy-backend/.worktrees/teacher-acd-2-be`
- 前端：複用 `/Users/yilunwu/Desktop/ivy-frontend/.worktrees/teacher-acd-1` 切新 branch（共用 worktree）或新建 `.worktrees/teacher-acd-2`

**選 worktree 共用**：節省 npm install 時間，phase 1 work 已在那個 worktree。

---

## 驗收標準

### 後端

- [ ] `_classroom_card` 改為 batch query 模式
- [ ] 8 個 service 函式（compute_consecutive_absences / compute_upcoming_birthdays / compute_allergy_alerts / count_pending_medications / has_attendance_today / compute_class_completion 等）擴充 list 接收 + dict 回傳
- [ ] pytest 既有全綠
- [ ] 新增 `test_classroom_cards_query_count_under_5_for_4_classrooms` 通過（4 班 query < 12）
- [ ] `/portal/home/summary` 回應 schema 不變（前端不需改）

### 前端

- [ ] 7 個新測試檔全綠
- [ ] 既有 798 vitest 全綠
- [ ] dashboard 4 子元件 + composable + store + view 行為不變

---

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| service 函式 batch 化遺漏邊界（空班級、IN 空 list） | 每個 service 函式必加 unit test：空 list 回 `{}`、單班 / 多班 / 學生 0 / 學生 N |
| `compute_class_completion` batch 最複雜（含 join），可能 query 比想像多 | 必跑 query count assertion + 看 SQL log |
| 前端測試 mock 不足，誤抓既有 bug 為「正確行為」 | reviewer 必對照 dashboard 實際行為對照 test 期望 |
| 後端 PR 還沒 merge 時前端 stack 衝突 | phase 2 前端 branch 從 phase 1 head 出發，phase 1 merge 後 rebase main，後端 schema 不影響前端 stack |

---

## 預估工作量

- 後端：~6-8 小時（8 個 service 函式 batch 化 + pytest）
- 前端：~3-4 小時（7 個測試檔）
- 總計：~1-1.5 天

比原 spec（3-5 天）大幅縮減。
