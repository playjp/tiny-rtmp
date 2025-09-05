# Adobe Auth 対応版RTMP受信サーバ

Adobe Auth に対応したRTMP受信サーバの実装です。
※ FFmpeg でしか検証していません

## 主要コンポーネント

- rtmp-session.mts - RTMPセッション管理
- auth-session.mts - Adobe Auth 処理


## 実行方法

Node.js のネイティブTypeScript実行機能により、以下のコマンドで実行できます。

```bash
# 基本的な起動（ユーザー名とパスワードは必須）
node src/index.mts --user myuser --password mypass

# カスタムポートで起動
node src/index.mts --port 8080 --user myuser --password mypass

# FLVファイルに出力
node src/index.mts --user myuser --password mypass --flv output.flv

# 標準出力にFLVデータを出力
node src/index.mts --user myuser --password mypass --flv -
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
rtmp://myuser:mypass@localhost:1935/myapp/mystreamkey
```
