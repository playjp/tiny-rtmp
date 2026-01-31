import ByteReader from './byte-reader.mts';
import { MessageType } from './message-reader.mts';
import { UserControlType, type Message } from './message-reader.mts';

type AllMessageType = (typeof MessageType)[keyof typeof MessageType];
type ControlMessageType = (typeof MessageType.SetChunkSize | typeof MessageType.Abort | typeof MessageType.Acknowledgement | typeof MessageType.UserControl | typeof MessageType.WindowAcknowledgementSize | typeof MessageType.SetPeerBandwidth);
type AllUserControlType = (typeof UserControlType)[keyof typeof UserControlType];
const allMessageType = new Set<number>(Object.values(MessageType));
const allUserControlType = new Set<number>(Object.values(UserControlType));

const is_valid_message_type_id = (message_type_id: number): message_type_id is AllMessageType => {
  return allMessageType.has(message_type_id);
};

const is_valid_user_control_event_type = (event_type: number): event_type is AllUserControlType => {
  return allUserControlType.has(event_type);
};

export type DecodedUserControl = {
  event_type: typeof UserControlType.StreamBegin;
  message_stream_id: number;
} | {
  event_type: typeof UserControlType.StreamEOF;
  message_stream_id: number;
} | {
  event_type: typeof UserControlType.StreamDry;
  message_stream_id: number;
} | {
  event_type: typeof UserControlType.SetBufferLength;
  message_stream_id: number;
  buffer_length: number;
} | {
  event_type: typeof UserControlType.StreamIsRecorded;
  message_stream_id: number;
} | {
  event_type: typeof UserControlType.PingRequest;
  event_timestamp: number;
} | {
  event_type: typeof UserControlType.PingResponse;
  event_timestamp: number;
};
const DecodedUserControl = {
  from(data: Buffer): DecodedUserControl | null {
    const reader = new ByteReader(data);
    const event_type = reader.readU16BE();
    if (!is_valid_user_control_event_type(event_type)) { return null; }

    switch (event_type) {
      case UserControlType.StreamBegin:
        return { event_type, message_stream_id: reader.readU32BE() };
      case UserControlType.StreamEOF:
        return { event_type, message_stream_id: reader.readU32BE() };
      case UserControlType.StreamDry:
        return { event_type, message_stream_id: reader.readU32BE() };
      case UserControlType.SetBufferLength:
        return { event_type, message_stream_id: reader.readU32BE(), buffer_length: reader.readU32BE() };
      case UserControlType.StreamIsRecorded:
        return { event_type, message_stream_id: reader.readU32BE() };
      case UserControlType.PingRequest:
        return { event_type, event_timestamp: reader.readU32BE() };
      case UserControlType.PingResponse:
        return { event_type, event_timestamp: reader.readU32BE() };
    }
  },
};

export type DecodedMessage = Omit<Message, 'message_type_id' | 'data'> & ({
  message_type_id: typeof MessageType.SetChunkSize;
  chunk_size: number;
} | {
  message_type_id: typeof MessageType.Abort;
  message_stream_id: number;
} | {
  message_type_id: typeof MessageType.Acknowledgement;
  sequence_number: number;
} | {
  message_type_id: typeof MessageType.UserControl;
  user_control: DecodedUserControl;
} | {
  message_type_id: typeof MessageType.WindowAcknowledgementSize;
  ack_window_size: number;
} | {
  message_type_id: typeof MessageType.SetPeerBandwidth;
  ack_window_size: number;
  limit_type: number;
} | {
  message_type_id: Exclude<AllMessageType, ControlMessageType>;
  data: Buffer;
});
export const DecodedMessage = {
  from({ data, message_type_id, ... message }: Message): DecodedMessage | null {
    if (!is_valid_message_type_id(message_type_id)) { return null; }

    const reader = new ByteReader(data);
    switch (message_type_id) {
      case MessageType.SetChunkSize:
        return {
          ... message,
          message_type_id,
          chunk_size: reader.readU32BE() % 2 ** 31,
        };
      case MessageType.Abort:
        return {
          ... message,
          message_type_id,
          message_stream_id: reader.readU32BE(),
        };
      case MessageType.Acknowledgement:
        return {
          ... message,
          message_type_id,
          sequence_number: reader.readU32BE(),
        };
      case MessageType.UserControl: {
        const user_control = DecodedUserControl.from(reader.read());
        if (user_control == null) { return null; }
        return {
          ... message,
          message_type_id,
          user_control,
        };
      }
      case MessageType.WindowAcknowledgementSize:
        return {
          ... message,
          message_type_id,
          ack_window_size: reader.readU32BE(),
        };
      case MessageType.SetPeerBandwidth:
        return {
          ... message,
          message_type_id,
          ack_window_size: reader.readU32BE(),
          limit_type: reader.readU8(),
        };
      default:
        return {
          ... message,
          message_type_id,
          data,
        };
    }
  },
};

export default async function *(iterable: AsyncIterable<Message>): AsyncIterable<DecodedMessage> {
  for await (const message of iterable) {
    const decoded = DecodedMessage.from(message);
    if (decoded == null) { continue; }
    yield decoded;
  }
}
