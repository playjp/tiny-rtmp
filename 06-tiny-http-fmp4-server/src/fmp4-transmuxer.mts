import type { Message } from '../../01-tiny-rtmp-server/src/message-reader.mts';
import read_amf0, { isAMF0Object } from '../../01-tiny-rtmp-server/src/amf0-reader.mts';
import type { AMF0Object } from '../../01-tiny-rtmp-server/src/amf0-reader.mts';

import { read_audio_specific_config } from '../../03-tiny-http-ts-server/src/aac.mts';
import handle_rtmp_payload, { FrameType } from '../../03-tiny-http-ts-server/src/rtmp-handler.mts';

import { write_mp4_aac_track_information } from './aac.mts';
import { fragment, initialize, make } from './fmp4.mts';
import { write_mp4_avc_track_information } from './avc.mts';

type VideoInformation = {
  type: number;
  dts: number;
  cto: number;
  data: Buffer;
};

export default class FMP4Transmuxer {
  private avcDecoderConfigurationRecord: Buffer | null = null;
  private audioSpecificConfig: Buffer | null = null;
  private onMetadata: AMF0Object | null = null;

  private initializeSegment: Buffer | null = null;
  private previousVideoInformation: VideoInformation | null = null;
  private aacLatestTimestamp: number | null = null;

  public initialize(): Buffer | null {
    return this.initializeSegment;
  }

  public feed(message: Message): Buffer | null {
    const payload = handle_rtmp_payload(message);
    if (payload == null) { return null; }

    switch (payload.kind) {
      case 'Video':
        if (payload.codec !== 'AVC') { return null; }
        if (payload.packetType === 0) {
          this.avcDecoderConfigurationRecord = payload.avcDecoderConfigurationRecord;
          return null;
        }
        break;
      case 'Audio':
        if (payload.codec !== 'AAC') { return null; }
        if (payload.packetType === 0) {
          this.audioSpecificConfig = payload.audioSpecificConfig;
          return null;
        }
        break;
      case 'Data': {
        const command = read_amf0(message.data);
        if (command.length !== 3 || command[0] !== '@setDataFrame' || command[1] !== 'onMetaData' || !isAMF0Object(command[2])) {
          return null;
        }
        this.onMetadata = command[2];
        return null;
      }
      default:
        return null;
    }

    if (this.onMetadata == null) { return null; }
    if (this.initializeSegment == null) {
      let avc = null;
      if (this.onMetadata.videocodecid != null) {
        if (this.avcDecoderConfigurationRecord == null) { return null; }
        avc = write_mp4_avc_track_information(1, 1000, this.avcDecoderConfigurationRecord);
      }

      let aac = null;
      if (this.onMetadata.audiocodecid != null) {
        if (this.audioSpecificConfig == null) { return null; }
        const { samplingFrequency } = read_audio_specific_config(this.audioSpecificConfig);
        aac = write_mp4_aac_track_information(2, samplingFrequency, this.audioSpecificConfig);
      }

      this.initializeSegment = (make((vector) => {
        initialize(1000,
          [
            ...(avc != null ? [1] : []),
            ...(aac != null ? [2] : []),
          ], vector, (vector) => {
            if (avc) { vector.write(avc); }
            if (aac) { vector.write(aac); }
          },
        );
      }));
    }

    switch (payload.kind) {
      case 'Video': {
        if (this.avcDecoderConfigurationRecord == null) { return null; }
        let frag = null;
        if (this.previousVideoInformation != null) {
          const { type, dts, cto, data } = this.previousVideoInformation;
          const duration = payload.timestamp - dts;
          frag = make((vector) => {
            fragment({ track_id: 1, keyframe: type === FrameType.KEY_FRAME, duration, dts, cto }, data, vector);
          });
        }
        this.previousVideoInformation = {
          type: payload.frameType,
          dts: payload.timestamp,
          cto: payload.compositionTimeOffset,
          data: payload.data,
        };
        return frag;
      }
      case 'Audio': {
        if (this.audioSpecificConfig == null) { return null; }
        if (this.aacLatestTimestamp == null) {
          const { samplingFrequency } = read_audio_specific_config(this.audioSpecificConfig);
          this.aacLatestTimestamp = Math.floor(payload.timestamp * samplingFrequency / 1000);
        } else {
          this.aacLatestTimestamp += 1024;
        }
        return make((vector) => {
          fragment({ track_id: 2, keyframe: true, duration: 1024, dts: this.aacLatestTimestamp!, cto: 0 }, payload.data, vector);
        });
      }
    }
  }
}
