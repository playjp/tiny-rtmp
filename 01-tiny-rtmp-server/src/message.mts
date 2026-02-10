import ByteBuilder from './byte-builder.mts';
import ByteReader from './byte-reader.mts';

class ExhaustiveError extends Error {
  constructor(value: never, message = `Unsupported type: ${value}`) {
    super(message);
  }
}

export type SerializedMessage = {
  message_type_id: number;
  message_stream_id: number;
  timestamp: number;
  data: Buffer;
};

export const MessageType = {
  SetChunkSize: 1,
  Abort: 2,
  Acknowledgement: 3,
  UserControl: 4,
  WindowAcknowledgementSize: 5,
  SetPeerBandwidth: 6,
  Audio: 8,
  Video: 9,
  DataAMF3: 15,
  SharedObjectAMF3: 16,
  CommandAMF3: 17,
  DataAMF0: 18,
  SharedObjectAMF0: 19,
  CommandAMF0: 20,
  Aggregate: 22,
} as const;

export const UserControlType = {
  StreamBegin: 0,
  StreamEOF: 1,
  StreamDry: 2,
  SetBufferLength: 3,
  StreamIsRecorded: 4,
  PingRequest: 6,
  PingResponse: 7,
} as const;

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

export type UserControl = {
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
const UserControl = {
  from(data: Buffer): UserControl | null {
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
      default:
        throw new ExhaustiveError(event_type);
    }
  },
  into(control: UserControl): Buffer {
    const builder = new ByteBuilder();
    builder.writeU16BE(control.event_type);
    switch (control.event_type) {
      case UserControlType.StreamBegin:
        builder.writeU32BE(control.message_stream_id);
        break;
      case UserControlType.StreamEOF:
        builder.writeU32BE(control.message_stream_id);
        break;
      case UserControlType.StreamDry:
        builder.writeU32BE(control.message_stream_id);
        break;
      case UserControlType.SetBufferLength:
        builder.writeU32BE(control.message_stream_id);
        builder.writeU32BE(control.buffer_length);
        break;
      case UserControlType.StreamIsRecorded:
        builder.writeU32BE(control.message_stream_id);
        break;
      case UserControlType.PingRequest:
        builder.writeU32BE(control.event_timestamp);
        break;
      case UserControlType.PingResponse:
        builder.writeU32BE(control.event_timestamp);
        break;
      default:
        throw new ExhaustiveError(control);
    }
    return builder.build();
  },
};

export type Message = Omit<SerializedMessage, 'message_type_id' | 'data'> & ({
  message_type_id: typeof MessageType.SetChunkSize;
  data: {
    chunk_size: number;
  };
} | {
  message_type_id: typeof MessageType.Abort;
  data: {
    chunk_stream_id: number;
  };
} | {
  message_type_id: typeof MessageType.Acknowledgement;
  data: {
    sequence_number: number;
  };
} | {
  message_type_id: typeof MessageType.UserControl;
  data: UserControl;
} | {
  message_type_id: typeof MessageType.WindowAcknowledgementSize;
  data: {
    ack_window_size: number;
  };
} | {
  message_type_id: typeof MessageType.SetPeerBandwidth;
  data: {
    ack_window_size: number;
    limit_type: number;
  };
} | {
  message_type_id: Exclude<AllMessageType, ControlMessageType>;
  data: Buffer;
});
export const Message = {
  from({ message_type_id, data, ... message }: SerializedMessage): Message | null {
    if (!is_valid_message_type_id(message_type_id)) { return null; }

    const reader = new ByteReader(data);
    switch (message_type_id) {
      case MessageType.SetChunkSize:
        return {
          ... message,
          message_type_id,
          data: {
            chunk_size: Math.max(1, reader.readU32BE() % 2 ** 31),
          },
        };
      case MessageType.Abort:
        return {
          ... message,
          message_type_id,
          data: {
            chunk_stream_id: reader.readU32BE(),
          },
        };
      case MessageType.Acknowledgement:
        return {
          ... message,
          message_type_id,
          data: {
            sequence_number: reader.readU32BE(),
          },
        };
      case MessageType.UserControl: {
        const user_control = UserControl.from(reader.read());
        if (user_control == null) { return null; }
        return {
          ... message,
          message_type_id,
          data: user_control,
        };
      }
      case MessageType.WindowAcknowledgementSize:
        return {
          ... message,
          message_type_id,
          data: {
            ack_window_size: reader.readU32BE(),
          },
        };
      case MessageType.SetPeerBandwidth:
        return {
          ... message,
          message_type_id,
          data: {
            ack_window_size: reader.readU32BE(),
            limit_type: reader.readU8(),
          },
        };
      default:
        return {
          ... message,
          message_type_id,
          data,
        };
    }
  },
  into({ message_type_id, data, ... message }: Message): SerializedMessage {
    const builder = new ByteBuilder();
    switch (message_type_id) {
      case MessageType.SetChunkSize:
        builder.writeU32BE(Math.max(1, data.chunk_size) % 2 ** 31);
        break;
      case MessageType.Abort:
        builder.writeU32BE(data.chunk_stream_id);
        break;
      case MessageType.Acknowledgement:
        builder.writeU32BE(data.sequence_number);
        break;
      case MessageType.UserControl:
        builder.write(UserControl.into(data));
        break;
      case MessageType.WindowAcknowledgementSize:
        builder.writeU32BE(data.ack_window_size);
        break;
      case MessageType.SetPeerBandwidth:
        builder.writeU32BE(data.ack_window_size);
        builder.writeU8(data.limit_type);
        break;
      default:
        builder.write(data);
    }
    return {
      ... message,
      message_type_id,
      data: builder.build(),
    };
  },
};

export const SetChunkSize = {
  from({ chunk_size, timestamp }: { chunk_size: number; timestamp: number; }): Message {
    return {
      message_stream_id: 0,
      message_type_id: MessageType.SetChunkSize,
      timestamp,
      data: {
        chunk_size,
      },
    };
  },
};
export const Abort = {
  from({ chunk_stream_id, timestamp }: { chunk_stream_id: number; timestamp: number; }): Message {
    return {
      message_stream_id: 0,
      message_type_id: MessageType.Abort,
      timestamp,
      data: {
        chunk_stream_id,
      },
    };
  },
};
export const Acknowledgement = {
  from({ sequence_number, timestamp }: { sequence_number: number; timestamp: number; }): Message {
    return {
      message_stream_id: 0,
      message_type_id: MessageType.Acknowledgement,
      timestamp,
      data: {
        sequence_number,
      },
    };
  },
};
export const WindowAcknowledgementSize = {
  from({ ack_window_size, timestamp }: { ack_window_size: number; timestamp: number; }): Message {
    return {
      message_stream_id: 0,
      message_type_id: MessageType.WindowAcknowledgementSize,
      timestamp,
      data: {
        ack_window_size,
      },
    };
  },
};
export const SetPeerBandwidth = {
  from({ ack_window_size, limit_type, timestamp }: { ack_window_size: number; limit_type: number; timestamp: number; }): Message {
    return {
      message_stream_id: 0,
      message_type_id: MessageType.SetPeerBandwidth,
      timestamp,
      data: {
        ack_window_size,
        limit_type,
      },
    };
  },
};
export const StreamBegin = {
  from({ message_stream_id, timestamp }: { message_stream_id: number; timestamp: number; }): Message {
    return {
      message_stream_id: 0,
      message_type_id: MessageType.UserControl,
      timestamp,
      data: {
        event_type: UserControlType.StreamBegin,
        message_stream_id,
      },
    };
  },
};
export const StreamEOF = {
  from({ message_stream_id, timestamp }: { message_stream_id: number; timestamp: number; }): Message {
    return {
      message_stream_id: 0,
      message_type_id: MessageType.UserControl,
      timestamp,
      data: {
        event_type: UserControlType.StreamEOF,
        message_stream_id,
      },
    };
  },
};
export const StreamDry = {
  from({ message_stream_id, timestamp }: { message_stream_id: number; timestamp: number; }): Message {
    return {
      message_stream_id: 0,
      message_type_id: MessageType.UserControl,
      timestamp,
      data: {
        event_type: UserControlType.StreamDry,
        message_stream_id,
      },
    };
  },
};
export const SetBufferLength = {
  from({ message_stream_id, buffer_length, timestamp }: { message_stream_id: number; buffer_length: number; timestamp: number; }): Message {
    return {
      message_stream_id: 0,
      message_type_id: MessageType.UserControl,
      timestamp,
      data: {
        event_type: UserControlType.SetBufferLength,
        message_stream_id,
        buffer_length,
      },
    };
  },
};
export const StreamIsRecorded = {
  from({ message_stream_id, timestamp }: { message_stream_id: number; timestamp: number; }): Message {
    return {
      message_stream_id: 0,
      message_type_id: MessageType.UserControl,
      timestamp,
      data: {
        event_type: UserControlType.StreamIsRecorded,
        message_stream_id,
      },
    };
  },
};
export const PingRequest = {
  from({ event_timestamp, timestamp }: { event_timestamp: number; timestamp: number; }): Message {
    return {
      message_stream_id: 0,
      message_type_id: MessageType.UserControl,
      timestamp,
      data: {
        event_type: UserControlType.PingRequest,
        event_timestamp,
      },
    };
  },
};
export const PingResponse = {
  from({ event_timestamp, timestamp }: { event_timestamp: number; timestamp: number; }): Message {
    return {
      message_stream_id: 0,
      message_type_id: MessageType.UserControl,
      timestamp,
      data: {
        event_type: UserControlType.PingResponse,
        event_timestamp,
      },
    };
  },
};
