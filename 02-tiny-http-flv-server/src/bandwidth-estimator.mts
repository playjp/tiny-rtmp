export class BandwidthQuotaExceededError extends Error {
  constructor(message: string, option?: ErrorOptions) {
    super(message, option);
    this.name = this.constructor.name;
  }
}

export type BandwidthEstimatorOption = {
  intervalMills: number;
  movingAverageLength: number;
};
export const BandwidthEstimatorOption = {
  from(option?: Partial<BandwidthEstimatorOption>): BandwidthEstimatorOption {
    return {
      intervalMills: option?.intervalMills ?? 100,
      movingAverageLength: option?.movingAverageLength ?? 10,
    };
  },
};

export default class BandwidthEstimator {
  private option: BandwidthEstimatorOption;
  private controller: AbortController;
  private limit: number;
  private timerId: NodeJS.Timeout | null = null;
  private readonly measureHandler = this.measure.bind(this);
  private estimates: number[] = [];
  private movingAverageLength: number;
  private totalBytes: number = 0;
  private previousTime: DOMHighResTimeStamp = performance.now();

  public constructor(limit: number, controller: AbortController, option?: Partial<BandwidthEstimatorOption>) {
    this.limit = limit;
    this.controller = controller;
    this.option = BandwidthEstimatorOption.from(option);
    this.movingAverageLength = this.option.movingAverageLength;
    this.timerId = setInterval(this.measureHandler, this.option.intervalMills);
  }

  public feed(byteLength: number) {
    this.totalBytes += byteLength;
  }

  public estimate(): number {
    return this.estimates.reduce((sum, curr) => sum + curr, 0) / Math.min(this.estimates.length, this.movingAverageLength);
  }

  public measure(): void {
    const currentTime = performance.now();
    const duration = (currentTime - this.previousTime) / 1000;
    const bandwidth = (this.totalBytes * 8) / duration;
    this.estimates.push(bandwidth);

    if (this.estimates.length >= this.movingAverageLength) {
      this.estimates.splice(0, this.estimates.length - this.movingAverageLength);
      const average = this.estimate();
      if (average >= this.limit) {
        this.controller.abort(new BandwidthQuotaExceededError(`Bandwidth quota exceeded! limit: ${this.limit}bps, actual: ${Math.ceil(average)}bps`));
      }
    }

    this.previousTime = currentTime;
    this.totalBytes = 0;
  }

  public destroy(): void {
    if (this.timerId == null) { return; }
    clearInterval(this.timerId);
    this.timerId = null;
  }
  public [Symbol.dispose](): void {
    this.destroy();
  }
}
