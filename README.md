# Tiny-RTMP

このリポジトリはNode.jsで小さいRTMPサーバを**外部依存なし**で実装することで、RTMPを取り巻く配信技術の理解を深める事を目的としたリポジトリです。

## おしながき

### メイン
1. [RTMP受信](./01-tiny-rtmp-server/)
    * 実装する機能: RTMPサーバ
2. [HTTP-FLV配信](./02-tiny-http-flv-server/)
    * 実装する機能: HTTP-FLV配信
3. [HTTP-TS配信](./03-tiny-http-ts-server/)
    * 実装する機能: MPEG-TSへのトランスマックス, HTTP-TS配信
4. [HLS配信](./04-tiny-hls-server/)
    * 実装する機能: MPEG-TSのセグメンテーション, HLS配信
5. [LL-HLS配信](./05-tiny-llhls-server/)
    * 実装する機能: LL-HLS配信
6. [HTTP-fMP4配信](./06-tiny-http-fmp4-server/)
    * 実装する機能: fMP4へのトランスマックス, HTTP-fMP4配信
7. [MPEG-DASH配信](./07-tiny-dash-server/)
    * 実装する機能: MPEG-DASH配信
8. [CENC配信](./08-tiny-dash-cenc-server/)
    * 実装する機能: CENC暗号化, ClearKey対応

### おまけ
1. [ユーザ認証(Adobe)対応](./XX-tiny-rtmp-adobe-auth/)
    * 実装する機能: RTMPのユーザ認証 "Adobe Auth" の対応
2. [拡張ハンドシェイク(Complex Handshake)対応](./XX-tiny-rtmp-complex-handshake/)
    * 実装する機能: RTMPの拡張ハンドシェイク "Complex Handshake" の対応
3. [RTMPS対応](./XX-tiny-rtmps-server/)
    * 実装する機能: RTMPのSSL/TLS対応
4. [HTTPS対応](./XX-tiny-rtmps-https-hls-server/)
    * 実装する機能: HLSのHTTPS対応
5. [HTTP2対応](./XX-tiny-rtmps-http2-llhls-server/)
    * 実装する機能: LL-HLSのHTTP2対応
6. [WebSocket対応](./XX-tiny-ws-flv-server/)
    * 実装する機能: WS-FLV対応

## 必要環境

- Node.js v24
- Yarn Workspace で開発用の依存関係を管理しています
    - プロジェクトのルートディレクトリで `yarn` を実行してください

## 参考資料

### 公式情報

- RTMP/FLV ([Enhanced RTMP Normative References](https://github.com/veovera/enhanced-rtmp/tree/main/docs/legacy))
    - [Real Time Messaging Protocol](https://github.com/veovera/enhanced-rtmp/blob/main/docs/legacy/rtmp-v1-0-spec.pdf)
    - [Action Message Format – AMF 0](https://github.com/veovera/enhanced-rtmp/blob/main/docs/legacy/amf0-file-format-spec.pdf)
    - [Flash Video File Format Specification Version 10.1](https://github.com/veovera/enhanced-rtmp/blob/main/docs/legacy/video-file-format-v10-1-spec.pdf)
- Enhanced RTMP ([Enhanced RTMP Documentations](https://github.com/veovera/enhanced-rtmp/tree/main/docs/enhanced))
    - [Enhancing RTMP, FLV](https://github.com/veovera/enhanced-rtmp/blob/main/docs/enhanced/enhanced-rtmp-v1.pdf)
    - [Enhanced RTMP (V2)](https://github.com/veovera/enhanced-rtmp/blob/main/docs/enhanced/enhanced-rtmp-v2.pdf)
- HLS ([HTTP Live Streaming](https://developer.apple.com/streaming/))
    - [HTTP Live Streaming](https://datatracker.ietf.org/doc/html/rfc8216)
    - [HTTP Live Streaming 2nd Edition](https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis)
- MPEG-DASH
    - [ISO/IEC 23009-1](https://www.iso.org/en/contents/data/standard/08/33/83314.html)
- MPEG-TS
    - [ISO/IEC 13818-1](https://www.iso.org/standard/87619.html)
    - [T-REC-H.222.0](https://www.itu.int/rec/T-REC-H.222.0)
- ISOBMFF, MP4
    - ISOBMFF: [ISO/IEC 14496-12](https://www.iso.org/standard/83102.html)
    - MP4: [ISO/IEC 14496-14](https://www.iso.org/standard/79110.html)
- CENC
    - [ISO/IEC 23001-7](https://www.iso.org/standard/84637.html)
- H.264/AVC
    - [ISO/IEC 14496-10](https://www.iso.org/standard/87574.html)
    - [T-REC-H.264](https://www.itu.int/rec/T-REC-H.264)
- AAC (MPEG2, MPEG4)
    - MPEG2-AAC: [ISO/IEC 13818-7](https://www.iso.org/standard/43345.html)
    - MPEG4-AAC: [ISO/IEC 14496-3](https://www.iso.org/standard/76383.html)
