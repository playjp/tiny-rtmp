# RTMPS + HTTPS HLS配信サーバ

[RTMPSサーバ](../06-tiny-rtmps-server/)と[HLSサーバ](../04-tiny-hls-server/)を組み合わせた、RTMPS入力からHTTPS経由でHLS配信を行うサーバの実装です。

[HLSサーバ](../04-tiny-hls-server/)からの変更点は以下になります。
```diff
-import net from 'node:net';
-import http from 'node:http';
+import tls from 'node:tls';
+import https from 'node:https';
+import fs from 'node:fs';

-import HLSGenerator from './hls-generator.mts';
+import HLSGenerator from '../../04-tiny-hls-server/src/hls-generator.mts';

const options = {
// 省略
+  key: {
+    type: 'string',
+  },
+  cert: {
+    type: 'string',
+  }
// 省略
}

+if (args.key == null) {
+  console.error('Please Specify Valid SSL/TLS key'); process.exit(1);
+}
+if (args.cert == null) {
+  console.error('Please Specify Valid SSL/TLS cert'); process.exit(1);
+}

+const key = fs.readFileSync(args.key);
+const cert = fs.readFileSync(args.cert);

-const rtmp_server = net.createServer({ noDelay: true }, async (connection) => {
+const rtmp_server = tls.createServer({ noDelay: true, key, cert }, async (connection) => {

-const web_server = http.createServer(async (req, res) => {
+const web_server = https.createServer({ key, cert }, async (req, res) => {
```

## 主要コンポーネント

- index.mts - [RTMPSサーバ](../06-tiny-rtmps-server/)と同じようにHLSサーバをHTTPSに対応させた実装

## 実行方法

Node.js のネイティブTypeScript実行機能により、以下のコマンドで実行できます。

```bash
# RTMPSポート1935、HTTPSポート8000でサーバーを起動
node src/index.mts --rtmp 1935 --web 8000 --key server.key --cert server.crt --app live --streamKey test

# 帯域幅制限付きで起動
node src/index.mts --rtmp 1935 --web 8000 --key server.key --cert server.crt --app live --streamKey test --bandwidth 5000
```

また、vite を使ってバンドルして javascript にまとめられます。

```bash
# dist/tiny-rtmps-https-hls-server.mjs にバンドルした結果を出力
yarn build
```

## 利用方法

### RTMPS打ち上げ先

デフォルトの設定の場合、以下のURLで配信可能です。

```
rtmps://localhost:1935/live/test
```

### HLS配信URL

配信開始後、以下のURLでHLS形式で視聴できます。

```
https://localhost:8000/live/test/playlist.m3u8
```

