# RTMPS + HTTP/2 LL-HLS配信サーバ

[RTMPSサーバ](../XX-tiny-rtmps-server/)と[LL-HLSサーバ](../05-tiny-llhls-server/)を組み合わせた、RTMPS入力からHTTP/2経由でLL-HLS配信を行うサーバの実装です。
AVPlayerではHTTP/2以降のプロトコルでのみ、通常のHLSと比べてバッファ量が少なくなります。

[LL-HLSサーバ](../05-tiny-llhls-server/)からの変更点は以下になります。
```diff
-import net from 'node:net';
-import http from 'node:http';
+import tls from 'node:tls';
+import http2 from 'node:http2';
+import fs from 'node:fs';

-import LLHLSGenerator from './llhls-generator.mts';
+import LLHLSGenerator from '../../05-tiny-llhls-server/src/llhls-generator.mts';

const options = {
// 省略
+  key: {
+    type: 'string',
+  },
+  cert: {
+    type: 'string',
+  },
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
+const web_server = http2.createSecureServer({ key, cert }, async (req, res) => {
```

## 主要コンポーネント

- index.mts - [RTMPS/HTTPS HLSサーバ](../07-tiny-rtmps-https-hls-server/)に[LL-HLSサーバ](../05-tiny-llhls-server/)を加え、HTTP2に対応させた実装

## 実行方法

Node.js のネイティブTypeScript実行機能により、以下のコマンドで実行できます。

```bash
# RTMPSポート1935、HTTP/2ポート8000でサーバーを起動
node src/index.mts --rtmp 1935 --web 8000 --key server.key --cert server.crt --app live --streamKey test

# 帯域幅制限付きで起動
node src/index.mts --rtmp 1935 --web 8000 --key server.key --cert server.crt --app live --streamKey test --bandwidth 5000

# 部分セグメント長指定で起動
node src/index.mts --rtmp 1935 --web 8000 --key server.key --cert server.crt --app live --streamKey test --partDuration 1.0
```

また、vite を使ってバンドルして javascript にまとめられます。

```bash
# dist/tiny-rtmps-http2-llhls-server.mjs にバンドルした結果を出力
yarn build
```

## 利用方法

### RTMPS打ち上げ先

デフォルトの設定の場合、以下のURLで配信可能です。

```
rtmps://localhost:1935/live/test
```

### LL-HLS配信URL

配信開始後、以下のURLでLL-HLSで視聴できます。

```
https://localhost:8000/live/test/playlist.m3u8
```
