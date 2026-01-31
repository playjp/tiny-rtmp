import type { Message } from '../../01-tiny-rtmp-server/src/message.mts';

import type { AMF0Object } from '../../01-tiny-rtmp-server/src/amf0-reader.mts';
import read_amf0, { isAMF0Object } from '../../01-tiny-rtmp-server/src/amf0-reader.mts';

import { read_audio_specific_config } from '../../03-tiny-http-ts-server/src/aac.mts';
import handle_rtmp_payload, { FrameType } from '../../03-tiny-http-ts-server/src/rtmp-handler.mts';

import { write_mp4_avc_track_information }from '../../06-tiny-http-fmp4-server/src/avc.mts';
import { write_mp4_aac_track_information }from '../../06-tiny-http-fmp4-server/src/aac.mts';

import SegmentTimeline from './segment-timeline.mts';
import { fragment, initialize, make } from '../../06-tiny-http-fmp4-server/src/fmp4.mts';
import { serializeXML, XMLNode } from './xml.mts';
import { aacMimeTypeCodec, avcMimeTypeCodec } from './mimetype.mts';
import { read_avc_decoder_configuration_record } from '../../03-tiny-http-ts-server/src/avc.mts';

type VideoInformation = {
  type: number;
  dts: number;
  cto: number;
  data: Buffer;
};

const RTMP_TIMESCALE = 1000;

export default class DASHGenerator {
  private avcDecoderConfigurationRecord: Buffer | null = null;
  private audioSpecificConfig: Buffer | null = null;
  private onMetadata: AMF0Object | null = null;

  private previousVideoInformation: VideoInformation | null = null;
  private aacLatestTimestamp: number | null = null;

  private liveWindowLength: number;
  private videoTimeline: SegmentTimeline | null;
  private audioTimeline: SegmentTimeline | null;

  private avail = new Date().toISOString();

  public constructor(liveWindowLength: number = 3) {
    this.liveWindowLength = liveWindowLength;
    this.videoTimeline = null;
    this.audioTimeline = null;
  }

  public mpd(): string {
    const declaration = '<?xml version="1.0" encoding="UTF-8"?>';

    const mpd = XMLNode.from('MPD', {
      xmlns: 'urn:mpeg:dash:schema:mpd:2011',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      'xsi:schemaLocation': 'urn:mpeg:dash:schema:mpd:2011 http://standards.iso.org/ittf/PubliclyAvailableStandards/MPEG-DASH_schema_files/DASH-MPD.xsd',
      profiles: 'urn:mpeg:dash:profile:isoff-live:2011',
      type: 'dynamic',
      availabilityStartTime: this.avail,
      publishTime: new Date().toISOString(),
      minimumUpdatePeriod: 'PT1S',
      minBufferTime: 'PT2S',
    });
    const period = XMLNode.from('Period', { start: 'PT0S' });

    if (this.onMetadata?.videocodecid != null && this.avcDecoderConfigurationRecord != null && this.videoTimeline != null) {
      const avcDecoderConfigurationRecord = read_avc_decoder_configuration_record(this.avcDecoderConfigurationRecord);
      const video_adaptetionset = XMLNode.from('AdaptationSet', {
        contentType: 'video',
        mimeType: 'video/mp4',
      });
      const video_representation = XMLNode.from('Representation', {
        id: '1',
        codecs: avcMimeTypeCodec(avcDecoderConfigurationRecord),
      });

      video_representation.children.push(this.videoTimeline.segment_template());
      video_adaptetionset.children.push(video_representation);
      period.children.push(video_adaptetionset);
    }
    if (this.onMetadata?.audiocodecid != null && this.audioSpecificConfig != null && this.audioTimeline != null) {
      const audioSpecificConfig = read_audio_specific_config(this.audioSpecificConfig);
      const audio_adaptetionset = XMLNode.from('AdaptationSet', {
        contentType: 'audio',
        mimeType: 'audio/mp4',
      });

      const audio_representation = XMLNode.from('Representation', {
        id: '2',
        codecs: aacMimeTypeCodec(audioSpecificConfig),
      });
      audio_representation.children.push(this.audioTimeline.segment_template());
      audio_adaptetionset.children.push(audio_representation);
      period.children.push(audio_adaptetionset);
    }
    mpd.children.push(period);

    return declaration + '\n' + serializeXML(mpd);
  }

  public segment(type: string, msn: number): Buffer | null {
    switch (type) {
      case 'video': return this.videoTimeline?.segment(msn) ?? null;
      case 'audio': return this.audioTimeline?.segment(msn) ?? null;
      default: return null;
    }
  }

  public initialize(type: string): Buffer | null {
    switch (type) {
      case 'video': return this.videoTimeline?.initialize() ?? null;
      case 'audio': return this.audioTimeline?.initialize() ?? null;
      default: return null;
    }
  }

  public feed(message: Message): void {
    const payload = handle_rtmp_payload(message);
    if (payload == null) { return; }

    switch (payload.kind) {
      case 'Video':
        if (payload.codec !== 'AVC') { return; }
        if (payload.packetType === 0) {
          this.avcDecoderConfigurationRecord = payload.avcDecoderConfigurationRecord;
          return;
        }
        if (payload.frameType === FrameType.KEY_FRAME) {
          this.videoTimeline?.append(payload.timestamp);
          if (this.aacLatestTimestamp != null) {
            this.audioTimeline?.append(this.aacLatestTimestamp);
          }
        }
        break;
      case 'Audio':
        if (payload.codec !== 'AAC') { return; }
        if (payload.packetType === 0) {
          this.audioSpecificConfig = payload.audioSpecificConfig;
          return;
        }
        break;
      case 'Data': {
        const command = read_amf0(message.data);
        if (command.length !== 3 || command[0] !== '@setDataFrame' || command[1] !== 'onMetaData' || !isAMF0Object(command[2])) {
          return;
        }
        this.onMetadata = command[2];
        return;
      }
      default:
        return;
    }

    if (this.onMetadata == null) { return; }

    if (this.onMetadata.videocodecid != null && this.avcDecoderConfigurationRecord != null && this.videoTimeline == null) {
      const initialization = make((vector) => {
        initialize(RTMP_TIMESCALE, [1], vector, (vector) => {
          vector.write(write_mp4_avc_track_information(1, RTMP_TIMESCALE, this.avcDecoderConfigurationRecord!));
        });
      });
      this.videoTimeline = new SegmentTimeline('video', RTMP_TIMESCALE, initialization, { liveWindowLength: this.liveWindowLength });
    }
    if (this.onMetadata.audiocodecid != null && this.audioSpecificConfig != null && this.audioTimeline == null) {
      const { samplingFrequency } = read_audio_specific_config(this.audioSpecificConfig);
      const initialization = make((vector) => {
        initialize(samplingFrequency, [1], vector, (vector) => {
          vector.write(write_mp4_aac_track_information(1, samplingFrequency, this.audioSpecificConfig!));
        });
      });
      this.audioTimeline = new SegmentTimeline('audio', samplingFrequency, initialization, { liveWindowLength: this.liveWindowLength });
    }

    switch (payload.kind) {
      case 'Video': {
        if (this.videoTimeline == null) { return; }
        if (this.avcDecoderConfigurationRecord == null) { return; }
        if (this.previousVideoInformation != null) {
          const { type, dts, cto, data } = this.previousVideoInformation;
          const duration = payload.timestamp - dts;
          this.videoTimeline.feed(make((vector) => {
            fragment({ track_id: 1, keyframe: type === FrameType.KEY_FRAME, duration, dts, cto }, data, vector);
          }));
        }
        this.previousVideoInformation = {
          type: payload.frameType,
          dts: payload.timestamp,
          cto: payload.compositionTimeOffset,
          data: payload.data,
        };
        return;
      }
      case 'Audio': {
        if (this.audioTimeline == null) { return; }
        if (this.audioSpecificConfig == null) { return; }
        if (this.aacLatestTimestamp == null) {
          const { samplingFrequency } = read_audio_specific_config(this.audioSpecificConfig);
          this.aacLatestTimestamp = Math.floor(payload.timestamp * samplingFrequency / 1000);
        } else {
          this.aacLatestTimestamp += 1024;
        }
        this.audioTimeline.feed(make((vector) => {
          fragment({ track_id: 1, keyframe: true, duration: 1024, dts: this.aacLatestTimestamp!, cto: 0 }, payload.data, vector);
        }));
        return;
      }
    }
  }
}
