import type { Message } from './message.mts';
import { DecodedMessage } from './message.mts';

export default async function *(iterable: AsyncIterable<Message>): AsyncIterable<DecodedMessage> {
  for await (const message of iterable) {
    try {
      const decoded = DecodedMessage.from(message);
      if (decoded == null) { continue; }
      yield decoded;
    } catch {
      // FIXME: ここはログが欲しい
      continue;
    }
  }
}
