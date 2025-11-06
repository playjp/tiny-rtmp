# MPEG-DASH配信サーバ

[HTTP-fMP4配信サーバ](../06-tiny-http-fmp4-server/)を改修してMPEG-DASH配信に対応させた実装です。

## 主要コンポーネント

- dash-generator.mts - MPEG-DASHマニフェストとセグメント生成処理
- segment-timeline.mts - セグメントタイムライン管理
- xml.mts - MPDマニフェスト用XML生成
- mimetype.mts - MIMEタイプ判定
- index.mts - RTMPとHTTPサーバの統合管理

## 実行方法

Node.js のネイティブTypeScript実行機能により、以下のコマンドで実行できます。

```bash
# RTMPポート1935、HTTPポート8000でサーバーを起動
node src/index.mts --app myapp --streamKey mystreamkey

# カスタムポートでサーバーを起動
node src/index.mts --rtmp 1935 --web 8080 --app myapp --streamKey mystreamkey

# 帯域幅制限付きで起動
node src/index.mts --app myapp --streamKey mystreamkey --bandwidth 2000000

# セグメントのCache-Control max-ageを指定（秒単位、デフォルト36000）
node src/index.mts --app myapp --streamKey mystreamkey --maxage 60
```

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
