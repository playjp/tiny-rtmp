import { Writable } from 'node:stream';

import Segment from '../../04-tiny-hls-server/src/segment.mts';
import { XMLNode } from './xml.mts';

const MINIMUM_LIVE_WINDOW_LENGTH = 3;

export type SegmentTimelineOption = {
  liveWindowLength: number;
  orphanedWindowLength: number;
  minimumSegmentDuration: number;
};

export const SegmentTimelineOption = {
  from(option?: Partial<SegmentTimelineOption>): SegmentTimelineOption {
    return {
      ... option,
      liveWindowLength: Math.max(option?.liveWindowLength ?? MINIMUM_LIVE_WINDOW_LENGTH, MINIMUM_LIVE_WINDOW_LENGTH),
      orphanedWindowLength: Math.max(option?.orphanedWindowLength ?? MINIMUM_LIVE_WINDOW_LENGTH, MINIMUM_LIVE_WINDOW_LENGTH),
      minimumSegmentDuration: Math.max(0, option?.minimumSegmentDuration ?? 0),
    };
  },
};

export default class SegmentTimeline {
  private prefix: string;
  private presentationTimeOffset: number | null = null;

  private sequenceNumber: number = -1;
  private orphanedNumber: number;

  private liveWindowLength: number;
  private orphanedWindowLength: number;

  private initializeSegment: Buffer;
  private currentSegment: Segment | null = null;
  private segmentMap: Map<number, Segment> = new Map<number, Segment>();
  private orphanedMap: Map<number, Segment> = new Map<number, Segment>();

  private minimumSegmentDuration: number;
  private timescale: number;

  public constructor(prefix: string, timescale: number, initialize: Buffer, opt?: Partial<SegmentTimelineOption>) {
    this.prefix = prefix;
    this.timescale = timescale;
    this.initializeSegment = initialize;
    const option = SegmentTimelineOption.from(opt);
    this.liveWindowLength = option.liveWindowLength;
    this.orphanedWindowLength = option.orphanedWindowLength;
    this.orphanedNumber = this.sequenceNumber - option.liveWindowLength;
    this.minimumSegmentDuration = option.minimumSegmentDuration;
  }

  public append(timestamp: number): void {
    if (this.currentSegment != null && (timestamp - this.currentSegment.begin()) < this.minimumSegmentDuration) {
      return;
    }

    this.currentSegment?.complete(timestamp);
    if (this.currentSegment) {
      this.segmentMap.set(this.sequenceNumber, this.currentSegment);
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
    if (this.currentSegment == null) {
      this.presentationTimeOffset = timestamp;
    }
    this.currentSegment = new Segment(timestamp);
  }

  public feed(data: Buffer): void {
    this.currentSegment?.feed(data);
  }

  public template(): XMLNode {
    const template = XMLNode.from('SegmentTemplate', {
      timescale: `${this.timescale}`,
      media: `${this.prefix}_$Number$.m4s`,
      initialization: `${this.prefix}_init.mp4`,
      startNumber: `${Math.max(0, this.sequenceNumber - this.liveWindowLength)}`,
    });

    const timeline = XMLNode.from('SegmentTimeline');
    for (let i = Math.max(0, this.sequenceNumber - this.liveWindowLength); i < this.sequenceNumber; i++) {
      const segment = this.segmentMap.get(i)!;
      const S = XMLNode.from('S', { t: `${segment.begin()}`, d: `${segment.extinf()}` });
      timeline.children.push(S);
    }
    template.children.push(timeline);

    return template;
  }

  public initialize(): Buffer | null {
    return this.initializeSegment;
  }

  public segment(msn: number): Buffer | null {
    return (this.segmentMap.get(msn) ?? this.orphanedMap.get(msn))?.segment() ?? null;
  }
}
