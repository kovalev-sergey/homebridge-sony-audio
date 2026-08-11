/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events';

/**
 * A drop-in replacement for the `ws` WebSocket used by `SonyDevice`.
 * Every created instance is recorded in `FakeWebSocket.instances` so a test
 * can drive it (emit 'open' / 'message' / 'close' / 'error') and inspect the
 * frames the device sent.
 */
export class FakeWebSocket extends EventEmitter {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  static reset() {
    FakeWebSocket.instances = [];
  }

  /** Finds the socket created for a given service, e.g. `audio`. */
  static forService(service: string): FakeWebSocket {
    const ws = FakeWebSocket.instances.find(i => i.url.endsWith('/' + service));
    if (!ws) {
      throw new Error(`No websocket created for service "${service}"`);
    }
    return ws;
  }

  public readyState: number = FakeWebSocket.OPEN;
  public url: string;
  public sent: string[] = [];
  public terminated = false;

  constructor(url: any) {
    super();
    this.url = typeof url === 'string' ? url : url.href;
    FakeWebSocket.instances.push(this);
  }

  /** The last frame sent, already JSON-parsed. */
  get lastSent(): any {
    return JSON.parse(this.sent[this.sent.length - 1]);
  }

  send(data: string) {
    this.sent.push(data);
  }

  terminate() {
    this.terminated = true;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }

  /** Simulates an incoming frame from the device. */
  receive(message: unknown) {
    this.emit('message', JSON.stringify(message));
  }
}
