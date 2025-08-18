# HTTP-FLV配信サーバ

[RTMP受信サーバ](../01-tiny-rtmp-server/)を拡張し、HTTP-FLV配信を追加した実装です。

## 主要コンポーネント

- rtmp-accepter.mts - RTMPコネクション処理を再利用可能な形でラップ
- bandwidth-estimator.mts - 帯域幅推定ユーティリティ

## 実行方法

Node.js のネイティブTypeScript実行機能により、以下のコマンドで実行できます。

```bash
# RTMPポート1935、HTTPポート8000でサーバーを起動
node src/index.mts --app myapp --streamKey mystreamkey

# カスタムポートでサーバーを起動
node src/index.mts --rtmp 1935 --web 8080 --app myapp --streamKey mystreamkey

# 帯域幅制限付きで起動
node src/index.mts --app myapp --streamKey mystreamkey --bandwidth 2000000

# バッファサイズを指定
node src/index.mts --app myapp --streamKey mystreamkey --highWaterMark 16384
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

### HTTP-FLVでの視聴URL
```
http://localhost:8000/myapp/mystreamkey
```
