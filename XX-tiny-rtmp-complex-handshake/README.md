# Complex Handshake 対応版RTMP受信サーバ

RTMP Complex Handshake に対応したRTMP受信サーバの実装です。

※ FFmpeg でしか検証していません

## 主要コンポーネント

- rtmp-session.mts - RTMPセッション管理とComplex Handshake処理


## 実行方法

Node.js のネイティブTypeScript実行機能により、以下のコマンドで実行できます。

```bash
# 基本的な起動
node src/index.mts

# カスタムポートで起動
node src/index.mts --port 8080

# FLVファイルに出力
node src/index.mts --flv output.flv

# 標準出力にFLVデータを出力
node src/index.mts --flv -
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

## メモ

### Complex Handshake とは

Adobe Flash Player と Flash Media Server の間で使用される、署名検証を含むプロトコル

### 処理フロー

- Scheme 0 と Scheme 1 の両方に対応
- C1 の検証に失敗した場合、Simple Handshake へ自動フォールバック
- C2 の検証に失敗した場合も、署名検証を行わず Echo の検証へフォールバック
