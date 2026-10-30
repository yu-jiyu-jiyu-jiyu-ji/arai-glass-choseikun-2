# 調整くん（choseikun）

荒井硝子様向け **訪問調査の日程調整**（顧客パブリック予約）。  
Next.js（App Router）＋間検索エンジン。仕様の正本は `../docs/REQUIREMENTS_現地調査日程調整.md`。

| フェーズ | 内容 | 状態 |
|----------|------|------|
| Phase 1 | 顧客画面 P-01〜P-03 ＋ 間検索API ＋ Calendar/Maps 基盤 | 間検索はモック／台帳は Firestore 可 |
| Phase 2 | `/admin`・職人・予約一覧・URL発行・`/r/{token}` | **実装済**（台帳 Firestore 接続可） |

既存の社内・施工日程（Streamlit）は `../nittei_chosei_system`。本リポは訪問調査専用。

---

## 開発環境の起動（最短）

前提: Node.js 20+、このフォルダで作業。

```powershell
cd e:\cursor\01_日程調整システム\choseikun
npm install
Copy-Item .env.example .env.local   # 初回のみ（無ければ）
npm run dev
```

ブラウザ: [http://localhost:3000](http://localhost:3000)

| URL | 内容 |
|-----|------|
| `/` | 顧客予約（デモ直アクセス） |
| `/r/{token}` | 発行URL（確定後は内容表示／キャンセル後は再調整） |
| `/admin` | 社内ホーム |
| `/admin/book` | 社内・代理入力（全社員／任意絞り込み） |
| `/admin/workers` | 職人マスタ |
| `/admin/bookings` | 予約一覧・オペキャンセル |
| `/admin/links` | 顧客用URL発行 |
| `/admin/settings` | 事務所・稼働・バッファ等 |
| `POST /api/slots` | 間検索（`linkToken` 可） |
| `POST /api/bookings` | 予約確定（`data/bookings.json` に保存） |

台帳は `.env.local` の **`CHOSEIKUN_DATA_BACKEND=firestore`** で会社の Firebase（職人名簿共有＋予約／URL新規）に接続。  
カレンダー予定・移動時間は当面 **`CHOSEIKUN_USE_MOCK=true`** のまま。接続確認: `GET /api/health`。

詳細手順・接続切替は [`docs/DEV_SETUP.md`](docs/DEV_SETUP.md)。

---

## スクリプト

| コマンド | 用途 |
|----------|------|
| `npm run dev` | 開発サーバ |
| `npm run build` | 本番ビルド確認 |
| `npm run start` | ビルド後の起動 |
| `npm run lint` | ESLint |

---

## ディレクトリ（要点）

```
app/
  page.tsx              # 顧客デモ
  r/[token]/           # 発行URL
  admin/                # 社内（職人・予約・URL・設定）
  api/                  # slots / bookings / workers / booking-links / links
components/booking-flow.tsx
lib/
  store.ts              # workers / links / bookings のローカルJSON
  gap-search/           # 間検索エンジン
  providers/mock.ts
data/                   # settings.json ＋ 実行時JSON（workers等）
```

---

## 次の実装（本番接続）

1. Render Environment に OAuth / Maps / Firebase を設定済みなら  
2. `/admin/workers` で各職人 **Calendar連携**  
3. `CHOSEIKUN_USE_MOCK=false` にしてデプロイ → 実カレンダーで枠検索  
4. 二重予約防止・確定メール・前日リマインド  
5. 予約確定時の Calendar 書込  

OAuth 開始: `/api/oauth/calendar/start?workerId=W001`  
コールバック: `/api/oauth/calendar/callback`
