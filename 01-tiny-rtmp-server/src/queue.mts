class LinkedListNode<T> {
  prev: LinkedListNode<T> | null = null;
  next: LinkedListNode<T> | null = null;
  elem: T | null;

  public constructor(elem?: T) {
    this.elem = elem ?? null;
  }
}

export default class Queue<T> {
  private begin: LinkedListNode<T>;
  private end: LinkedListNode<T>;

  public constructor() {
    this.begin = new LinkedListNode<T>();
    this.end = new LinkedListNode<T>();

    // 先端と終端は自分自身を持つ
    this.begin.prev = this.begin;
    this.end.next = this.end;

    // 連結
    this.begin.next = this.end;
    this.end.prev = this.begin;
  }

  public empty(): boolean {
    return this.begin.next === this.end;
  }

  public push(elem: T): void {
    const node = new LinkedListNode(elem);
    const prev = this.end.prev!;

    // node からみて前の更新
    prev.next = node;
    node.prev = prev;

    // node から見て後の更新
    this.end.prev = node;
    node.next = this.end;
  }

  public peek(): T | null {
    return this.begin.next?.elem ?? null;
  }

  public pop(): T | null {
    const node = this.begin.next!;
    if (node == this.end) { return null; }
    const next = node.next!;

    // 付け替え
    this.begin.next = node.next;
    next.prev = this.begin;

    // クリーンアップ
    node.next = node.prev = null;

    return node.elem;
  }
}
