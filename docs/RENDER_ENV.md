# Render 環境変数（調整くん）

`.env` の内容をほぼそのままでよいが、**JSON ファイルのパスだけは Render では注意**。

## 必須（台帳を Firestore にする場合）

| 変数名 | 入れるもの |
|--------|------------|
| `CHOSEIKUN_DATA_BACKEND` | `firestore` |
| `CHOSEIKUN_USE_MOCK` | 当面 `true`。Calendar/Maps 本番読取時は `false` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Secret File のパス（例: `/etc/secrets/….json`） |
| または `GOOGLE_SERVICE_ACCOUNT_JSON` | サービスアカウント JSON の**中身すべて** |

## Calendar / Maps

| 変数名 | 入れるもの |
|--------|------------|
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth クライアント ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth クライアントシークレット |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://arai-glass-choseikun-2-1.onrender.com/api/oauth/calendar/callback` |
| `GOOGLE_MAPS_API_KEY` | Geocoding / Routes 用 API キー |

有効化する API: **Google Calendar API** / **Geocoding API** / **Routes API**

### 本番プロバイダ切替手順

1. `/admin/workers` で各職人の **Calendar連携** を完了  
2. `CHOSEIKUN_USE_MOCK=false` に変更して再デプロイ  
3. `/api/health` で `calendarTravelMode: "live"` を確認  
4. 顧客画面で住所を入れて枠が出るか確認  

## 入れない／注意

- `GOOGLE_APPLICATION_CREDENTIALS=E:\cursor\...json` のような **PC上のパスは無効**（Render では Secret File パスか JSON 本文）
- JSON・秘密鍵は **Secret** として登録（ログに出さない）
- 既存 nittei（Streamlit）用のリダイレクト URI と **choseikun 用は別**。両方 OAuth クライアントに登録してよい

## 確認

デプロイ後: `https://arai-glass-choseikun-2-1.onrender.com/api/health`  
`ok: true` と `workerCount` が出れば台帳接続成功。
