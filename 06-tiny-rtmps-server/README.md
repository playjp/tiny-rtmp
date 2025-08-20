# RTMPS受信サーバ

[RTMPサーバ](../01-tiny-rtmp-server/)にTLS暗号化を追加したRTMPS(RTMP over TLS)サーバの実装です。

[RTMPサーバ](../01-tiny-rtmp-server/)からの変更点は以下になります。
```diff
-import net from 'node:net';
+import tls from 'node:tls';
-import handle_rtmp from './rtmp-handler.mts';
+import handle_rtmp from '../../01-tiny-rtmp-server/src/rtmp-handler.mts';

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
+  console.error('Please Specify Valid SSL/TLS key');
+  process.exit(1);
+}
+if (args.cert == null) {
+  console.error('Please Specify Valid SSL/TLS cert');
+  process.exit(1);
+}

+const key = fs.readFileSync(args.key);
+const cert = fs.readFileSync(args.cert);

-const server = net.createServer({ noDelay: true }, async (connection) => {
+const server = tls.createServer({ noDelay: true, key, cert }, async (connection) => {
```

## 主要コンポーネント

- index.mts - node:net の代わりに node:tls を利用してRTMPSに対応

## 実行方法

Node.js のネイティブTypeScript実行機能により、以下のコマンドで実行できます。

```bash
# RTMPS ポート1935でサーバーを起動
node src/index.mts --key server.key --cert server.crt --port 1935

# 標準RTMPS ポート443でサーバーを起動（要root権限）
sudo node src/index.mts --key server.key --cert server.crt --port 443

# FLVファイル出力付きで起動
node src/index.mts --key server.key --cert server.crt --port 1935 --flv output.flv

# 標準出力にFLV出力
node src/index.mts --key server.key --cert server.crt --port 1935 --flv -
```

また、vite を使ってバンドルして javascript にまとめられます。

```bash
# dist/tiny-rtmps-server.mjs にバンドルした結果を出力
yarn build
```

## SSL証明書の準備

### 自己署名証明書の生成

```bash
# ワンコマンドで秘密鍵と自己署名証明書を生成（1年有効、RSA 4096bit）
openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 365 -nodes \
  -subj "/C=JP/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

### macOSでの証明書信頼設定

```bash
# システムキーチェーンに証明書を追加（要管理者権限）
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain server.crt
```

## 利用方法

### RTMPS打ち上げ先

デフォルトの設定の場合、以下のURLで利用可能です。

```
rtmps://localhost:1935/live/{ストリームキー}
```

標準ポート443を使用する場合はこちら
```
rtmps://localhost/live/{ストリームキー}
```

### OBS Studio での設定

1. **配信設定**
   - サービス: `カスタム...`
   - サーバー: `rtmps://localhost:1935/live`
   - ストリームキー: 任意（例：`test`）

2. **自己署名証明書の場合**
   - システムの証明書ストアに証明書を追加する

