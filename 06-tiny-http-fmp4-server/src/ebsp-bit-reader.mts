import BitReader from '../../03-tiny-http-ts-server/src/bit-reader.mts';

const unescaped = Symbol();

export default class EBSPBitReader extends BitReader {
  private fst_byte: number | null | typeof unescaped = null;
  private snd_byte: number | null | typeof unescaped = null;

  public isEOF(): boolean {
    return this.reader.isEOF() && this.fst_byte == null && this.snd_byte == null && this.bits_offset >= 8;
  }

  protected fill(): void {
    let byte: number | null | typeof unescaped = !this.reader.isEOF() ?this.reader.readU8() : null;

    // unescape ebsp to rbsp
    if (this.fst_byte === 0 && this.snd_byte === 0 && byte === 3) {
      byte = unescaped;
    }

    if (typeof this.fst_byte === 'number') {
      this.bits = this.fst_byte;
      this.bits_offset = 0;
    } else if (this.fst_byte === unescaped) {
      this.consumed += 8;
    }

    this.fst_byte = this.snd_byte;
    this.snd_byte = byte;
  }
};
