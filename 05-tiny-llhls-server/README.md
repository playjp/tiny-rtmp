# LL-HLS配信サーバ

[HLS配信サーバ](../04-tiny-hls-server/)にLL-HLS配信機能を付け加えた実装です。

## 主要コンポーネント

- llhls-generator.mts - LL-HLSプレイリストとセグメント生成処理
- concatenated-segment.mts, segment.mts - パーシャルセグメントを含めたセグメント管理
- media-playlist.mts - M3U8プレイリストファイル生成

## 実行方法

Node.js のネイティブTypeScript実行機能により、以下のコマンドで実行できます。

```bash
# RTMPポート1935、HTTPポート8000でサーバーを起動
node src/index.mts --app myapp --streamKey mystreamkey

# カスタムポートでサーバーを起動
node src/index.mts --rtmp 1935 --web 8080 --app myapp --streamKey mystreamkey

# 帯域幅制限付きで起動
node src/index.mts --app myapp --streamKey mystreamkey --bandwidth 2000000

# パーシャルセグメント長を指定
node src/index.mts --app myapp --streamKey mystreamkey --partDuration 0.3
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

### LL-HLS視聴URL (プレイリスト)
```
http://localhost:8000/myapp/mystreamkey/playlist.m3u8
```

### TSセグメント
```
http://localhost:8000/myapp/mystreamkey/{番号}.ts
```

### パーシャルセグメント
```
http://localhost:8000/myapp/mystreamkey/{セグメント番号}_{パート番号}.ts
```
