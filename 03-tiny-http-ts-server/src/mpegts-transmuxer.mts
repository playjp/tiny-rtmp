import type { Message } from '../../01-tiny-rtmp-server/src/message-reader.mts';

import { read_avc_decoder_configuration_record, write_annexb_avc } from './avc.mts';
import type { AVCDecoderConfigurationRecord } from './avc.mts';
import { read_audio_specific_config, write_adts_aac } from './aac.mts';
import type { AudioSpecificConfig } from './aac.mts';
import handle_rtmp_payload from './rtmp-handler.mts';
import { SectionPacketizer, PESPacketizer, PCRPacketizer, write_pat, write_pmt, write_pes, StreamType } from './mpegts.mts';
import type { PAT, PMT } from './mpegts.mts';

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

export default class MPEGTSTransmuxer {
  private avcDecoderConfigurationRecord: AVCDecoderConfigurationRecord | null = null;
  private audioSpecificConfig: AudioSpecificConfig | null = null;
  private patPacketizer = new SectionPacketizer(0);
  private pmtPacketizer = new SectionPacketizer(PMT_PID);
  private pcrPacketizer = new PCRPacketizer(PCR_PID);
  private avcPacketizer = new PESPacketizer(AVC_PID);
  private aacPacketizer = new PESPacketizer(AAC_PID);
  private last_emit_PSI_timestamp: number | null = null;

  public *feed(message: Message): Iterable<Buffer> {
    if (this.last_emit_PSI_timestamp == null || (message.timestamp - this.last_emit_PSI_timestamp) >= emit_PSI_interval) {
      const packets = [
        ... this.patPacketizer.packetize(write_pat(PAT_DATA)),
        ... this.pmtPacketizer.packetize(write_pmt(PMT_DATA)),
        this.pcrPacketizer.packetize(timestamp_from_rtmp_to_mpegts(message.timestamp)),
      ];

      yield* packets;
      this.last_emit_PSI_timestamp = message.timestamp;
    }

    const payload = handle_rtmp_payload(message);
    if (payload == null) { return; }

    switch (payload.kind) {
      case 'Video':
        if (payload.codec !== 'AVC') { return; }
        if (payload.packetType === 0) {
          this.avcDecoderConfigurationRecord = read_avc_decoder_configuration_record(payload.avcDecoderConfigurationRecord);
          return;
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

    switch (payload.kind) {
      case 'Video':
        if (this.avcDecoderConfigurationRecord == null) { return; }
        yield* this.avcPacketizer.packetize(
          write_pes(
            write_annexb_avc(payload.data, this.avcDecoderConfigurationRecord),
            0xe0,
            timestamp_from_rtmp_to_mpegts(payload.timestamp + payload.compositionTimeOffset),
            timestamp_from_rtmp_to_mpegts(payload.timestamp),
            true,
          ),
        );
        break;
      case 'Audio':
        if (this.audioSpecificConfig == null) { return; }
        yield* this.aacPacketizer.packetize(
          write_pes(
            write_adts_aac(payload.data, this.audioSpecificConfig),
            0xc0,
            timestamp_from_rtmp_to_mpegts(payload.timestamp),
            null,
            false,
          ),
        );
        break;
    }
  }
}
