import read_amf0, { isAMF0Object } from '../../01-tiny-rtmp-server/src/amf0-reader.mts';
import type { AMF0Object } from '../../01-tiny-rtmp-server/src/amf0-reader.mts';
import type { Message } from '../../01-tiny-rtmp-server/src/message-reader.mts';

import { PlaylistTimestamp } from '../../04-tiny-hls-server/src/playlist-timestamp.mts';

import { fragment, initialize, make } from '../../06-tiny-http-fmp4-server/src/fmp4.mts';
import { write_mp4_avc_track_information } from '../../06-tiny-http-fmp4-server/src/avc.mts';
import { write_mp4_aac_track_information } from '../../06-tiny-http-fmp4-server/src/aac.mts';

import handle_rtmp_payload, { FrameType } from './rtmp-handler.mts';
import MediaPlaylist from './media-playlist.mts';

type VideoInformation = {
  frameType: number;
  dts: number;
  cto: number;
  data: Buffer;
};

type AudioInformation = {
  dts: number;
  data: Buffer;
};

const RTMP_TIMESCALE = 1000;

export default class HLSGenerator {
  private videoTrack: Buffer | null = null;
  private audioTrack: Buffer | null = null;

  private previousVideoInformation: VideoInformation | null = null;
  private previousAudioInformation: AudioInformation | null = null;

  private onMetadata: AMF0Object | null = null;

  private initialization: Buffer | null = null;
  private playlist: MediaPlaylist;

  public constructor(liveWindowLength: number = 3) {
    this.playlist = new MediaPlaylist({ liveWindowLength });
  }

  public published(): Promise<boolean> {
    return this.playlist.published;
  }

  public segment(msn: number): Buffer | null {
    return this.playlist.segment(msn);
  }

  public initialize(): Buffer | null {
    return this.initialization;
  }

  public m3u8(): string {
    return this.playlist.m3u8();
  }

  public feed(message: Message): void {
    const payload = handle_rtmp_payload(message);
    if (payload == null) { return; }

    switch (payload.kind) {
      case 'Video':
        if (payload.packetType !== 0) { break; }
        switch (payload.codec) {
          case 'AVC':
            this.videoTrack = write_mp4_avc_track_information(1, RTMP_TIMESCALE, payload.avcDecoderConfigurationRecord);
            break;
          case 'HEVC':
            // TODO
            //this.videoTrack = write_mp4_hevc_track_information(1, RTMP_TIMESCALE, payload.hevcDecoderConfigurationRecord);
            break;
        }
        return;
      case 'Audio':
        if (payload.packetType !== 0) { break; }
        switch (payload.codec) {
          case 'AAC':
            this.audioTrack = write_mp4_aac_track_information(2, RTMP_TIMESCALE, payload.audioSpecificConfig);
            break;
        }
        return;
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

    const has_video = this.videoTrack != null;
    const has_audio = this.audioTrack != null;
    const video_ready = this.onMetadata.videocodecid == null || has_video;
    const audio_ready = this.onMetadata.audiocodecid == null || has_audio;
    if (!video_ready || !audio_ready) { return; }

    if (has_video && payload.kind === 'Video' && payload.frameType === FrameType.KEY_FRAME) {
      this.playlist.append(PlaylistTimestamp.fromRTMP(payload.timestamp));
    } else if (has_audio && payload.kind === 'Audio') {
      this.playlist.append(PlaylistTimestamp.fromRTMP(payload.timestamp));
    }

    if (this.initialization == null) {
      this.initialization = make((vector) => {
        initialize(RTMP_TIMESCALE, [1, 2], vector, (vector) => {
          if (this.videoTrack != null) { vector.write(this.videoTrack); }
          if (this.audioTrack != null) { vector.write(this.audioTrack); }
        });
      });
    }

    switch (payload.kind) {
      case 'Video':
        if (this.previousVideoInformation != null) {
          const { frameType: type, dts, cto, data } = this.previousVideoInformation;
          const duration = payload.timestamp - dts;
          this.playlist.feed(make((vector) => {
            fragment({ track_id: 1, keyframe: type === FrameType.KEY_FRAME, duration, dts, cto }, data, vector);
          }));
        }
        this.previousVideoInformation = {
          frameType: payload.frameType,
          dts: payload.timestamp,
          cto: payload.compositionTimeOffset,
          data: payload.data,
        };
        return;
      case 'Audio':
        // FIXME: これは手抜き 各音声コーデックで sample 数から duration を厳密に求めるべき
        if (this.previousAudioInformation != null) {
          const { dts, data } = this.previousAudioInformation;
          const duration = payload.timestamp - dts;
          this.playlist.feed(make((vector) => {
            fragment({ track_id: 2, keyframe: true, duration, dts, cto: 0 }, data, vector);
          }));
        }
        this.previousAudioInformation = {
          dts: payload.timestamp,
          data: payload.data,
        };
        return;
    }
  }
}
