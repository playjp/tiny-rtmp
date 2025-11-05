import { Writable } from 'node:stream';

import Segment from './segment.mts';

const MINIMUM_LIVE_WINDOW_LENGTH = 3;

export type MediaPlaylistOption = {
  liveWindowLength: number;
  orphanedWindowLength: number;
  minimumSegmentDuration: number;
};

export const MediaPlaylistOption = {
  from(option?: Partial<MediaPlaylistOption>): MediaPlaylistOption {
    return {
      ... option,
      liveWindowLength: Math.max(option?.liveWindowLength ?? MINIMUM_LIVE_WINDOW_LENGTH, MINIMUM_LIVE_WINDOW_LENGTH),
      orphanedWindowLength: Math.max(option?.orphanedWindowLength ?? MINIMUM_LIVE_WINDOW_LENGTH, MINIMUM_LIVE_WINDOW_LENGTH),
      minimumSegmentDuration: Math.max(0, option?.minimumSegmentDuration ?? 0),
    };
  },
};

export default class MediaPlaylist {
  public published: Promise<boolean>;
  private publishedNotify: (success: boolean) => void;

  private sequenceNumber: number = -1;
  private orphanedNumber: number;

  private liveWindowLength: number;
  private orphanedWindowLength: number;

  private currentSegment: Segment | null = null;
  private segmentMap: Map<number, Segment> = new Map<number, Segment>();
  private orphanedMap: Map<number, Segment> = new Map<number, Segment>();

  private minimumSegmentDuration: number;
  private targetduration: number | null = null;

  public constructor(opt?: Partial<MediaPlaylistOption>) {
    const option = MediaPlaylistOption.from(opt);
    this.liveWindowLength = option.liveWindowLength;
    this.orphanedWindowLength = option.orphanedWindowLength;
    this.orphanedNumber = this.sequenceNumber - option.liveWindowLength;
    this.minimumSegmentDuration = option.minimumSegmentDuration;

    const { promise: published, resolve: publishedNotify } = Promise.withResolvers<boolean>();
    this.published = published;
    this.publishedNotify = publishedNotify;
  }

  public append(timestamp: number): void {
    if (this.currentSegment != null && (timestamp - this.currentSegment.begin()) < this.minimumSegmentDuration) {
      return;
    }

    this.currentSegment?.complete(timestamp);
    if (this.currentSegment) {
      this.segmentMap.set(this.sequenceNumber, this.currentSegment);
    }
    if (this.currentSegment?.extinf() != null && this.targetduration == null) {
      this.targetduration = Math.ceil(this.currentSegment.extinf()!);
    }
    if (this.sequenceNumber - this.liveWindowLength >= 0) {
      const sequenceNumber = this.sequenceNumber - this.liveWindowLength;
      const segment = this.segmentMap.get(sequenceNumber);

      if (segment) {
        this.orphanedMap.set(sequenceNumber, segment);
        this.segmentMap.delete(sequenceNumber);
      }
    }
    if (this.orphanedNumber - this.orphanedWindowLength >= 0) {
      const sequenceNumber = this.orphanedNumber - this.orphanedWindowLength;
      this.orphanedMap.delete(sequenceNumber);
    }

    this.sequenceNumber += 1;
    this.orphanedNumber += 1;
    this.currentSegment = new Segment(timestamp);

    if (this.segmentMap.size >= MINIMUM_LIVE_WINDOW_LENGTH) {
      this.publishedNotify(true);
    }
  }

  public feed(data: Iterable<Buffer>): void {
    for (const buffer of data) { this.currentSegment?.feed(buffer); }
  }

  public m3u8(): string {
    let m3u8 = '';
    m3u8 += '#EXTM3U\n';
    m3u8 += '#EXT-X-VERSION:3\n';
    m3u8 += `#EXT-X-MEDIA-SEQUENCE:${Math.max(0, this.sequenceNumber - this.liveWindowLength)}\n`;
    m3u8 += `#EXT-X-TARGETDURATION:${this.targetduration}\n`;
    m3u8 += '\n';
    for (let i = Math.max(0, this.sequenceNumber - this.liveWindowLength); i < this.sequenceNumber; i++) {
      const segment = this.segmentMap.get(i)!;
      m3u8 += `#EXTINF:${segment.extinf()!.toFixed(6)}\n`;
      m3u8 += `${i}.ts\n`;
    }

    return m3u8;
  }

  public segment(msn: number): Buffer | null {
    return (this.segmentMap.get(msn) ?? this.orphanedMap.get(msn))?.segment() ?? null;
  }
}
