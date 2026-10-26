# Render 環境変数（調整くん）

`.env` の内容をほぼそのままでよいが、**JSON ファイルのパスだけは Render では使えない**。

## 必須（台帳を Firestore にする場合）

| 変数名 | 入れるもの |
|--------|------------|
| `CHOSEIKUN_DATA_BACKEND` | `firestore` |
| `CHOSEIKUN_USE_MOCK` | `true`（当面。カレンダー／地図はモック） |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `schedule-adjustment-….json` の**ファイル中身すべて**（コピー＆ペースト） |

## あるとよい（次フェーズ用・今は未使用でも可）

| 変数名 | 元 |
|--------|-----|
| `GOOGLE_OAUTH_CLIENT_ID` | nittei の `.env` と同じ |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 同上 |
| `GOOGLE_OAUTH_REDIRECT_URI` | 例: `https://（あなたのRenderのURL）/api/oauth/calendar/callback` |
| `GOOGLE_MAPS_API_KEY` | 同上 |

## 入れない／注意

- `GOOGLE_APPLICATION_CREDENTIALS=E:\cursor\...json` のような **PC上のパスは無効**
- JSON・秘密鍵は **Secret** として登録（ログに出さない）
- SMTP や問い合わせパスワードは調整くんでは不要

## 確認

デプロイ後: `https://（あなたのURL）/api/health`  
`ok: true` と `workerCount` が出れば台帳接続成功。
