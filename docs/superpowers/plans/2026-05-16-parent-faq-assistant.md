# 家長端常春藤小幫手（規則式 FAQ）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在家長端新增「常春藤小幫手」入口，提供規則式 FAQ + 模糊搜尋的聊天式體驗，零 LLM、零外部呼叫。

**Architecture:** 後端 FastAPI 提供 `GET /api/parent/assistant/faq`，讀取 `data/parent_faq.json` 並用 mtime in-memory cache。前端 Vue 3 SPA 新增 `/assistant` 路由，重新組合既有訊息氣泡視覺（用新元件 `AssistantBubble.vue`），搜尋採前端純 JS 模糊配對。

**Tech Stack:**
- Backend: FastAPI、Pydantic、pytest
- Frontend: Vue 3 (Composition API)、Vite、Vitest、marked（新增）、DOMPurify（新增）
- 兩個 git worktree：
  - 前端：`/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/parent-faq-assistant/`（分支 `feat/parent-faq-assistant`）
  - 後端：`/Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/parent-faq-assistant/`（分支 `feat/parent-faq-assistant`）

**Spec：** `docs/superpowers/specs/2026-05-16-parent-faq-assistant-design.md`

**Spec 偏離記錄：**
- Spec § 6.1 提到「重用既有 MessageBubble.vue」。經評估後 `MessageBubble.vue` 過度耦合於 message 模型（attachments、recall、sender_role）。改建立獨立 `AssistantBubble.vue`，視覺風格沿用即可。Spec acceptance criteria 不變。

---

## 檔案結構

### 後端（worktree：`ivy-backend/.claude/worktrees/parent-faq-assistant/`）

| 路徑 | 角色 | 動作 |
|---|---|---|
| `data/parent_faq.json` | FAQ 內容（30 條初始） | 新增 |
| `schemas/parent_assistant.py` | Pydantic schemas | 新增 |
| `services/parent_assistant_service.py` | JSON 載入 + mtime cache | 新增 |
| `api/parent_portal/assistant.py` | FastAPI router | 新增 |
| `api/parent_portal/__init__.py` | 註冊 router | 修改 |
| `tests/test_parent_assistant_service.py` | service 單元測試 | 新增 |
| `tests/test_parent_assistant_api.py` | API 整合測試 | 新增 |

### 前端（worktree：`ivy-frontend/.claude/worktrees/parent-faq-assistant/`）

| 路徑 | 角色 | 動作 |
|---|---|---|
| `package.json` | 加入 `marked` + `dompurify` | 修改 |
| `src/parent/api/assistant.js` | API client（**注意：放 parent/api/，非根 src/api/**） | 新增 |
| `src/parent/composables/useFaq.js` | 載入 FAQ + sessionStorage | 新增 |
| `src/parent/composables/useFaqSearch.js` | 模糊搜尋 | 新增 |
| `src/parent/components/assistant/AssistantBubble.vue` | 對話氣泡（共用） | 新增 |
| `src/parent/components/assistant/CategoryChip.vue` | 分類 chip | 新增 |
| `src/parent/components/assistant/QuestionChip.vue` | 問題 chip | 新增 |
| `src/parent/components/assistant/FaqAnswer.vue` | 答案氣泡 + CTA | 新增 |
| `src/parent/components/assistant/AssistantSearch.vue` | 搜尋框 | 新增 |
| `src/parent/components/assistant/TypingIndicator.vue` | typing 動畫 | 新增 |
| `src/parent/views/AssistantView.vue` | 主頁 | 新增 |
| `src/parent/router.js` | 註冊 `/assistant` 路由 | 修改 |
| `src/parent/views/MoreView.vue` | 加入入口項目 | 修改 |
| `tests/unit/parent/composables/useFaqSearch.test.js` | 搜尋測試 | 新增 |
| `tests/unit/parent/composables/useFaq.test.js` | 載入測試 | 新增 |

---

## Phase 1 — 後端

### Task 1：建立 FAQ JSON 檔（30 條 placeholder）

**Files:**
- Create: `data/parent_faq.json`

工作目錄：`/Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/parent-faq-assistant`

- [ ] **Step 1：建立 `data/parent_faq.json`**

```json
{
  "version": "1.0.0",
  "updated_at": "2026-05-16",
  "categories": [
    { "id": "leave",    "label": "請假",   "icon": "event_busy",     "color": "#f59e0b" },
    { "id": "fees",     "label": "繳費",   "icon": "payments",       "color": "#0d9053" },
    { "id": "pickup",   "label": "接送",   "icon": "directions_bus", "color": "#3b82f6" },
    { "id": "activity", "label": "活動",   "icon": "celebration",    "color": "#ec4899" },
    { "id": "health",   "label": "健康",   "icon": "favorite",       "color": "#ef4444" },
    { "id": "admin",    "label": "行政",   "icon": "info",           "color": "#6b7280" }
  ],
  "items": [
    { "id": "leave-how-to-apply", "category": "leave", "question": "請假怎麼申請？", "keywords": ["請假", "病假", "事假", "請假流程"], "answer": "請點下方「去請假」按鈕，選擇日期與假別後送出即可，老師會收到通知並核准。", "action": { "type": "route", "label": "去請假", "path": "/leaves" } },
    { "id": "leave-sick-note", "category": "leave", "question": "請病假需要附診斷證明嗎？", "keywords": ["診斷", "證明", "病假"], "answer": "請假 3 日以上建議附醫療院所診斷證明，於請假表單中可拍照上傳。", "action": { "type": "route", "label": "去請假", "path": "/leaves" } },
    { "id": "leave-when-to-apply", "category": "leave", "question": "請假最晚要什麼時候送出？", "keywords": ["請假", "截止", "時間"], "answer": "建議於當天 8:30 前送出，以利老師掌握出席。緊急情況也可隨時補請。" },
    { "id": "leave-half-day", "category": "leave", "question": "可以請半天嗎？", "keywords": ["半天", "請假"], "answer": "可以。在請假表單選擇「上午」或「下午」即可。" },
    { "id": "leave-cancel", "category": "leave", "question": "請假後可以取消嗎？", "keywords": ["取消", "請假", "撤銷"], "answer": "已送出但尚未開始的請假可在「請假」頁面長按該筆紀錄取消。", "action": { "type": "route", "label": "去請假", "path": "/leaves" } },

    { "id": "fees-payment-method", "category": "fees", "question": "月費怎麼繳？", "keywords": ["繳費", "月費", "ATM", "轉帳"], "answer": "請於本 App 內查看當月應繳金額，並依指定銀行帳號轉帳。繳費明細請見「繳費」頁。", "action": { "type": "route", "label": "去繳費", "path": "/fees" } },
    { "id": "fees-receipt", "category": "fees", "question": "可以申請收據嗎？", "keywords": ["收據", "發票"], "answer": "可至「繳費」頁該筆紀錄點選「下載收據」，會以 PDF 開啟。", "action": { "type": "route", "label": "去繳費", "path": "/fees" } },
    { "id": "fees-due-date", "category": "fees", "question": "月費什麼時候到期？", "keywords": ["到期", "繳費", "期限"], "answer": "每月 10 日為當月月費截止日，逾期請聯絡園所行政。" },
    { "id": "fees-late", "category": "fees", "question": "我忘記繳費怎麼辦？", "keywords": ["逾期", "忘記", "繳費"], "answer": "請儘速完成繳款並通知行政人員，園所會協助核對。", "action": { "type": "contact_teacher", "label": "聯絡老師" } },
    { "id": "fees-discount", "category": "fees", "question": "兄弟姊妹同園有優惠嗎？", "keywords": ["優惠", "兄弟", "姊妹", "減免"], "answer": "本園提供手足同園優惠，詳情請洽行政人員。", "action": { "type": "contact_teacher", "label": "聯絡老師" } },

    { "id": "pickup-time", "category": "pickup", "question": "接送時間是幾點？", "keywords": ["接送", "時間", "上學", "放學"], "answer": "正常班放學時間 16:00；課後留園至 18:00。詳細時段以園所公告為準。" },
    { "id": "pickup-late", "category": "pickup", "question": "晚到接小孩怎麼辦？", "keywords": ["晚到", "遲", "接"], "answer": "請提前透過「聯絡老師」告知，園方會安排照看。", "action": { "type": "contact_teacher", "label": "聯絡老師" } },
    { "id": "pickup-by-others", "category": "pickup", "question": "可以請其他家人代接嗎？", "keywords": ["代接", "委託", "他人"], "answer": "請預先在家長 App 內登記代接人員姓名與身分證末四碼，老師會於放學時核對。" },
    { "id": "pickup-bus", "category": "pickup", "question": "有提供接送車服務嗎？", "keywords": ["娃娃車", "校車", "接送車"], "answer": "本園提供部分路線校車服務，路線與費用請洽行政。", "action": { "type": "contact_teacher", "label": "聯絡老師" } },
    { "id": "pickup-typhoon", "category": "pickup", "question": "颱風天會放假嗎？", "keywords": ["颱風", "放假", "天災"], "answer": "依縣市政府公告為準。園所亦會在 App 內發布公告通知。" },

    { "id": "activity-list", "category": "activity", "question": "最近有哪些活動？", "keywords": ["活動", "行程", "事件"], "answer": "請至「本週行程」頁面查看本週活動，公告會即時推播。", "action": { "type": "route", "label": "看行程", "path": "/calendar" } },
    { "id": "activity-signup", "category": "activity", "question": "活動怎麼報名？", "keywords": ["報名", "活動", "簽閱"], "answer": "於「事件簽閱」頁面，點該筆活動完成簽閱與報名即可。", "action": { "type": "route", "label": "去簽閱", "path": "/events" } },
    { "id": "activity-fee", "category": "activity", "question": "活動要額外付費嗎？", "keywords": ["活動", "費用", "報名費"], "answer": "部分活動需另付費用，金額會於活動詳情中註明。" },
    { "id": "activity-cancel", "category": "activity", "question": "活動可以取消報名嗎？", "keywords": ["取消", "報名", "活動"], "answer": "活動開始前可於簽閱頁面取消。已開始或已逾期的活動請洽老師。" },
    { "id": "activity-photo", "category": "activity", "question": "活動照片在哪看？", "keywords": ["照片", "活動", "相簿"], "answer": "活動結束後 3-7 日內，照片會上傳至「相簿」頁面。" },

    { "id": "health-medication", "category": "health", "question": "可以託老師餵藥嗎？", "keywords": ["藥", "餵藥", "用藥", "用藥單"], "answer": "請填寫「用藥單」並將藥品交給老師，需附醫師處方或藥袋說明。", "action": { "type": "route", "label": "填用藥單", "path": "/medications" } },
    { "id": "health-fever", "category": "health", "question": "孩子發燒了要怎麼通知？", "keywords": ["發燒", "生病", "通知"], "answer": "請先請假並透過「聯絡老師」說明症狀，老師會留意觀察。", "action": { "type": "contact_teacher", "label": "聯絡老師" } },
    { "id": "health-allergy", "category": "health", "question": "孩子有過敏要怎麼告知？", "keywords": ["過敏", "食物", "藥物"], "answer": "請至「孩子資料」頁面更新過敏資訊，園所會同步至餐點與用藥流程。" },
    { "id": "health-meal", "category": "health", "question": "今天午餐吃什麼？", "keywords": ["午餐", "點心", "菜單"], "answer": "本週菜單會於每週一早上發布在公告中。" },
    { "id": "health-nap", "category": "health", "question": "午睡時間是幾點？", "keywords": ["午睡", "作息"], "answer": "午睡時段為 12:30 – 14:30。若孩子作息特殊，請告知老師。" },

    { "id": "admin-contact", "category": "admin", "question": "怎麼聯絡老師？", "keywords": ["聯絡", "老師", "訊息"], "answer": "點下方「聯絡老師」可進入訊息頁，與班導即時溝通。", "action": { "type": "contact_teacher", "label": "聯絡老師" } },
    { "id": "admin-bind-child", "category": "admin", "question": "怎麼加綁第二個孩子？", "keywords": ["加綁", "子女", "綁定"], "answer": "請至「更多」→「加綁子女」並輸入園所提供的綁定碼。", "action": { "type": "route", "label": "去加綁", "path": "/bind-additional" } },
    { "id": "admin-update-info", "category": "admin", "question": "聯絡電話換了要怎麼更新？", "keywords": ["電話", "更新", "資料"], "answer": "請至「孩子資料」頁面編輯緊急聯絡資訊。" },
    { "id": "admin-line-bind", "category": "admin", "question": "LINE 沒收到通知怎麼辦？", "keywords": ["LINE", "通知", "推播"], "answer": "請至「通知偏好」確認 LINE 已綁定且開啟通知。", "action": { "type": "route", "label": "通知設定", "path": "/notifications/preferences" } },
    { "id": "admin-logout", "category": "admin", "question": "怎麼登出？", "keywords": ["登出", "切換帳號"], "answer": "於「更多」頁底部點「登出」按鈕。" }
  ]
}
```

- [ ] **Step 2：驗證 JSON 合法**

```bash
python -c "import json; json.load(open('data/parent_faq.json', encoding='utf-8'))"
```
Expected：無輸出（無 exception）

- [ ] **Step 3：Commit**

```bash
git add data/parent_faq.json
git commit -m "feat: 新增家長端 FAQ 資料檔（30 條 placeholder）"
```

---

### Task 2：Pydantic Schemas

**Files:**
- Create: `schemas/parent_assistant.py`

工作目錄：`/Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/parent-faq-assistant`

- [ ] **Step 1：建立 schemas 檔**

```python
# schemas/parent_assistant.py
"""家長端 FAQ 助手相關 schemas。"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class FaqAction(BaseModel):
    """FAQ 答案附帶的 CTA 動作。"""
    type: Literal["route", "contact_teacher", "external"]
    label: str
    path: Optional[str] = None       # route 用
    url: Optional[str] = None        # external 用


class FaqCategory(BaseModel):
    id: str
    label: str
    icon: str
    color: str


class FaqItem(BaseModel):
    id: str
    category: str
    question: str
    keywords: list[str] = Field(default_factory=list)
    answer: str
    action: Optional[FaqAction] = None


class FaqResponse(BaseModel):
    version: str
    updated_at: str
    categories: list[FaqCategory]
    items: list[FaqItem]
```

- [ ] **Step 2：Commit**

```bash
git add schemas/parent_assistant.py
git commit -m "feat: 新增家長端 FAQ 助手 Pydantic schemas"
```

---

### Task 3：Service with mtime cache（TDD）

**Files:**
- Create: `services/parent_assistant_service.py`
- Test: `tests/test_parent_assistant_service.py`

工作目錄：`/Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/parent-faq-assistant`

- [ ] **Step 1：撰寫失敗測試**

```python
# tests/test_parent_assistant_service.py
"""ParentAssistantService 測試：載入 + mtime cache。"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def temp_faq(tmp_path, monkeypatch):
    """產生臨時 FAQ 檔，把 service 的 _path 指向它。"""
    from services import parent_assistant_service as mod

    faq_path = tmp_path / "parent_faq.json"
    faq_path.write_text(
        json.dumps(
            {
                "version": "1.0.0",
                "updated_at": "2026-05-16",
                "categories": [
                    {"id": "leave", "label": "請假", "icon": "x", "color": "#000"}
                ],
                "items": [
                    {
                        "id": "leave-1",
                        "category": "leave",
                        "question": "Q?",
                        "keywords": [],
                        "answer": "A",
                    }
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    # 重設 class-level cache 並指到臨時檔
    mod.ParentAssistantService._cache = None
    mod.ParentAssistantService._cached_mtime = None
    monkeypatch.setattr(mod.ParentAssistantService, "_path", faq_path)
    return faq_path


def test_first_call_loads_file(temp_faq):
    from services.parent_assistant_service import ParentAssistantService

    data = ParentAssistantService.get_faq()
    assert data["version"] == "1.0.0"
    assert data["items"][0]["id"] == "leave-1"


def test_repeated_call_does_not_reload_when_mtime_unchanged(temp_faq, monkeypatch):
    from services import parent_assistant_service as mod

    mod.ParentAssistantService.get_faq()  # warm cache
    call_count = {"n": 0}
    original_open = Path.open

    def spy_open(self, *args, **kwargs):
        if self == temp_faq:
            call_count["n"] += 1
        return original_open(self, *args, **kwargs)

    monkeypatch.setattr(Path, "open", spy_open)
    mod.ParentAssistantService.get_faq()
    assert call_count["n"] == 0, "mtime 未變不應重讀"


def test_reload_when_mtime_changes(temp_faq):
    from services.parent_assistant_service import ParentAssistantService

    ParentAssistantService.get_faq()
    # 改檔 + 推進 mtime
    new_payload = {
        "version": "2.0.0",
        "updated_at": "2026-05-17",
        "categories": [],
        "items": [],
    }
    temp_faq.write_text(json.dumps(new_payload), encoding="utf-8")
    new_mtime = temp_faq.stat().st_mtime + 1
    os.utime(temp_faq, (new_mtime, new_mtime))

    data = ParentAssistantService.get_faq()
    assert data["version"] == "2.0.0"


def test_invalid_json_raises(temp_faq):
    from services.parent_assistant_service import ParentAssistantService

    temp_faq.write_text("not json", encoding="utf-8")
    new_mtime = temp_faq.stat().st_mtime + 1
    os.utime(temp_faq, (new_mtime, new_mtime))

    with pytest.raises(json.JSONDecodeError):
        ParentAssistantService.get_faq()
```

- [ ] **Step 2：執行測試確認失敗**

```bash
cd /Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/parent-faq-assistant
python -m pytest tests/test_parent_assistant_service.py -v
```
Expected：4 個測試 FAIL（`ModuleNotFoundError: services.parent_assistant_service`）

- [ ] **Step 3：實作 service**

```python
# services/parent_assistant_service.py
"""家長端 FAQ 助手 service：載入 JSON 並以 mtime 做 in-memory cache。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import ClassVar, Optional


class ParentAssistantService:
    """讀取 data/parent_faq.json，以檔案 mtime 偵測變動並 cache 解析結果。

    Why: 園所偶爾會編輯 FAQ 檔（不重啟服務）；mtime 比較足夠輕量。
    """

    _cache: ClassVar[Optional[dict]] = None
    _cached_mtime: ClassVar[Optional[float]] = None
    _path: ClassVar[Path] = (
        Path(__file__).resolve().parent.parent / "data" / "parent_faq.json"
    )

    @classmethod
    def get_faq(cls) -> dict:
        mtime = cls._path.stat().st_mtime
        if cls._cache is None or mtime != cls._cached_mtime:
            with cls._path.open(encoding="utf-8") as f:
                cls._cache = json.load(f)
            cls._cached_mtime = mtime
        return cls._cache
```

- [ ] **Step 4：執行測試確認全綠**

```bash
python -m pytest tests/test_parent_assistant_service.py -v
```
Expected：4 PASS

- [ ] **Step 5：Commit**

```bash
git add services/parent_assistant_service.py tests/test_parent_assistant_service.py
git commit -m "feat: 新增 ParentAssistantService 與 mtime cache 測試"
```

---

### Task 4：API endpoint

**Files:**
- Create: `api/parent_portal/assistant.py`

工作目錄：`/Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/parent-faq-assistant`

- [ ] **Step 1：建立 router 檔**

```python
# api/parent_portal/assistant.py
"""家長端 FAQ 助手 endpoints（前綴 /assistant）。

只提供唯讀 GET /faq，回傳全部 FAQ 內容（含分類）。所有家長皆可存取，
但仍掛 require_parent_role 以保持與其他 parent_portal 端點一致。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from schemas.parent_assistant import FaqResponse
from services.parent_assistant_service import ParentAssistantService
from utils.auth import require_parent_role

router = APIRouter(prefix="/assistant", tags=["parent-assistant"])


@router.get("/faq", response_model=FaqResponse)
def get_faq(
    response: Response,
    current_user: dict = Depends(require_parent_role()),
) -> FaqResponse:
    response.headers["Cache-Control"] = "private, max-age=300"
    return FaqResponse.model_validate(ParentAssistantService.get_faq())
```

- [ ] **Step 2：Commit**

```bash
git add api/parent_portal/assistant.py
git commit -m "feat: 新增 GET /api/parent/assistant/faq 端點"
```

---

### Task 5：註冊 router + 整合測試

**Files:**
- Modify: `api/parent_portal/__init__.py`
- Test: `tests/test_parent_assistant_api.py`

工作目錄：`/Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/parent-faq-assistant`

- [ ] **Step 1：在 `api/parent_portal/__init__.py` 加入 import 與 include**

在既有 `from .profile import router as profile_router` 之後加：

```python
from .assistant import router as assistant_router
```

並在 `parent_router.include_router(...)` 區塊中加（建議放最後）：

```python
parent_router.include_router(assistant_router)
```

- [ ] **Step 2：撰寫整合測試**

```python
# tests/test_parent_assistant_api.py
"""GET /api/parent/assistant/faq 整合測試。"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import models.base as base_module
from api.parent_portal import parent_router
from models.database import Base, Guardian, User
from utils.auth import create_access_token


@pytest.fixture
def parent_client(tmp_path, monkeypatch):
    db_path = tmp_path / "assistant.sqlite"
    db_engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )
    sf = sessionmaker(bind=db_engine)
    old_engine, old_sf = base_module._engine, base_module._SessionFactory
    base_module._engine = db_engine
    base_module._SessionFactory = sf
    Base.metadata.create_all(db_engine)

    # 建一位家長
    with sf() as s:
        u = User(name="家長 A", role="parent", line_user_id="L-test", email=None)
        s.add(u); s.flush()
        g = Guardian(user_id=u.id, relation="parent")
        s.add(g); s.commit()
        token = create_access_token({"sub": str(u.id), "role": "parent"})

    # 重定向 FAQ 檔到 tmp，避免依賴正式檔
    from services import parent_assistant_service as svc
    faq_path = tmp_path / "parent_faq.json"
    faq_path.write_text(json.dumps({
        "version": "9.9.9",
        "updated_at": "2026-05-16",
        "categories": [
            {"id": "leave", "label": "請假", "icon": "x", "color": "#000"}
        ],
        "items": [
            {"id": "x", "category": "leave", "question": "Q?", "keywords": [], "answer": "A"}
        ],
    }, ensure_ascii=False), encoding="utf-8")
    svc.ParentAssistantService._cache = None
    svc.ParentAssistantService._cached_mtime = None
    monkeypatch.setattr(svc.ParentAssistantService, "_path", faq_path)

    app = FastAPI()
    app.include_router(parent_router)
    client = TestClient(app)
    client.headers.update({"Authorization": f"Bearer {token}"})
    yield client

    base_module._engine, base_module._SessionFactory = old_engine, old_sf


def test_get_faq_returns_data(parent_client):
    r = parent_client.get("/api/parent/assistant/faq")
    assert r.status_code == 200
    body = r.json()
    assert body["version"] == "9.9.9"
    assert body["items"][0]["id"] == "x"
    assert body["categories"][0]["label"] == "請假"


def test_get_faq_requires_auth():
    """未帶 token 應 401。"""
    app = FastAPI()
    app.include_router(parent_router)
    client = TestClient(app)
    r = client.get("/api/parent/assistant/faq")
    assert r.status_code == 401


def test_get_faq_sets_cache_header(parent_client):
    r = parent_client.get("/api/parent/assistant/faq")
    assert "private" in r.headers.get("Cache-Control", "")
    assert "max-age=300" in r.headers.get("Cache-Control", "")
```

- [ ] **Step 3：執行測試確認全綠**

```bash
python -m pytest tests/test_parent_assistant_api.py -v
```
Expected：3 PASS

- [ ] **Step 4：Commit**

```bash
git add api/parent_portal/__init__.py tests/test_parent_assistant_api.py
git commit -m "feat: 註冊 parent assistant router 並加整合測試"
```

---

### Task 6：後端整體回歸測試

工作目錄：`/Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/parent-faq-assistant`

- [ ] **Step 1：跑全部測試確認沒打壞既有功能**

```bash
python -m pytest tests/ -x -q
```
Expected：原有測試全綠 + 新增 7 個測試全綠

如果原本就有失敗的測試（非本次相關），記錄下來但不阻擋繼續。

---

## Phase 2 — 前端 dependencies

### Task 7：安裝 markdown renderer

**Files:**
- Modify: `package.json`、`package-lock.json`

工作目錄：`/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/parent-faq-assistant`

- [ ] **Step 1：安裝 marked 與 dompurify**

```bash
npm install marked dompurify
```

- [ ] **Step 2：跑 audit 確認無 moderate+ 漏洞**

```bash
npm audit --production --audit-level=moderate
```
Expected：no vulnerabilities found（依 CLAUDE.md 規範 CI 會 enforce）

- [ ] **Step 3：Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 安裝 marked + dompurify 供家長端 FAQ 答案渲染"
```

---

## Phase 3 — 前端資料層

### Task 8：API client

**Files:**
- Create: `src/parent/api/assistant.js`

工作目錄：`/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/parent-faq-assistant`

> **重要**：家長端 axios instance 在 `src/parent/api/index.js`（與根 `src/api/index.js` 是兩個不同實例：401 redirect 行為不同）。**家長端 API 一律放 `src/parent/api/`**。

- [ ] **Step 1：建立 API client**

```js
// src/parent/api/assistant.js
/**
 * 家長端 FAQ 助手 API。
 */
import api from './index'

export const getFaq = () => api.get('/parent/assistant/faq').then(r => r.data)
```

- [ ] **Step 2：Commit**

```bash
git add src/parent/api/assistant.js
git commit -m "feat: 新增家長端 FAQ assistant API client（getFaq）"
```

---

### Task 9：useFaq composable（TDD）

**Files:**
- Create: `src/parent/composables/useFaq.js`
- Test: `tests/unit/parent/composables/useFaq.test.js`

工作目錄：`/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/parent-faq-assistant`

- [ ] **Step 1：撰寫失敗測試**

```js
// tests/unit/parent/composables/useFaq.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const SAMPLE = {
  version: '1.0.0',
  updated_at: '2026-05-16',
  categories: [{ id: 'leave', label: '請假', icon: 'x', color: '#000' }],
  items: [{ id: 'a', category: 'leave', question: 'Q', keywords: [], answer: 'A' }],
}

vi.mock('@/parent/api/assistant', () => ({
  getFaq: vi.fn(() => Promise.resolve(SAMPLE)),
}))

beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
})

describe('useFaq', () => {
  it('首次呼叫會 fetch 並寫入 sessionStorage', async () => {
    const { useFaq } = await import('@/parent/composables/useFaq')
    const { getFaq } = await import('@/parent/api/assistant')

    const { load, faq } = useFaq()
    await load()
    expect(getFaq).toHaveBeenCalledTimes(1)
    expect(faq.value.version).toBe('1.0.0')
    expect(JSON.parse(sessionStorage.getItem('parent_faq_v1')).version).toBe('1.0.0')
  })

  it('已有 sessionStorage 時先用快取、背景重新 fetch', async () => {
    sessionStorage.setItem('parent_faq_v1', JSON.stringify({ ...SAMPLE, version: 'cached' }))
    const { useFaq } = await import('@/parent/composables/useFaq')
    const { getFaq } = await import('@/parent/api/assistant')

    const { load, faq } = useFaq()
    await load()
    // 一進去就有快取版本
    expect(faq.value.version).toBe('cached')
    // fetch 仍然被呼叫（背景刷新）
    expect(getFaq).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2：執行測試確認失敗**

```bash
npm run test -- tests/unit/parent/composables/useFaq.test.js
```
Expected：Cannot find module 或測試 FAIL

- [ ] **Step 3：實作 composable**

```js
// src/parent/composables/useFaq.js
import { ref } from 'vue'
import { getFaq } from '@/parent/api/assistant'

const STORAGE_KEY = 'parent_faq_v1'

export function useFaq() {
  const faq = ref(null)
  const loading = ref(false)
  const error = ref(null)

  function readCache() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  async function load() {
    const cached = readCache()
    if (cached) faq.value = cached

    loading.value = true
    error.value = null
    try {
      const fresh = await getFaq()
      faq.value = fresh
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
    } catch (e) {
      error.value = e
      // 已有 cached 時保留快取
    } finally {
      loading.value = false
    }
  }

  return { faq, loading, error, load }
}
```

- [ ] **Step 4：執行測試確認全綠**

```bash
npm run test -- tests/unit/parent/composables/useFaq.test.js
```
Expected：2 PASS

- [ ] **Step 5：Commit**

```bash
git add src/parent/composables/useFaq.js tests/unit/parent/composables/useFaq.test.js
git commit -m "feat: useFaq composable（sessionStorage 快取 + 背景刷新）"
```

---

### Task 10：useFaqSearch composable（TDD）

**Files:**
- Create: `src/parent/composables/useFaqSearch.js`
- Test: `tests/unit/parent/composables/useFaqSearch.test.js`

工作目錄：`/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/parent-faq-assistant`

- [ ] **Step 1：撰寫失敗測試**

```js
// tests/unit/parent/composables/useFaqSearch.test.js
import { describe, it, expect } from 'vitest'
import { searchFaq } from '@/parent/composables/useFaqSearch'

const ITEMS = [
  { id: 'a', question: '請假怎麼申請？', keywords: ['請假', '病假'], answer: '請點下方按鈕…' },
  { id: 'b', question: '月費怎麼繳？', keywords: ['繳費', 'ATM'], answer: '請依指定銀行帳號…' },
  { id: 'c', question: '接送時間是幾點？', keywords: ['接送'], answer: '正常班放學時間 16:00' },
  { id: 'd', question: '颱風天會放假嗎？', keywords: ['颱風', '放假'], answer: '依縣市政府公告…' },
]

describe('searchFaq', () => {
  it('空字串回傳空陣列', () => {
    expect(searchFaq(ITEMS, '')).toEqual([])
    expect(searchFaq(ITEMS, '   ')).toEqual([])
  })

  it('完全匹配 question 排第一', () => {
    const r = searchFaq(ITEMS, '請假怎麼申請')
    expect(r[0].id).toBe('a')
  })

  it('單字搜尋（中文逐字配對）', () => {
    const r = searchFaq(ITEMS, '颱')
    expect(r.map(x => x.id)).toContain('d')
  })

  it('keyword 命中加分', () => {
    const r = searchFaq(ITEMS, 'ATM')
    expect(r[0].id).toBe('b')
  })

  it('limit 截斷', () => {
    const r = searchFaq(ITEMS, '請', 1)
    expect(r.length).toBeLessThanOrEqual(1)
  })

  it('完全沒命中回傳空陣列', () => {
    expect(searchFaq(ITEMS, 'xyz123')).toEqual([])
  })
})
```

- [ ] **Step 2：執行測試確認失敗**

```bash
npm run test -- tests/unit/parent/composables/useFaqSearch.test.js
```
Expected：FAIL（模組不存在）

- [ ] **Step 3：實作 composable**

```js
// src/parent/composables/useFaqSearch.js

/**
 * 模糊搜尋 FAQ 項目。
 *
 * 評分規則：
 *   - question.includes(token)  +3
 *   - keyword.includes(token)   +2
 *   - answer.includes(token)    +1
 * Tokens：query 用空白拆 + 中文逐字（聯集，去重）。
 */
export function score(item, query) {
  const q = (query || '').toLowerCase().trim()
  if (!q) return 0
  const tokens = [
    ...new Set([
      ...q.split(/\s+/).filter(Boolean),
      ...[...q].filter(c => /\S/.test(c)),
    ]),
  ]
  if (tokens.length === 0) return 0

  const question = (item.question || '').toLowerCase()
  const answer = (item.answer || '').toLowerCase()
  const keywords = (item.keywords || []).map(k => (k || '').toLowerCase())

  let s = 0
  for (const t of tokens) {
    if (question.includes(t)) s += 3
    for (const k of keywords) {
      if (k.includes(t)) s += 2
    }
    if (answer.includes(t)) s += 1
  }
  return s
}

export function searchFaq(items, query, limit = 8) {
  return (items || [])
    .map(item => ({ item, s: score(item, query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.item)
}
```

- [ ] **Step 4：執行測試確認全綠**

```bash
npm run test -- tests/unit/parent/composables/useFaqSearch.test.js
```
Expected：6 PASS

- [ ] **Step 5：Commit**

```bash
git add src/parent/composables/useFaqSearch.js tests/unit/parent/composables/useFaqSearch.test.js
git commit -m "feat: useFaqSearch 模糊搜尋（中文逐字 + 評分排序）"
```

---

## Phase 4 — 前端 UI 元件

> 元件採直接實作（依 CLAUDE.md 規範：元件渲染屬可後補測試）。所有元件目錄於 `src/parent/components/assistant/`。

### Task 11：AssistantBubble.vue

**Files:**
- Create: `src/parent/components/assistant/AssistantBubble.vue`

工作目錄：`/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/parent-faq-assistant`

- [ ] **Step 1：建立 AssistantBubble**

```vue
<!-- src/parent/components/assistant/AssistantBubble.vue -->
<script setup>
const props = defineProps({
  role: { type: String, required: true, validator: v => ['assistant', 'user'].includes(v) },
})
</script>

<template>
  <div class="bubble-row" :class="role">
    <img v-if="role === 'assistant'" class="avatar" src="/LOGO.png" alt="助理" />
    <div class="bubble" :class="role">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.bubble-row { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 10px; }
.bubble-row.user { justify-content: flex-end; }
.avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: #fff; padding: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  flex-shrink: 0;
}
.bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 15px;
  line-height: 1.5;
  word-break: break-word;
}
.bubble.assistant {
  background: #fff;
  border: 1px solid #e5e7eb;
  color: #1f2937;
  border-top-left-radius: 4px;
}
.bubble.user {
  background: #0d9053;
  color: #fff;
  border-top-right-radius: 4px;
}
</style>
```

- [ ] **Step 2：Commit**

```bash
git add src/parent/components/assistant/AssistantBubble.vue
git commit -m "feat: AssistantBubble 對話氣泡元件"
```

---

### Task 12：TypingIndicator.vue

**Files:**
- Create: `src/parent/components/assistant/TypingIndicator.vue`

- [ ] **Step 1：建立元件**

```vue
<!-- src/parent/components/assistant/TypingIndicator.vue -->
<script setup>
</script>

<template>
  <div class="typing">
    <span class="dot"></span>
    <span class="dot"></span>
    <span class="dot"></span>
  </div>
</template>

<style scoped>
.typing { display: inline-flex; gap: 4px; padding: 6px 4px; }
.dot {
  width: 6px; height: 6px; border-radius: 50%; background: #9ca3af;
  animation: bounce 1.2s infinite ease-in-out;
}
.dot:nth-child(2) { animation-delay: 0.15s; }
.dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}
</style>
```

- [ ] **Step 2：Commit**

```bash
git add src/parent/components/assistant/TypingIndicator.vue
git commit -m "feat: TypingIndicator 三點點動畫元件"
```

---

### Task 13：CategoryChip.vue

**Files:**
- Create: `src/parent/components/assistant/CategoryChip.vue`

- [ ] **Step 1：建立 CategoryChip**

```vue
<!-- src/parent/components/assistant/CategoryChip.vue -->
<script setup>
defineProps({
  category: { type: Object, required: true }, // { id, label, icon, color }
})
defineEmits(['click'])
</script>

<template>
  <button
    class="chip"
    :style="{ '--chip-color': category.color }"
    @click="$emit('click', category)"
  >
    <span class="material-symbols-rounded">{{ category.icon }}</span>
    <span>{{ category.label }}</span>
  </button>
</template>

<style scoped>
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  border: 1.5px solid var(--chip-color);
  border-radius: 999px;
  background: #fff;
  color: var(--chip-color);
  font-size: 14px; font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.chip:active { background: color-mix(in oklab, var(--chip-color) 10%, #fff); }
.material-symbols-rounded { font-size: 18px; }
</style>
```

- [ ] **Step 2：Commit**

```bash
git add src/parent/components/assistant/CategoryChip.vue
git commit -m "feat: CategoryChip 分類 chip 元件"
```

---

### Task 14：QuestionChip.vue

**Files:**
- Create: `src/parent/components/assistant/QuestionChip.vue`

- [ ] **Step 1：建立 QuestionChip**

```vue
<!-- src/parent/components/assistant/QuestionChip.vue -->
<script setup>
defineProps({
  item: { type: Object, required: true }, // FaqItem
})
defineEmits(['click'])
</script>

<template>
  <button class="chip" @click="$emit('click', item)">
    {{ item.question }}
  </button>
</template>

<style scoped>
.chip {
  display: inline-block;
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #f9fafb;
  color: #374151;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
  max-width: 100%;
}
.chip:active { background: #f3f4f6; }
</style>
```

- [ ] **Step 2：Commit**

```bash
git add src/parent/components/assistant/QuestionChip.vue
git commit -m "feat: QuestionChip 問題 chip 元件"
```

---

### Task 15：FaqAnswer.vue（答案氣泡 + CTA + markdown）

**Files:**
- Create: `src/parent/components/assistant/FaqAnswer.vue`

- [ ] **Step 1：建立 FaqAnswer**

```vue
<!-- src/parent/components/assistant/FaqAnswer.vue -->
<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps({
  item: { type: Object, required: true }, // FaqItem
})

const router = useRouter()

marked.setOptions({ breaks: true, gfm: true })

const answerHtml = computed(() => {
  const raw = marked.parse(props.item.answer || '')
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
})

function runAction() {
  const a = props.item.action
  if (!a) return
  if (a.type === 'route') router.push(a.path)
  else if (a.type === 'contact_teacher') router.push('/messages')
  else if (a.type === 'external' && a.url) window.open(a.url, '_blank', 'noopener')
}
</script>

<template>
  <div class="faq-answer">
    <div class="markdown" v-html="answerHtml"></div>
    <button v-if="item.action" class="cta" @click="runAction">
      {{ item.action.label }}
    </button>
  </div>
</template>

<style scoped>
.faq-answer { display: flex; flex-direction: column; gap: 10px; }
.markdown :deep(p) { margin: 0 0 6px; }
.markdown :deep(p:last-child) { margin-bottom: 0; }
.markdown :deep(strong) { font-weight: 600; }
.markdown :deep(a) { color: #0d9053; text-decoration: underline; }
.markdown :deep(ul), .markdown :deep(ol) { margin: 4px 0; padding-left: 20px; }
.markdown :deep(code) {
  background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-size: 0.9em;
}
.cta {
  align-self: flex-start;
  padding: 6px 14px;
  border: 1.5px solid #0d9053;
  border-radius: 999px;
  background: #fff;
  color: #0d9053;
  font-size: 14px; font-weight: 500;
  cursor: pointer;
}
.cta:active { background: #ecfdf5; }
</style>
```

- [ ] **Step 2：Commit**

```bash
git add src/parent/components/assistant/FaqAnswer.vue
git commit -m "feat: FaqAnswer 答案氣泡（marked + DOMPurify + CTA）"
```

---

### Task 16：AssistantSearch.vue

**Files:**
- Create: `src/parent/components/assistant/AssistantSearch.vue`

- [ ] **Step 1：建立元件**

```vue
<!-- src/parent/components/assistant/AssistantSearch.vue -->
<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const local = ref(props.modelValue)
let timer = null
watch(local, v => {
  clearTimeout(timer)
  timer = setTimeout(() => emit('update:modelValue', v), 150)
})
watch(() => props.modelValue, v => { local.value = v })
</script>

<template>
  <div class="search">
    <span class="material-symbols-rounded">search</span>
    <input v-model="local" type="text" placeholder="搜尋常見問題…" enterkeyhint="search" />
    <button v-if="local" class="clear" @click="local = ''">
      <span class="material-symbols-rounded">close</span>
    </button>
  </div>
</template>

<style scoped>
.search {
  position: sticky; top: 0; z-index: 5;
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #e5e7eb;
}
.material-symbols-rounded { color: #6b7280; font-size: 20px; }
input {
  flex: 1; border: none; outline: none;
  font-size: 15px; background: transparent;
}
.clear {
  background: none; border: none; cursor: pointer;
  padding: 4px; display: flex; align-items: center;
}
</style>
```

- [ ] **Step 2：Commit**

```bash
git add src/parent/components/assistant/AssistantSearch.vue
git commit -m "feat: AssistantSearch 搜尋框（debounce 150ms）"
```

---

## Phase 5 — 主頁 + 入口

### Task 17：AssistantView.vue 主頁

**Files:**
- Create: `src/parent/views/AssistantView.vue`

工作目錄：`/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/parent-faq-assistant`

- [ ] **Step 1：建立主頁**

```vue
<!-- src/parent/views/AssistantView.vue -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFaq } from '@/parent/composables/useFaq'
import { searchFaq } from '@/parent/composables/useFaqSearch'
import AssistantBubble from '@/parent/components/assistant/AssistantBubble.vue'
import AssistantSearch from '@/parent/components/assistant/AssistantSearch.vue'
import CategoryChip from '@/parent/components/assistant/CategoryChip.vue'
import QuestionChip from '@/parent/components/assistant/QuestionChip.vue'
import FaqAnswer from '@/parent/components/assistant/FaqAnswer.vue'
import TypingIndicator from '@/parent/components/assistant/TypingIndicator.vue'

const router = useRouter()
const { faq, loading, load } = useFaq()
const query = ref('')
const messages = ref([])  // { id, role, kind, payload }
let nextId = 1

const items = computed(() => faq.value?.items || [])
const categories = computed(() => faq.value?.categories || [])
const searchResults = computed(() =>
  query.value.trim() ? searchFaq(items.value, query.value, 8) : []
)

function push(msg) {
  messages.value.push({ id: nextId++, ...msg })
}

function userBubble(text) {
  push({ role: 'user', kind: 'text', payload: text })
}

async function withTyping(thenFn) {
  const typingMsg = { role: 'assistant', kind: 'typing' }
  push(typingMsg)
  await new Promise(r => setTimeout(r, 400 + Math.random() * 200))
  // 移除 typing
  messages.value = messages.value.filter(m => m.kind !== 'typing')
  thenFn()
}

function chooseCategory(cat) {
  userBubble(cat.label)
  withTyping(() => {
    const inCat = items.value.filter(x => x.category === cat.id)
    push({
      role: 'assistant',
      kind: 'text',
      payload: `關於「${cat.label}」，這些是常見問題：`,
    })
    push({ role: 'assistant', kind: 'questions', payload: inCat })
  })
}

function chooseQuestion(item) {
  userBubble(item.question)
  withTyping(() => {
    push({ role: 'assistant', kind: 'answer', payload: item })
  })
}

function goContactTeacher() {
  router.push('/messages')
}

onMounted(async () => {
  await load()
  // 初始問候
  push({
    role: 'assistant',
    kind: 'text',
    payload: '您好！我是常春藤小幫手 👋 想了解什麼呢？選一個分類或直接輸入問題吧！',
  })
  if (categories.value.length) {
    push({ role: 'assistant', kind: 'categories', payload: categories.value })
  }
})
</script>

<template>
  <div class="assistant-view">
    <AssistantSearch v-model="query" />

    <!-- 搜尋結果 overlay -->
    <div v-if="query.trim()" class="search-results">
      <div v-if="loading && searchResults.length === 0" class="hint">載入中…</div>
      <div v-else-if="searchResults.length === 0" class="hint">沒有找到相關問題</div>
      <QuestionChip
        v-for="r in searchResults"
        :key="r.id"
        :item="r"
        @click="(item) => { query = ''; chooseQuestion(item); }"
      />
    </div>

    <!-- 聊天訊息 -->
    <div v-else class="messages">
      <AssistantBubble
        v-for="m in messages"
        :key="m.id"
        :role="m.role"
      >
        <template v-if="m.kind === 'text'">{{ m.payload }}</template>
        <template v-else-if="m.kind === 'typing'"><TypingIndicator /></template>
        <template v-else-if="m.kind === 'categories'">
          <div class="chip-grid">
            <CategoryChip
              v-for="c in m.payload"
              :key="c.id"
              :category="c"
              @click="chooseCategory"
            />
          </div>
        </template>
        <template v-else-if="m.kind === 'questions'">
          <div class="chip-stack">
            <QuestionChip
              v-for="q in m.payload"
              :key="q.id"
              :item="q"
              @click="chooseQuestion"
            />
          </div>
        </template>
        <template v-else-if="m.kind === 'answer'">
          <FaqAnswer :item="m.payload" />
        </template>
      </AssistantBubble>
    </div>

    <!-- 底部固定按鈕 -->
    <div class="bottom-bar">
      <button class="contact-btn" @click="goContactTeacher">
        <span class="material-symbols-rounded">chat</span>
        找不到答案？聯絡老師
      </button>
    </div>
  </div>
</template>

<style scoped>
.assistant-view {
  min-height: 100vh;
  background: #f9fafb;
  padding-bottom: 70px;
  display: flex; flex-direction: column;
}
.messages, .search-results {
  flex: 1;
  padding: 16px 14px;
}
.search-results { display: flex; flex-direction: column; gap: 8px; }
.chip-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.chip-stack { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.hint { color: #6b7280; font-size: 14px; padding: 8px 4px; }
.bottom-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(8px);
  border-top: 1px solid #e5e7eb;
}
.contact-btn {
  width: 100%;
  padding: 12px;
  background: #0d9053;
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 15px; font-weight: 500;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  cursor: pointer;
}
.contact-btn:active { background: #086e3f; }
</style>
```

- [ ] **Step 2：Commit**

```bash
git add src/parent/views/AssistantView.vue
git commit -m "feat: AssistantView 主頁（聊天式 FAQ 流程）"
```

---

### Task 18：註冊路由 + MoreView 入口

**Files:**
- Modify: `src/parent/router.js`
- Modify: `src/parent/views/MoreView.vue`

工作目錄：`/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/parent-faq-assistant`

既有路由命名慣例：`parent-<route>`（例：`parent-leaves`, `parent-attendance`）。meta 只有 `title` + 可選 `tab`、`public`、`hideTabBar`，**沒有 requiresAuth**（auth 由 router beforeEach hook 統一處理）。

既有 tint 已預定義：`money`/`message`/`event`/`announcement`/`leave`/`activity`/`medication`/`pickup`/`calendar`/`contact`。使用 `tint: 'message'`（綠色系合適）。

既有 ParentIcon name `'chat'` 對應 Material Symbols `chat_bubble`（見 `src/parent/utils/iconMapping.js`）。

- [ ] **Step 1：在 `src/parent/router.js` 路由陣列中加入路由**

找一個其他 view import 的位置，依照同樣 lazy-import 樣式加入（例如在 `/messages` 附近）：

```js
{
  path: '/assistant',
  name: 'parent-assistant',
  component: () => import('./views/AssistantView.vue'),
  meta: { title: '常春藤小幫手' },
},
```

- [ ] **Step 2：MoreView.vue 加入入口**

修改 `src/parent/views/MoreView.vue` 的 `groups` 陣列。在第一個 group「孩子與園所」items 陣列**最前面**（讓家長一眼看到）插入：

```js
{ icon: 'chat', title: '常春藤小幫手', path: '/assistant', tint: 'message' },
```

- [ ] **Step 3：啟動 dev server 並手動驗證入口**

```bash
npm run dev
```
打開 http://localhost:5173/parent.html，登入家長帳號 → 點「更多」→ 應看到「常春藤小幫手」項目，點進去看到問候氣泡與 6 個分類 chip。

- [ ] **Step 4：Commit**

```bash
git add src/parent/router.js src/parent/views/MoreView.vue
git commit -m "feat: 註冊 /assistant 路由並於 MoreView 加入入口"
```

---

## Phase 6 — 驗收

### Task 19：跑全部測試 + 驗收清單

工作目錄：`/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/parent-faq-assistant`

- [ ] **Step 1：前端測試全綠**

```bash
npm run test
```
Expected：既有測試全綠 + 新增 2 個 composable test 檔全綠

- [ ] **Step 2：前端 build 確認**

```bash
npm run build
```
Expected：build 成功，無 lint / type 錯誤

- [ ] **Step 3：後端測試全綠**

```bash
cd /Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/parent-faq-assistant
python -m pytest tests/test_parent_assistant_service.py tests/test_parent_assistant_api.py -v
```
Expected：7 PASS

- [ ] **Step 4：對照 spec 完成條件（spec §10）逐項勾選**

啟動前後端、登入家長帳號實測：

- [ ] 從 MoreView 可看到並點選「常春藤小幫手」
- [ ] 進入頁面後 1 秒內出現助理問候訊息與 6 個分類 chip
- [ ] 點分類 chip 後顯示該分類的問題 chip（至少 3 條）
- [ ] 點問題 chip 後顯示答案氣泡，並（若有）顯示可點 CTA
- [ ] 搜尋「請假」能命中「請假怎麼申請？」
- [ ] 答案氣泡內 markdown 渲染（粗體、清單、連結）
- [ ] 點 CTA `type=route` 跳到正確路由
- [ ] 點 CTA `type=contact_teacher` 跳到 `/messages`
- [ ] 底部「聯絡老師」按鈕在任何時候可按
- [ ] 後端 JSON 改動 → curl 該 endpoint → 看到新內容（無需重啟服務）
- [ ] Vitest + pytest 全綠

- [ ] **Step 5（option）：建立 PR**

如果驗收全過，可考慮：

```bash
# 前端
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/parent-faq-assistant
git push -u origin feat/parent-faq-assistant

# 後端
cd /Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/parent-faq-assistant
git push -u origin feat/parent-faq-assistant
```

並用 `gh pr create` 開 PR（兩個 repo 各一）。

---

## 變更摘要

- 後端新增 1 個 JSON 資料檔、1 個 service、1 個 router、1 個 schema、2 個測試檔，修改 1 個 `__init__.py`
- 前端新增 1 個 view、6 個 components、2 個 composables、1 個 api client、2 個測試檔，修改 2 個檔（router、MoreView）
- 兩個前/後端 git worktree 各自一條 commit 鏈，分別可獨立 PR
- 完全無 LLM 整合、無 DB migration、無新環境變數
