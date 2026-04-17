# 幼稚園人事差勤與薪資管理系統 — Frontend

本系統專為幼稚園與補教機構設計的 Vue 3 SPA 前端，涵蓋管理端介面（人事、考勤、薪資、招生）與教師入口（Portal）。

後端為獨立 repo：[`ivyManageSystem-backend`](https://github.com/wu0010802-stack/ivyManageSystem-backend)。

## 🛠 技術堆疊

- **Framework**: Vue 3 (Composition API)
- **Build Tool**: Vite
- **Testing**: Vitest
- **UI Component Library**: Element Plus
- **State Management**: Pinia
- **Routing**: Vue Router（hash 模式）

## 📦 安裝與啟動

```bash
npm install
npm run dev
```

啟動後：
- 前端系統：`http://localhost:5173`
- 預期後端 API 位於 `http://localhost:8088/api`（由 Vite proxy 或 `VITE_API_BASE_URL` 指定）

### Build
```bash
npm run build
```

### 測試
```bash
npm run test           # 執行一次
npm run test:watch     # 監視模式
npm run test:coverage  # 含覆蓋率報告
```

## 環境變數

複製 `.env.example` 為 `.env.local`。

| 變數 | 說明 |
|------|------|
| `VITE_API_BASE_URL` | 後端 API 基底路徑，未設時預設 `/api` |
| `VITE_GOOGLE_MAPS_API_KEY` | 若設定，招生熱點圖改走 Google Maps；未設則維持 Leaflet + OpenStreetMap fallback。前端 key 應在 Google Console 設定 HTTP referrer 限制與只開 `Maps JavaScript API` |

### 部署
直接 `git push origin main`，由 GitHub Actions 跑 CI（`.github/workflows/ci.yml`）。

## 📁 目錄結構

```
frontend-vue/
├── src/
│   ├── api/            # Axios 網路請求封裝
│   ├── components/     # 共用 UI 元件
│   ├── composables/    # Vue Composables（權限檢驗、Dialog、招生資料合併等）
│   ├── stores/         # Pinia 狀態管理
│   ├── router/         # Vue Router 定義（管理端 + /portal/ 前綴）
│   └── views/          # 頁面級元件與 Portal 視圖
└── tests/unit/         # Vitest 測試
```

## 📝 授權與維護
Internal usage only.
