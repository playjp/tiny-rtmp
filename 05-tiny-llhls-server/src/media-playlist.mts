import { Writable } from 'node:stream';

import ConcatenatedSegment from './concatenated-segment.mts';

const MINIMUM_LIVE_WINDOW_LENGTH = 3;

export type MediaPlaylistOption = {
  liveWindowLength: number;
  orphanedWindowLength: number;
  partialSegmentDuration: number;
  minimumSegmentDuration: number;
};

export const MediaPlaylistOption = {
  from(option?: Partial<MediaPlaylistOption>): MediaPlaylistOption {
    return {
      ... option,
      liveWindowLength: Math.max(option?.liveWindowLength ?? MINIMUM_LIVE_WINDOW_LENGTH, MINIMUM_LIVE_WINDOW_LENGTH),
      orphanedWindowLength: Math.max(option?.orphanedWindowLength ?? MINIMUM_LIVE_WINDOW_LENGTH, MINIMUM_LIVE_WINDOW_LENGTH),
      partialSegmentDuration: Math.max(option?.partialSegmentDuration ?? 0.25, 0.25),
      minimumSegmentDuration: Math.max(option?.minimumSegmentDuration ?? 0, 0),
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
  private partialSegmentDuration: number;

  private currentSegment: ConcatenatedSegment | null = null;
  private segmentMap: Map<number, ConcatenatedSegment> = new Map<number, ConcatenatedSegment>();
  private orphanedMap: Map<number, ConcatenatedSegment> = new Map<number, ConcatenatedSegment>();

  private minimumSegmentDuration: number;
  private targetduration: number | null = null;

  public constructor(opt?: Partial<MediaPlaylistOption>) {
    const option = MediaPlaylistOption.from(opt);
    this.liveWindowLength = option.liveWindowLength;
    this.orphanedWindowLength = option.orphanedWindowLength;
    this.orphanedNumber = this.sequenceNumber - option.liveWindowLength;
    this.partialSegmentDuration = option.partialSegmentDuration;
    this.minimumSegmentDuration = option.minimumSegmentDuration;

    const { promise: published, resolve: publishedNotify } = Promise.withResolvers<boolean>();
    this.published = published;
    this.publishedNotify = publishedNotify;
  }

  public append(timestamp: number) {
    if (this.currentSegment != null && (timestamp - this.currentSegment.begin()) < this.minimumSegmentDuration) {
      return;
    }
    const previousSegment = this.currentSegment;

    this.currentSegment?.complete(timestamp, false);
    if (this.currentSegment) {
      this.segmentMap.set(this.sequenceNumber, this.currentSegment);
      if (this.targetduration == null) {
        this.targetduration = Math.ceil(timestamp - this.currentSegment.begin());
      }
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
    this.currentSegment = new ConcatenatedSegment(timestamp, new Date());
    previousSegment?.notify();

    if (this.segmentMap.size >= MINIMUM_LIVE_WINDOW_LENGTH) {
      this.publishedNotify(true);
    }
  }

  public feed(data: Iterable<Buffer>, timestamp: number, keyframe: boolean = false) {
    if (this.currentSegment != null && (timestamp - this.currentSegment.latestBegin()) > this.partialSegmentDuration) {
      this.currentSegment.partialComplete(this.currentSegment.latestBegin() + this.partialSegmentDuration);
    }

    for (const buffer of data) {
      this.currentSegment?.feed(buffer, keyframe);
    }
  }

  public m3u8(): string {
    let m3u8 = '';
    m3u8 += '#EXTM3U\n';
    m3u8 += '#EXT-X-VERSION:6\n';
    m3u8 += `#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=${(this.partialSegmentDuration * 3.5).toFixed(6)}\n`;
    m3u8 += `#EXT-X-PART-INF:PART-TARGET=${this.partialSegmentDuration.toFixed(6)}\n`;
    m3u8 += `#EXT-X-MEDIA-SEQUENCE:${Math.max(0, this.sequenceNumber - this.liveWindowLength)}\n`;
    m3u8 += `#EXT-X-TARGETDURATION:${this.targetduration}\n`;
    m3u8 += '\n';
    for (let i = Math.max(0, this.sequenceNumber - this.liveWindowLength); i < this.sequenceNumber; i++) {
      const segment = this.segmentMap.get(i)!;
      const programDateTime = segment.programDateTime();
      if (programDateTime != null) {
        m3u8 += `#EXT-X-PROGRAM-DATE-TIME:${programDateTime.toISOString()}\n`;
      }
      for (const [index, part] of segment.enumerate()) {
        m3u8 += `#EXT-X-PART:DURATION=${part.extinf()!.toFixed(6)},URI="${i}_${index}.ts"` + (part.independent() ? ',INDEPENDENT=YES' : '') + '\n';
      }
      m3u8 += `#EXTINF:${segment.extinf()!.toFixed(6)}\n`;
      m3u8 += `${i}.ts\n`;
    }

    if (this.currentSegment == null) { return m3u8; }
    const currentProgramDateTime = this.currentSegment.programDateTime();
    if (currentProgramDateTime != null) {
      m3u8 += `#EXT-X-PROGRAM-DATE-TIME:${currentProgramDateTime.toISOString()}\n`;
    }
    for (const [index, part] of this.currentSegment.enumerate()) {
      const extinf = part.extinf();
      if (extinf != null) {
        m3u8 += `#EXT-X-PART:DURATION=${part.extinf()!.toFixed(6)},URI="${this.sequenceNumber}_${index}.ts"` + (part.independent() ? ',INDEPENDENT=YES' : '') + '\n';
      } else {
        m3u8 += `#EXT-X-PRELOAD-HINT:TYPE=PART,URI="${this.sequenceNumber}_${index}.ts"\n`;
      }
    }

    return m3u8;
  }

  public stream(msn: number, part: number | null, writable: Writable, cb?: (found: boolean) => void): void {
    const segment = msn === this.sequenceNumber ? this.currentSegment : this.segmentMap.get(msn) ?? this.orphanedMap.get(msn);
    if (segment == null) {
      cb?.(false);
      writable.end();
      return;
    }
    if (part == null) {
      cb?.(true);
      segment.attach(writable);
      return;
    }
    const partial = segment.partial(part);
    if (partial == null) {
      cb?.(false);
      writable.end();
      return;
    }
    cb?.(true);
    partial.attach(writable);
    return;
  }

  public block(msn: number, part: number | null): Promise<void> {
    if (msn !== this.sequenceNumber || this.currentSegment == null) {
      return Promise.resolve();
    }
    if (part == null) {
      return this.currentSegment.promise();
    }
    const partial = this.currentSegment.partial(part);
    if (partial == null) {
      return Promise.resolve();
    }
    return partial.promise();
  }
}
