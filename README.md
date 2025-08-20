# Tiny-RTMP

このリポジトリはNode.jsで小さいRTMPサーバを**外部依存なし**で実装することで、RTMPを取り巻く配信技術の理解を深める事を目的としたリポジトリです。

## おしながき

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
6. [RTMPS対応](./06-tiny-rtmps-server/)
    * 実装する機能: RTMPのSSL/TLS対応
7. [HTTPS対応](./07-tiny-rtmps-https-hls-server/)
    * 実装する機能: HLSのHTTPS対応
8. [HTTP2対応](./08-tiny-rtmps-http2-llhls-server/)
    * 実装する機能: LL-HLSのHTTP2対応

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
- MPEG-TS
    - [ISO/IEC 13818-1](https://www.iso.org/standard/87619.html)
    - [T-REC-H.222.0](https://www.itu.int/rec/T-REC-H.222.0)
- H.264/AVC
    - [ISO/IEC 14496-10](https://www.iso.org/standard/87574.html)
    - [T-REC-H.264](https://www.itu.int/rec/T-REC-H.264)
- AAC (MPEG2, MPEG4)
    - MPEG2-AAC: [ISO/IEC 13818-7](https://www.iso.org/standard/43345.html)
    - MPEG4-AAC: [ISO/IEC 14496-3](https://www.iso.org/standard/76383.html)
