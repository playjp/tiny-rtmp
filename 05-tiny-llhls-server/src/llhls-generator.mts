import { Writable } from 'node:stream';

import type { Message } from '../../01-tiny-rtmp-server/src/message-reader.mts';

import { read_avc_decoder_configuration_record, write_annexb_avc } from '../../03-tiny-http-ts-server/src/avc.mts';
import type { AVCDecoderConfigurationRecord } from '../../03-tiny-http-ts-server/src/avc.mts';
import { read_audio_specific_config, write_adts_aac } from '../../03-tiny-http-ts-server/src/aac.mts';
import type { AudioSpecificConfig } from '../../03-tiny-http-ts-server/src/aac.mts';
import handle_rtmp_payload, { FrameType } from '../../03-tiny-http-ts-server/src/rtmp-handler.mts';
import { SectionPacketizer, PESPacketizer, PCRPacketizer, write_pat, write_pmt, write_pes, StreamType } from '../../03-tiny-http-ts-server/src/mpegts.mts';
import type { PAT, PMT } from '../../03-tiny-http-ts-server/src/mpegts.mts';

import MediaPlaylist from './media-playlist.mts';

const PMT_PID = 256;
const PCR_PID = 257;
const AVC_PID = 258;
const AAC_PID = 259;
const PAT_DATA = {
  transport_stream_id: 0,
  programs: [{
    program_number: 1,
    program_map_PID: PMT_PID,
  }],
} as const satisfies PAT;
const PMT_DATA = {
  program_number: 1,
  pcr_pid: PCR_PID,
  streams: [{
    stream_type: StreamType.AVC,
    elementary_PID: AVC_PID,
  }, {
    stream_type: StreamType.AAC_ADTS,
    elementary_PID: AAC_PID,
  }],
} as const satisfies PMT;
const emit_PSI_interval = 100;

const timestamp_from_rtmp_to_mpegts = (timestamp: number): number => {
  return (timestamp * 90) % 2 ** 33;
};

const timestamp_from_rtmp_to_hls = (timestamp: number): number => {
  return timestamp / 1000;
};

export type LLHLSGeneratorOption = {
  liveWindowLength: number;
  partialSegmentDuration: number;
};

export const LLHLSGeneratorOption = {
  from(option?: Partial<LLHLSGeneratorOption>): LLHLSGeneratorOption {
    return {
      liveWindowLength: 3,
      partialSegmentDuration: 1,
      ... option,
    };
  },
};


export default class LLHLSGenerator {
  private option: LLHLSGeneratorOption;

  private avcDecoderConfigurationRecord: AVCDecoderConfigurationRecord | null = null;
  private audioSpecificConfig: AudioSpecificConfig | null = null;
  private patPacketizer = new SectionPacketizer(0);
  private pmtPacketizer = new SectionPacketizer(PMT_PID);
  private pcrPacketizer = new PCRPacketizer(PCR_PID);
  private avcPacketizer = new PESPacketizer(AVC_PID);
  private aacPacketizer = new PESPacketizer(AAC_PID);
  private last_emit_PSI_timestamp: number | null = null;

  private playlist: MediaPlaylist;

  public constructor(option?: Partial<LLHLSGeneratorOption>) {
    this.option = LLHLSGeneratorOption.from(option);
    this.playlist = new MediaPlaylist({
      liveWindowLength: this.option.liveWindowLength,
      partialSegmentDuration: this.option.partialSegmentDuration,
    });
  }

  public published(): Promise<boolean> {
    return this.playlist.published;
  }

  public stream(msn: number, part: number | null, writable: Writable, cb?: (found: boolean) => void): void {
    return this.playlist.stream(msn, part, writable, cb);
  }

  public block(msn: number, part: number | null): Promise<void> {
    return this.playlist.block(msn, part);
  }

  public m3u8(): string {
    return this.playlist.m3u8();
  }

  public feed(message: Message): void {
    const payload = handle_rtmp_payload(message);
    if (payload == null) { return; }

    switch (payload.kind) {
      case 'Video':
        if (payload.codec !== 'AVC') { return; }
        if (payload.packetType === 0) {
          this.avcDecoderConfigurationRecord = read_avc_decoder_configuration_record(payload.avcDecoderConfigurationRecord);
          return;
        }
        if (payload.frameType === FrameType.KEY_FRAME) {
          this.playlist.append(timestamp_from_rtmp_to_hls(payload.timestamp));
          this.playlist.feed([
            ... this.patPacketizer.packetize(write_pat(PAT_DATA)),
            ... this.pmtPacketizer.packetize(write_pmt(PMT_DATA)),
            this.pcrPacketizer.packetize(timestamp_from_rtmp_to_mpegts(payload.timestamp)),
          ], timestamp_from_rtmp_to_hls(payload.timestamp));
          this.last_emit_PSI_timestamp = payload.timestamp;
        }
        break;
      case 'Audio':
        if (payload.codec !== 'AAC') { return; }
        if (payload.packetType === 0) {
          this.audioSpecificConfig = read_audio_specific_config(payload.audioSpecificConfig);
          return;
        }
        break;
      default:
        return;
    }

    if (this.last_emit_PSI_timestamp != null && (message.timestamp - this.last_emit_PSI_timestamp) >= emit_PSI_interval) {
      this.playlist.feed([
        ... this.patPacketizer.packetize(write_pat(PAT_DATA)),
        ... this.pmtPacketizer.packetize(write_pmt(PMT_DATA)),
        this.pcrPacketizer.packetize(timestamp_from_rtmp_to_mpegts(message.timestamp)),
      ], timestamp_from_rtmp_to_hls(message.timestamp));
      this.last_emit_PSI_timestamp = message.timestamp;
    }

    switch (payload.kind) {
      case 'Video':
        if (this.avcDecoderConfigurationRecord == null) { return; }
        this.playlist.feed(this.avcPacketizer.packetize(
          write_pes(
            write_annexb_avc(payload.data, this.avcDecoderConfigurationRecord),
            0xe0, // 0b1110XXXX: H.262/H.263/H.264/H.265 Video, stream number = 0
            timestamp_from_rtmp_to_mpegts(payload.timestamp + payload.compositionTimeOffset),
            timestamp_from_rtmp_to_mpegts(payload.timestamp),
            true,
          ),
        ), timestamp_from_rtmp_to_hls(payload.timestamp), payload.frameType === FrameType.KEY_FRAME);
        break;
      case 'Audio':
        if (this.audioSpecificConfig == null) { return; }
        this.playlist.feed(this.aacPacketizer.packetize(
          write_pes(
            write_adts_aac(payload.data, this.audioSpecificConfig),
            0xc0, // 0b111XXXXX: AAC Audio, stream number = 0
            timestamp_from_rtmp_to_mpegts(payload.timestamp),
            null,
            false,
          ),
        ), timestamp_from_rtmp_to_hls(payload.timestamp), false); // AAC は Audio Only なら true
        break;
    }
  }
}
