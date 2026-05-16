# 家長端「常春藤小幫手」設計（規則式 FAQ 助手）

- 日期：2026-05-16
- 範圍：`ivy-frontend`（家長端 SPA）+ `ivy-backend`（FastAPI）
- 狀態：Spec — 待 review

## 1. 目標

在家長端新增「常春藤小幫手」入口，提供**規則式 FAQ 客服**體驗：

- 視覺與互動採用聊天 UI（重用既有 `MessageBubble.vue`），讓家長覺得像在跟 AI 客服對話。
- 答案來源是預先撰寫的 FAQ JSON，**不接任何 LLM**，零外部呼叫、零成本、答案完全可控。
- 涵蓋幼兒園客服 90% 的常見問題（請假、繳費、接送、活動、健康、行政），找不到答案時引導家長使用既有「聯絡老師」功能。

## 2. 非目標（YAGNI）

第一版**明確不做**：

- LLM / AI 推理 / 任何外部 API 呼叫
- 管理端 FAQ CRUD 介面（園所手動編輯 JSON 檔即可，第二版再評估）
- FAQ 多語系（目前只做繁體中文）
- 對話歷史持久化（每次進入是全新會話）
- 「常見問題排行」/ 點擊分析
- 個人化資料查詢（「我家小孩這個月繳費了沒」等）

## 3. 使用者流程

```
家長端首頁 → 底部導覽「更多」→ 點「常春藤小幫手」
   ↓
[AssistantView] 進入聊天式介面
   ├─ 載入時自動顯示助理問候氣泡（typing 動畫 → 文字）
   ├─ 問候訊息下方：6 個分類 chip
   ├─ 上方固定：搜尋框（即時模糊搜尋）
   │
   ├─ 點分類 chip：
   │    → 新增「使用者氣泡」顯示分類名稱
   │    → 助理氣泡列出該分類常見問題（問題 chip）
   │
   ├─ 點問題 chip：
   │    → 新增「使用者氣泡」顯示問題
   │    → 助理氣泡顯示答案（含可選 CTA 按鈕）
   │
   ├─ 在搜尋框打字：
   │    → 即時顯示模糊配對結果（最多 8 條），點選同問題 chip 流程
   │
   └─ 底部固定：「找不到答案？聯絡老師」按鈕，任何時候可按，跳 MessagesView
```

聊天歷史保留在當次工作階段中（Vue 元件 `ref` 陣列），離開頁面即清除。

## 4. 資料模型

### 4.1 FAQ 檔案位置

放後端 `ivy-backend/data/parent_faq.json`。原因：

- 園所要改答案時，後端工程師可直接編輯檔案 → 重啟服務（或等 mtime cache 失效）即可生效，無須重新部署前端。
- 前端透過 API 取得，避開 bundle 變大。
- 第二版若要做管理端 CRUD，遷移到 DB 即可，API 介面不變。

### 4.2 JSON 結構

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
    {
      "id": "leave-how-to-apply",
      "category": "leave",
      "question": "請假怎麼申請？",
      "keywords": ["請假", "病假", "事假", "請假流程"],
      "answer": "請點下方「去請假」按鈕，選擇日期與假別後送出即可，老師會收到通知並核准。",
      "action": { "type": "route", "label": "去請假", "path": "/leaves" }
    }
  ]
}
```

### 4.3 欄位定義

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `version` | string | ✓ | 語意化版本，前端可顯示於設定頁（debug 用） |
| `updated_at` | string (YYYY-MM-DD) | ✓ | 最後更新日期 |
| `categories[].id` | string | ✓ | 分類 ID（kebab-case） |
| `categories[].label` | string | ✓ | 中文顯示名稱 |
| `categories[].icon` | string | ✓ | Material Symbols Rounded 名稱 |
| `categories[].color` | string | ✓ | 16 進位色碼，用於 chip 主色 |
| `items[].id` | string | ✓ | 全域唯一 ID |
| `items[].category` | string | ✓ | 對應 `categories[].id` |
| `items[].question` | string | ✓ | 問題文字（家長視角） |
| `items[].keywords` | string[] | ✓ | 搜尋關鍵字（可空陣列，但建議 3-5 個） |
| `items[].answer` | string | ✓ | 答案文字，支援 markdown |
| `items[].action` | object | ✗ | 可選 CTA |

**Action 型別**：

| `type` | 行為 | 額外欄位 |
|---|---|---|
| `route` | 跳轉到家長端 SPA 內部路由 | `path` (string), `label` (string) |
| `contact_teacher` | 跳轉到 MessagesView | `label` (string)，預設「聯絡老師」 |
| `external` | 開啟外部連結（新分頁） | `url` (string), `label` (string) |

未提供 `action` 時，答案氣泡只顯示文字。

### 4.4 初始 FAQ 內容

第一版實作時，將寫 **30 條 placeholder FAQ**，平均分布於 6 個分類（每類約 5 條）。內容由實作者起草，園所之後可微調。

## 5. 後端設計

### 5.1 檔案結構

| 檔案 | 角色 |
|---|---|
| `ivy-backend/api/parent_portal/assistant.py` | FastAPI router |
| `ivy-backend/services/parent_assistant_service.py` | FAQ 載入與快取邏輯 |
| `ivy-backend/data/parent_faq.json` | FAQ 內容 |
| `ivy-backend/schemas/parent_assistant.py` | Pydantic schemas |
| `ivy-backend/tests/services/test_parent_assistant_service.py` | 單元測試 |

### 5.2 API 端點

```
GET /api/parent/assistant/faq
```

**Auth**：沿用既有 parent portal 的 LINE login dependency（與其他 `/api/parent/*` 一致）。雖然 FAQ 是通用內容，但保持一致便於後續權限統一。

**Response**：直接回傳 `parent_faq.json` 解析後的內容（Pydantic 驗證後序列化）。

```json
{
  "version": "1.0.0",
  "updated_at": "2026-05-16",
  "categories": [...],
  "items": [...]
}
```

**Caching headers**：`Cache-Control: private, max-age=300`（前端 5 分鐘內不重複請求；前端另有 sessionStorage 快取避免同一 session 重複呼叫）。

### 5.3 Service：載入與 mtime 快取

```python
# services/parent_assistant_service.py
class ParentAssistantService:
    _cache: dict | None = None
    _cached_mtime: float | None = None
    _path = Path(__file__).parent.parent / "data" / "parent_faq.json"

    @classmethod
    def get_faq(cls) -> dict:
        mtime = cls._path.stat().st_mtime
        if cls._cache is None or mtime != cls._cached_mtime:
            with cls._path.open(encoding="utf-8") as f:
                cls._cache = json.load(f)
            cls._cached_mtime = mtime
        return cls._cache
```

園所改 JSON 後，下次請求自動偵測 mtime 變動並重載，無需重啟服務。

### 5.4 Pydantic Schemas

`schemas/parent_assistant.py`：

```python
class FaqAction(BaseModel):
    type: Literal["route", "contact_teacher", "external"]
    label: str
    path: str | None = None
    url: str | None = None

class FaqItem(BaseModel):
    id: str
    category: str
    question: str
    keywords: list[str] = []
    answer: str
    action: FaqAction | None = None

class FaqCategory(BaseModel):
    id: str
    label: str
    icon: str
    color: str

class FaqResponse(BaseModel):
    version: str
    updated_at: str
    categories: list[FaqCategory]
    items: list[FaqItem]
```

啟動時的健康檢查可額外驗證：所有 `items[].category` 都對應到 `categories[].id`。

### 5.5 註冊路由

在 `api/parent_portal/__init__.py`（或對應 `main.py`）加入 router include。

## 6. 前端設計

### 6.1 檔案結構

| 檔案 | 角色 |
|---|---|
| `src/parent/views/AssistantView.vue` | 主頁面 |
| `src/parent/components/assistant/CategoryChip.vue` | 分類 chip 元件 |
| `src/parent/components/assistant/QuestionChip.vue` | 問題 chip 元件 |
| `src/parent/components/assistant/FaqAnswer.vue` | 答案氣泡 + CTA |
| `src/parent/components/assistant/AssistantSearch.vue` | 搜尋框 |
| `src/parent/composables/useFaq.js` | 載入 FAQ + sessionStorage 快取 |
| `src/parent/composables/useFaqSearch.js` | 模糊搜尋邏輯 |
| `src/api/assistantParent.js` | `getFaq()` |
| `src/parent/router.js` | 新增 `/assistant` 路由 |
| `src/parent/views/MoreView.vue` | 新增入口 item |

### 6.2 路由

```js
// src/parent/router.js
{
  path: '/assistant',
  name: 'Assistant',
  component: () => import('@/parent/views/AssistantView.vue'),
  meta: { requiresAuth: true, title: '常春藤小幫手' }
}
```

### 6.3 MoreView 入口

在 `MoreView.vue` 既有的選單陣列中，加入（順序：放在「聯絡簿」附近）：

```js
{ icon: 'smart_toy', title: '常春藤小幫手', path: '/assistant', tint: 'assistant' }
```

`tint` 對應的色票可沿用主題綠或新增一個（實作時決定）。

### 6.4 聊天訊息結構

使用本地 `ref` 陣列：

```js
const messages = ref([
  // { id, role: 'assistant' | 'user', kind: 'text' | 'chips' | 'answer', payload }
])
```

`kind` 決定渲染元件：

- `text` → 純文字氣泡（用既有 `MessageBubble.vue`）
- `chips` → 助理氣泡內顯示 chip 群組（分類或問題列表）
- `answer` → 助理氣泡顯示答案 + 可選 CTA

### 6.5 搜尋邏輯（`useFaqSearch.js`）

```js
function score(item, query) {
  const q = query.toLowerCase().trim()
  if (!q) return 0
  // 中文逐字 + 空白分詞並聯
  const tokens = [...new Set([...q.split(/\s+/).filter(Boolean), ...q])]
  let s = 0
  for (const t of tokens) {
    if (item.question.toLowerCase().includes(t)) s += 3
    for (const k of item.keywords) {
      if (k.toLowerCase().includes(t)) s += 2
    }
    if (item.answer.toLowerCase().includes(t)) s += 1
  }
  return s
}

function searchFaq(items, query, limit = 8) {
  return items
    .map(item => ({ item, s: score(item, query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.item)
}
```

搜尋框 input 加 `debounce(150)`。

### 6.6 FAQ 載入策略（`useFaq.js`）

```
1. 進入頁面時呼叫 getFaq()
2. 先檢查 sessionStorage['parent_faq_v1']
   ├─ 有 → 直接用，並背景重新 fetch（stale-while-revalidate）
   └─ 無 → fetch + 顯示 skeleton（重用 SkeletonBlock.vue）
3. fetch 成功後寫回 sessionStorage
```

sessionStorage key 加版本後綴避免結構變更時讀到舊資料：`parent_faq_v1`。

### 6.7 Typing 動畫

點任何 chip 後：

1. 立即把使用者氣泡 push 進 `messages`
2. 加入一個 `kind: 'typing'` 的助理氣泡（顯示三個跳動點點）
3. 等待 400-600ms（隨機）
4. 移除 typing 氣泡，push 真正的回答氣泡

純前端，純為了質感。

### 6.8 CTA Action 處理

```js
function handleAction(action) {
  if (action.type === 'route') router.push(action.path)
  else if (action.type === 'contact_teacher') router.push('/messages')
  else if (action.type === 'external') window.open(action.url, '_blank', 'noopener')
}
```

### 6.9 UI 規範

- 主題色：`#0d9053`（沿用既有）
- 助理頭像：`/LOGO.png`，30px 圓形
- 助理氣泡：白底淺灰邊框
- 使用者氣泡：綠底白字（既有 `MessageBubble` props）
- Chip：圓角 pill，分類 chip 用 `category.color` 作 outline；問題 chip 用淺灰
- 答案氣泡內的 markdown：粗體、清單、行內 code、連結；行內換行保留
- 搜尋框：固定於頂部（sticky），單行，placeholder「搜尋常見問題…」
- 底部「聯絡老師」按鈕：固定（fixed），半透明背景

### 6.10 markdown 渲染

優先檢查專案是否已有 markdown renderer（既有 `MessageBubble.vue` 看是否用過）。若無，加 `marked`（輕量，~30KB minified）+ 用 `DOMPurify` 消毒。

實作前需在 `package.json` 確認是否已有相似依賴。

## 7. 測試

### 7.1 前端（Vitest）

- `useFaqSearch.test.js`：
  - 空 query → 回傳空陣列
  - 中文逐字配對（「請假」、「請」、「假」皆能命中）
  - keyword 配對加分
  - 分數排序
  - limit 截斷
- `useFaq.test.js`：
  - sessionStorage 命中時不再 fetch
  - sessionStorage miss 時 fetch + 寫入

元件渲染測試後補（依規範屬「可後補測試」）。

### 7.2 後端（pytest）

- `test_parent_assistant_service.py`：
  - 首次呼叫 `get_faq()` 讀檔
  - mtime 未變時不重讀（mock `Path.stat`）
  - mtime 變動時重載
  - JSON 格式錯誤拋出明確錯誤
- API 整合測試：
  - 已登入家長 → 200 + 正確 schema
  - 未登入 → 401（沿用既有 auth dependency 測試樣式）

## 8. 部署與相容性

- **無 migration**：第一版完全不動 DB
- **無新環境變數**
- **無外部相依套件**（除可能新增 `marked` + `DOMPurify`，若既有 renderer 已可用則跳過）
- **既有家長端不受影響**：純新增頁面與入口

## 9. 後續演進路線（資訊性，非本 spec 範圍）

- **第二版**：管理端 FAQ CRUD（ivyManageSystem 加管理介面 + DB 表）
- **第三版**：FAQ 點擊統計，找出園所最該補強的問題
- **第四版**（若 LLM 預算可行）：當搜尋分數為 0 時 fallback 到 LLM；或開放個人化資料查詢

## 10. 完成條件（Acceptance Criteria）

實作完成後，以下應全部為真：

- [ ] 家長從 MoreView 可看到並點選「常春藤小幫手」
- [ ] 進入頁面後 1 秒內出現助理問候訊息與 6 個分類 chip
- [ ] 點分類 chip 後顯示該分類的問題 chip（至少 3 條）
- [ ] 點問題 chip 後顯示答案氣泡，並（若有）顯示可點 CTA
- [ ] 搜尋「請假」應能命中「請假怎麼申請？」等問題
- [ ] 答案氣泡內 markdown 正確渲染（粗體、清單、連結）
- [ ] 點 CTA `type=route` 跳到正確路由
- [ ] 點 CTA `type=contact_teacher` 跳到 `/messages`
- [ ] 底部「聯絡老師」按鈕在任何時候可按
- [ ] 後端 JSON 改動後，下次請求即生效（無需重啟）
- [ ] Vitest + pytest 全綠
