import { Writable } from 'node:stream';
import { MessageType } from './message.mts';
import type { SerializedMessage } from './message.mts';
import read_amf0, { isAMF0Object } from './amf0-reader.mts';

export default class FLVWriter {
  private output: Writable;
  private initialized: boolean = false;

  public constructor(output: Writable) {
    this.output = output;
  }

  private is_valid_flv_tag(message: SerializedMessage): boolean {
    if (message.message_type_id === MessageType.Audio) { return true; }
    if (message.message_type_id === MessageType.Video) { return true; }
    if (message.message_type_id === MessageType.DataAMF0) { return true; }
    return false;
  }

  private write_flv_header(onMetaData?: Record<string, any>) {
    const has_audio = onMetaData == null ? true : onMetaData.audiocodecid != null;
    const has_video = onMetaData == null ? true : onMetaData.videocodecid != null;

    // FLV Header
    this.output.write(Buffer.from([
      0x46, 0x4C, 0x56, // Signature (FLV)
      1, // version
      (has_audio ? 4 : 0) | (has_video ? 1 : 0),
      0, 0, 0, 9, // Header Bytes
      0, 0, 0, 0, // PreviousTagSize0
    ]));
    this.initialized = true;
  }

  public write(message: SerializedMessage): void {
    if (!this.is_valid_flv_tag(message)) { return; }
    if (!this.initialized) {
      const scriptdata = message.message_type_id === MessageType.DataAMF0 ? read_amf0(message.data) : undefined;
      const is_metadata = scriptdata?.length === 2 && scriptdata?.[0] === 'onMetaData';
      this.write_flv_header(is_metadata && isAMF0Object(scriptdata?.[1]) ? scriptdata[1] : undefined);
    }

    const header = Buffer.alloc(11);
    header.writeUIntBE(message.message_type_id, 0, 1);
    header.writeUIntBE(message.data.byteLength, 1, 3);
    header.writeUInt8(Math.floor(message.timestamp / (2 ** 16)) % (2 ** 8), 4);
    header.writeUInt8(Math.floor(message.timestamp / (2 **  8)) % (2 ** 8), 5);
    header.writeUInt8(Math.floor(message.timestamp / (2 **  0)) % (2 ** 8), 6);
    header.writeUInt8(Math.floor(message.timestamp / (2 ** 24)) % (2 ** 8), 7);
    header.writeUIntBE(0, 8, 3);
    this.output.write(header);

    this.output.write(message.data);

    const previousTagSize = Buffer.alloc(4);
    previousTagSize.writeUInt32BE(header.byteLength + message.data.byteLength, 0);
    this.output.write(previousTagSize);
  }

  public close(): void {
    // 標準出力と標準エラー出力は閉じると他に影響するので閉じない
    if (this.output === process.stdout) { return; }
    if (this.output === process.stderr) { return; }
    this.output.end();
  }
  public [Symbol.dispose](): void { this.close(); }
}
