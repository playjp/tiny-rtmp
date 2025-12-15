# MPEG-DASH配信サーバ (Widevine DRM対応)

[MPEG-DASH配信サーバ (CENC暗号化対応)](../08-tiny-dash-cenc-server/)を改修してWidevine DRMに対応させた実装です。Widevineのテスト用キーとライセンスサーバー (cwip-shaka-proxy) を使用して、実際のDRM保護ストリーミングを体験できます。

## 主要コンポーネント

- dash-generator.mts - MPEG-DASHマニフェスト生成とWidevine PSSH埋め込み処理
- index.mts - RTMPとHTTPサーバの統合管理、dash.js + EME統合

## Widevine DRMについて

本実装では以下のWidevine固有の要素を含みます:

- **SystemID**: `edef8ba9-79d6-4ace-a3c8-27dcd51d21ed` (Widevine)
- **PSSH (Protection System Specific Header)**: Widevineライセンスサーバーへの情報を含むバイナリデータ
- **ライセンスサーバー**: Googleが提供するテスト用プロキシ (`https://cwip-shaka-proxy.appspot.com/no_auth`)
- **テストキー**: Widevine公式テストキー (KID: `90351951686b5e1ba222439ecec1f12a`, Key: `0a237b0752cbf1a827e2fecfb87479a2`)

dash.jsプレイヤーはEME (Encrypted Media Extensions) APIを使用してWidevineライセンスサーバーと通信し、復号化キーを取得して再生を行います。

## 実行方法

Node.js のネイティブTypeScript実行機能により、以下のコマンドで実行できます。

```bash
# RTMPポート1935、HTTPポート8000でサーバーを起動 (CENC)
node src/index.mts --app myapp --streamKey mystreamkey --encryptionScheme cenc

# CBCS暗号化モードで起動
node src/index.mts --app myapp --streamKey mystreamkey --encryptionScheme cbcs

# カスタムポートでサーバーを起動
node src/index.mts --rtmp 1935 --web 8080 --app myapp --streamKey mystreamkey --encryptionScheme cenc

# 帯域幅制限付きで起動
node src/index.mts --app myapp --streamKey mystreamkey --encryptionScheme cenc --bandwidth 2000000

# セグメントのCache-Control max-ageを指定（秒単位、デフォルト36000）
node src/index.mts --app myapp --streamKey mystreamkey --encryptionScheme cenc --maxage 60
```

また、vite を使ってバンドルして javascript にまとめられます。

```bash
# dist/index.cjs, dist/index.mjs にバンドルした結果を出力
yarn build
```

### 暗号化スキームについて

- `--encryptionScheme`: 必須パラメータ。`cenc` (AES-128-CTR) または `cbcs` (AES-128-CBC with pattern encryption) を指定

本実装では暗号化キーは内部的にWidevineテスト用キーで固定されています。

## 利用方法

デフォルトの設定の場合、以下のURLで利用可能です。

### RTMP打ち上げ先
```
rtmp://localhost:1935/myapp/mystreamkey
```

### DASH視聴URL (マニフェスト)
```
http://localhost:8000/myapp/mystreamkey/manifest.mpd
```

ビルトインのdash.jsプレイヤーページ (Widevine DRM対応):
```
http://localhost:8000/myapp/mystreamkey/
```

ブラウザはEME APIを通じてWidevineライセンスサーバーと通信し、自動的に復号化を行います。Chrome、Edge、Firefoxなどの主要ブラウザで再生可能です。

### Initialization Segment
```
http://localhost:8000/myapp/mystreamkey/video_init.mp4
http://localhost:8000/myapp/mystreamkey/audio_init.mp4
```

### Media Segment
```
http://localhost:8000/myapp/mystreamkey/video_{番号}.m4s
http://localhost:8000/myapp/mystreamkey/audio_{番号}.m4s
```
