export default class AckCounter {
  private total: number = 0;
  private difference: number = 0;
  private ack_window_size: number | undefined = undefined;
  private callback: (bytes: number) => void;

  public constructor(callback?: (bytes: number) => void) {
    this.callback = callback ?? ((_: number) => {});
  }

  private call(): void {
    if (this.ack_window_size == null) { return; }
    if (this.ack_window_size > this.difference) { return; }
    this.callback(this.total);
    this.difference = 0;
  }

  public feed(byteLength: number): void {
    this.difference += byteLength;
    this.total += byteLength;
    this.call();
  }

  public window(ack_window_size: number): void {
    this.ack_window_size = ack_window_size;
    this.call();
  }
}
