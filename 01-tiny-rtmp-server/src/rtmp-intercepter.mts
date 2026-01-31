import { Duplex, PassThrough, Writable } from "stream";
import AsyncByteReader from "./async-byte-reader.mts";
import read_message from "./message-reader.mts";
import read_amf0 from "./amf0-reader.mts";
import { logger } from "./logger.mts";
import { Message, MessageType } from "./message.mts";

const message_name = (message: Message): string => {
  switch (message.message_type_id) {
    case MessageType.SetChunkSize: return 'Set Chunk Size Message';
    case MessageType.Abort: return 'Abort Message';
    case MessageType.Acknowledgement: return 'Acknowledgement Message';
    case MessageType.UserControl: return 'User Control Message';
    case MessageType.WindowAcknowledgementSize: return 'Window Acknowledgement Size Message';
    case MessageType.SetPeerBandwidth: return 'Set Peer Bandwidth Message';
    case MessageType.Audio: return 'Audio Message';
    case MessageType.Video: return 'Video Message';
    case MessageType.DataAMF3: return 'Data (AMF3) Message';
    case MessageType.SharedObjectAMF3: return 'Shared Object (AMF3) Message';
    case MessageType.CommandAMF3: return 'Command (AMF3) Message';
    case MessageType.DataAMF0: return 'Data (AMF0) Message';
    case MessageType.SharedObjectAMF0: return 'Shared Object (AMF0) Message';
    case MessageType.CommandAMF0: return 'Command (AMF0) Message';
    case MessageType.Aggregate: return 'Aggregate Message';
  }
};

export default (duplex: Duplex) => {
  const input = new PassThrough();
  const output = new PassThrough();
  const proxy = Duplex.from({ readable: input, writable: output });

  {
    const controller = new AbortController();
    const reader = new AsyncByteReader({ signal: controller.signal });
    input.pipe(new Writable({
      write(data, _, cb) { reader.feed(data); cb(); },
    }));
    input.addListener('close', () => { controller.abort(); });
    (async () => {
      await reader.read(1);
      logger.debug('CLIENT: C0');
      await reader.read(1536);
      logger.debug('CLIENT: C1');
      await reader.read(1536);
      logger.debug('CLIENT: C2');
      for await (const message of read_message(reader)) {
        if (message.message_type_id === MessageType.CommandAMF0) {
          logger.debug(`CLIENT: ${message_name(message)}`, { ... message, data: read_amf0(message.data) });
        } else {
          logger.debug(`CLIENT: ${message_name(message)}`, message);
        }
      }
    })();
  }

  {
    const controller = new AbortController();
    const reader = new AsyncByteReader({ signal: controller.signal });
    output.pipe(new Writable({
      write(data, _, cb) { reader.feed(data); cb(); },
    }));
    output.addListener('close', () => { controller.abort(); });
    (async () => {
      await reader.read(1);
      logger.debug('SERVER: S0');
      await reader.read(1536);
      logger.debug('SERVER: S1');
      await reader.read(1536);
      logger.debug('SERVER: S2');
      for await (const message of read_message(reader)) {
        if (message.message_type_id === MessageType.CommandAMF0) {
          logger.debug(`SERVER: ${message_name(message)}`, { ... message, data: read_amf0(message.data) });
        } else {
          logger.debug(`SERVER: ${message_name(message)}`, message);
        }
      }
    })();
  }

  duplex.pipe(input);
  output.pipe(duplex);

  return proxy;
}
