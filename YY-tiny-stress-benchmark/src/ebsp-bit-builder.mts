import BitBuilder from "../../03-tiny-http-ts-server/src/bit-builder.mts";

export default class EBSPBitBuilder extends BitBuilder {
  protected fill(): void {
    while (this.bits.length >= 8) {
      let datum = 0;
      for (let i = 0; i < 8; i++) {
        datum = datum * 2 + this.bits.shift()!;
      }

      if (this.data.length < 2) {
        this.data.push(datum);
        continue;
      }

      const fst = this.data[this.data.length - 2];
      const snd = this.data[this.data.length - 1];
      if (fst === 0 && snd === 0) {
        if (datum === 0 || datum === 1 || datum === 2 || datum === 3) {
          this.data.push(0x03);
        }
      }
      this.data.push(datum);
    }
  }
}
