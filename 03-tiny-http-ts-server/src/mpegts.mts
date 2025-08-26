import BitBuilder from './bit-builder.mts';
import BitReader from './bit-reader.mts';

const PACKET_SIZE = 188;
const HEADER_SIZE = 4;
const PAYLOAD_SIZE = PACKET_SIZE - HEADER_SIZE;
const SYNC_BYTE = 0x47;
const STUFFING_BYTE = 0xFF;

const pes_not_contain_flags = new Set([0xBC, 0xBE, 0xBF, 0xF0, 0xF1, 0xFF, 0xF2, 0xF8]);
const pes_has_flags = (stream_id: number) => {
  return !pes_not_contain_flags.has(stream_id);
};

const crc32_table = new Uint32Array(256);
for (let i = 0; i < crc32_table.length; i++) {
  let c = i << 24;
  for (let j = 0; j < 8; j++) {
    c = ((c << 1) ^ ((c & 0x80000000) ? 0x04c11db7 : 0)) >>> 0;
  }
  crc32_table[i] = c;
}
const crc32 = (data: Buffer) => {
  let crc = 0xFFFFFFFF;
  for (const datum of data) {
    crc = ((crc << 8) ^ crc32_table[((crc >>> 24) ^ datum) & 0xFF]) >>> 0;
  }
  return crc;
};

export type PAT = {
  transport_stream_id: number;
  programs: {
    program_number: number;
    program_map_PID: number;
  }[];
};

export const write_pat = (pat: PAT) => {
  const builder = new BitBuilder();

  builder.writeBits(0x00, 8); // table_id
  builder.writeBits(1, 1); // section_syntax_indicator
  builder.writeBits(0, 1); // 0
  builder.writeBits(0b11, 2); // reserved
  builder.writeBits(0, 12); // section_length
  builder.writeBits(pat.transport_stream_id, 16); // transport_stream_id
  builder.writeBits(0b11, 2); // reserved
  builder.writeBits(0, 5); // version_number
  builder.writeBits(0b1, 1); // current_next_indicator
  builder.writeBits(0, 8); // section_number
  builder.writeBits(0, 8); // last_section_number
  for (const { program_number, program_map_PID } of pat.programs) {
    builder.writeBits(program_number, 16); // program_number
    builder.writeBits(0b111, 3); // reserved
    builder.writeBits(program_map_PID, 13); // program_map_PID
  }
  builder.writeBits(0, 32); // CRC32
  const section = builder.build();
  section.writeUInt16BE(section.readUInt16BE(1) | ((section.byteLength - 3) & 0x0FFF), 1);
  section.writeUInt32BE(crc32(section.subarray(0, -4)), section.byteLength - 4);

  return section;
};

export const StreamType = {
  PRIVATE_DATA: 0x06,
  AAC_ADTS: 0x0f,
  AAC_LATM: 0x11,
  AVC: 0x1b,
  METADATA: 0x15,
  HEVC: 0x24,
};

export type PMT = {
  program_number: number;
  pcr_pid: number;
  program_info?: Buffer;
  streams: {
    stream_type: number;
    elementary_PID: number;
    ES_info?: Buffer;
  }[];
};

export const write_pmt = (pmt: PMT) => {
  const builder = new BitBuilder();

  builder.writeBits(0x02, 8); // table_id
  builder.writeBits(1, 1); // section_syntax_indicator
  builder.writeBits(0, 1); // 0
  builder.writeBits(0b11, 2); // reserved
  builder.writeBits(0, 12); // section_length
  builder.writeBits(pmt.program_number, 16); // program_number
  builder.writeBits(0b11, 2); // reserved
  builder.writeBits(0, 5); // version_number
  builder.writeBits(0b1, 1); // current_next_indicator
  builder.writeBits(0, 8); // section_number
  builder.writeBits(0, 8); // last_section_number
  builder.writeBits(0b111, 3); // reserved
  builder.writeBits(pmt.pcr_pid, 13); // PCR_PID
  builder.writeBits(0b1111, 4); // reserved
  builder.writeBits(pmt.program_info?.byteLength ?? 0, 12); // program_info_length
  builder.writeBytes(pmt.program_info ?? Buffer.from([])); // program_info
  for (const { stream_type, elementary_PID, ES_info } of pmt.streams) {
    builder.writeBits(stream_type, 8); // stream_type
    builder.writeBits(0b111, 3); // reserved
    builder.writeBits(elementary_PID, 13); // elementary_PID
    builder.writeBits(0b1111, 4); // reserved
    builder.writeBits(ES_info?.byteLength ?? 0, 12); // ES_info_length
    builder.writeBytes(ES_info ?? Buffer.from([])); // ES_info
  }
  builder.writeBits(0, 32); // CRC32
  const section = builder.build();
  section.writeUInt16BE(section.readUInt16BE(1) | ((section.byteLength - 3) & 0x0FFF), 1);
  section.writeUInt32BE(crc32(section.subarray(0, -4)), section.byteLength - 4);

  return section;
};

export const write_pes = (data: Buffer, stream_id: number, pts: number | null, dts: number | null, omit_length = false) => {
  if (pts == null) { dts = null; }

  const builder = new BitBuilder();
  const PES_header_data_length = (pts != null ? 5 : 0) + (dts != null ? 5 : 0);

  builder.writeBits(0x000001, 24); // start_code_prefix
  builder.writeBits(stream_id, 8); // stream_id
  builder.writeBits(0, 16); // pes_length
  if (pes_has_flags(stream_id)) {
    builder.writeBits(0b10000000, 8);
    builder.writeBits(pts != null ? 0b1 : 0b0, 1); // pts present
    builder.writeBits(dts != null ? 0b1 : 0b0, 1); // dts present
    builder.writeBits(0b000000, 6);
    builder.writeBits(PES_header_data_length, 8); // PES_header_data_length
    if (pts != null) {
      const pts_binary = Buffer.alloc(5);
      pts_binary.writeUIntBE(pts, 0, 5);
      const reader = new BitReader(pts_binary);
      reader.skipBits(7);

      builder.writeBits(dts != null ? 0b0011 : 0b0010, 4);
      builder.writeBits(reader.readBits(3), 3);
      builder.writeBits(0b1, 1); // marker
      builder.writeBits(reader.readBits(15), 15);
      builder.writeBits(0b1, 1); // marker
      builder.writeBits(reader.readBits(15), 15);
      builder.writeBits(0b1, 1); // marker
    }
    if (dts != null) {
      const dts_binary = Buffer.alloc(5);
      dts_binary.writeUIntBE(dts, 0, 5);
      const reader = new BitReader(dts_binary);
      reader.skipBits(7);

      builder.writeBits(0b0001, 4);
      builder.writeBits(reader.readBits(3), 3);
      builder.writeBits(0b1, 1); // marker
      builder.writeBits(reader.readBits(15), 15);
      builder.writeBits(0b1, 1); // marker
      builder.writeBits(reader.readBits(15), 15);
      builder.writeBits(0b1, 1); // marker
    }
  }
  const header = builder.build();
  const pes = Buffer.concat([header, data]);
  if (!omit_length) { pes.writeUInt16BE(pes.byteLength - 6, 4); }
  return pes;
};

export class SectionPacketizer {
  private continuity_counter: number = 0;
  private pid: number;

  public constructor(pid: number) {
    this.pid = pid;
  }

  public *packetize(section: Buffer): Iterable<Buffer> {
    for (let i = 0; i < section.byteLength; i += (PAYLOAD_SIZE - (i === 0 ? 1 : 0))) {
      const packet = Buffer.alloc(PACKET_SIZE, 0xFF);
      const length = Math.min(i + (PAYLOAD_SIZE - (i === 0 ? 1 : 0)), section.byteLength) - i;

      const builder = new BitBuilder();
      builder.writeBits(SYNC_BYTE, 8);
      builder.writeBits(0, 1); // transport_err_indicator
      builder.writeBits(i === 0 ? 1 : 0, 1); // payload_unit_start_indicator
      builder.writeBits(0, 1); // transport_priority
      builder.writeBits(this.pid, 13);
      builder.writeBits(0, 2); // transport_scrambling_control
      builder.writeBool(false); // adaptation_field_control (adaptation_field present)
      builder.writeBool(true); // adaptation_field_control (payload present)
      builder.writeBits(this.continuity_counter, 4); // continiuty_counter
      if (i === 0) { builder.writeBits(0, 8); } // pointer_field

      const header = builder.build();
      header.copy(packet, 0);
      section.copy(packet, header.byteLength, i, i + length);

      yield packet;
      this.continuity_counter = (this.continuity_counter + 1) & 0x0F;
    }
  }
}

export class PESPacketizer {
  private continuity_counter: number = 0;
  private pid: number;

  public constructor(pid: number) {
    this.pid = pid;
  }

  public *packetize(pes: Buffer): Iterable<Buffer> {
    for (let i = 0; i < pes.byteLength; i += PAYLOAD_SIZE) {
      const packet = Buffer.alloc(PACKET_SIZE, 0xFF);
      const length = Math.min(i + PAYLOAD_SIZE, pes.byteLength) - i;
      const filler = PAYLOAD_SIZE - length;

      const builder = new BitBuilder();
      builder.writeBits(SYNC_BYTE, 8);
      builder.writeBits(0, 1); // transport_err_indicator
      builder.writeBits(i === 0 ? 1 : 0, 1); // payload_unit_start_indicator
      builder.writeBits(0, 1); // transport_priority
      builder.writeBits(this.pid, 13);
      builder.writeBits(0, 2); // transport_scrambling_control
      builder.writeBool(filler > 0); // adaptation_field_control (adaptation_field present)
      builder.writeBool(true); // adaptation_field_control (payload present)
      builder.writeBits(this.continuity_counter, 4); // continiuty_counter
      if (filler > 0) { builder.writeBits(filler - 1, 8); }
      if (filler > 1) { builder.writeBits(0, 8); }

      const header = builder.build();
      header.copy(packet, 0);
      pes.copy(packet, header.byteLength + Math.max(filler - 2, 0), i, i + length);

      yield packet;
      this.continuity_counter = (this.continuity_counter + 1) & 0x0F;
    }
  }
}

export class PCRPacketizer {
  private pid: number;

  public constructor(pid: number) {
    this.pid = pid;
  }

  public packetize(pcr: number): Buffer {
    const packet = Buffer.alloc(PACKET_SIZE, STUFFING_BYTE);

    const builder = new BitBuilder();
    builder.writeBits(SYNC_BYTE, 8);
    builder.writeBits(0, 1); // transport_err_indicator
    builder.writeBits(0, 1); // payload_unit_start_indicator
    builder.writeBits(0, 1); // transport_priority
    builder.writeBits(this.pid, 13);
    builder.writeBits(0, 2); // transport_scrambling_control
    builder.writeBool(true); // adaptation_field_control (adaptation_field_present)
    builder.writeBool(false); // adaptation_field_control (payload present)
    builder.writeBits(0, 4); // continiuty_counter
    builder.writeBits(PACKET_SIZE - HEADER_SIZE - 1, 8); // adaptation field length
    builder.writeBits(0x10, 8); // PCR is Present
    builder.writeBits(pcr, 33); // PCR base
    builder.writeBits(0, 6); // reserved
    builder.writeBits(0, 9); // PCR extension

    builder.build().copy(packet);
    return packet;
  }
}
