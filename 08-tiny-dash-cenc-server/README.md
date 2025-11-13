# MPEG-DASH配信サーバ (CENC暗号化対応)

[MPEG-DASH配信サーバ](../07-tiny-dash-server/)を改修してCENC (Common Encryption) による暗号化に対応させた実装です。

## 主要コンポーネント

- dash-generator.mts - MPEG-DASHマニフェストとCENC暗号化セグメント生成処理
- segment-timeline.mts - セグメントタイムライン管理
- cenc.mts - CENC暗号化実装
- avc.mts - H.264/AVC用CENC暗号化処理
- aac.mts - AAC用CENC暗号化処理
- xml.mts - MPDマニフェスト用XML生成
- mimetype.mts - MIMEタイプ判定
- index.mts - RTMPとHTTPサーバの統合管理

## 実行方法

Node.js のネイティブTypeScript実行機能により、以下のコマンドで実行できます。

```bash
# RTMPポート1935、HTTPポート8000でサーバーを起動
node src/index.mts --app myapp --streamKey mystreamkey --encryptionKeyId 9eb4050de44b4802932e27d75083e266 --encryptionKey 166634c675823c235a4a9446fad52e4d

# カスタムポートでサーバーを起動
node src/index.mts --rtmp 1935 --web 8080 --app myapp --streamKey mystreamkey --encryptionKeyId 9eb4050de44b4802932e27d75083e266 --encryptionKey 166634c675823c235a4a9446fad52e4d

# 帯域幅制限付きで起動
node src/index.mts --app myapp --streamKey mystreamkey --encryptionKeyId 9eb4050de44b4802932e27d75083e266 --encryptionKey 166634c675823c235a4a9446fad52e4d --bandwidth 2000000

# セグメントのCache-Control max-ageを指定（秒単位、デフォルト36000）
node src/index.mts --app myapp --streamKey mystreamkey --encryptionKeyId 9eb4050de44b4802932e27d75083e266 --encryptionKey 166634c675823c235a4a9446fad52e4d --maxage 60
```

### 暗号化キーについて

- `--encryptionKeyId`: 16バイトのキーID（32桁の16進数文字列）
- `--encryptionKey`: 16バイトの暗号化キー（32桁の16進数文字列）

上記の例で使用しているキーはサンプルです。本番環境では安全に生成されたランダムな値を使用してください。

また、vite を使ってバンドルして javascript にまとめられます。

```bash
# dist/index.cjs, dist/index.mjs にバンドルした結果を出力
yarn build
```

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

ビルトインのdash.jsプレイヤーページ:
```
http://localhost:8000/myapp/mystreamkey/
```

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
