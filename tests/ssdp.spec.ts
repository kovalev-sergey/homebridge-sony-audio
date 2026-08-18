/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The SSDP client talks multicast UDP, which cannot be exercised reliably in CI.
 * `dgram` and `os` are therefore faked so that the parts this plugin depends on —
 * one socket per external IPv4 interface, the multicast join, the exact M-SEARCH
 * datagram and the response parsing — are asserted without touching the network.
 */
jest.mock('dgram', () => ({ createSocket: jest.fn() }));
jest.mock('os', () => ({ ...jest.requireActual('os'), networkInterfaces: jest.fn() }));

import * as dgram from 'dgram';
import * as os from 'os';
import { EventEmitter } from 'events';
import { Client, parseHeaders } from '../src/ssdp';

const SEARCH_TARGET = 'urn:schemas-sony-com:service:ScalarWebAPI:1';

class FakeSocket extends EventEmitter {
  static instances: FakeSocket[] = [];
  public unref = jest.fn();
  public close = jest.fn();
  public addMembership = jest.fn();
  public setMulticastTTL = jest.fn();
  public send = jest.fn((_msg, _off, _len, _port, _host, cb) => cb?.(null));
  public bind = jest.fn((_port: number, cb: () => void) => {
    // Bind asynchronously, like the real socket does.
    setImmediate(() => {
      this.emit('listening');
      cb();
    });
  });

  constructor(public options: unknown) {
    super();
    FakeSocket.instances.push(this);
  }
}

const createSocketMock = dgram.createSocket as unknown as jest.Mock;
const networkInterfacesMock = os.networkInterfaces as unknown as jest.Mock;

/** Two external IPv4 interfaces plus loopback and IPv6, which must be skipped. */
const twoInterfaces = () => ({
  lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  en0: [
    { address: '192.168.1.5', family: 'IPv4', internal: false },
    { address: 'fe80::1', family: 'IPv6', internal: false },
  ],
  en1: [{ address: '10.0.0.2', family: 'IPv4', internal: false }],
});

/** Lets the asynchronous bind settle. */
const flush = () => new Promise(resolve => setImmediate(resolve));

let logger: jest.Mock;

beforeEach(() => {
  FakeSocket.instances = [];
  createSocketMock.mockImplementation((options: unknown) => new FakeSocket(options));
  networkInterfacesMock.mockReturnValue(twoInterfaces());
  logger = jest.fn();
});

describe('parseHeaders', () => {
  it('upper-cases header names and keeps the values', () => {
    const message = [
      'HTTP/1.1 200 OK',
      'Location: http://192.168.1.10:64321/dmr.xml',
      'st: urn:schemas-sony-com:service:ScalarWebAPI:1',
      'USN: uuid:1234::urn:schemas-sony-com:service:ScalarWebAPI:1',
      '',
      '',
    ].join('\r\n');

    expect(parseHeaders(message)).toMatchObject({
      LOCATION: 'http://192.168.1.10:64321/dmr.xml',
      ST: 'urn:schemas-sony-com:service:ScalarWebAPI:1',
      USN: 'uuid:1234::urn:schemas-sony-com:service:ScalarWebAPI:1',
    });
  });

  it('ignores lines that are not headers', () => {
    expect(parseHeaders('HTTP/1.1 200 OK\r\ngarbage\r\n\r\n')).toEqual({});
  });
});

describe('Client sockets', () => {
  it('creates one reusable, unref\'d socket per external IPv4 interface', async () => {
    new Client({ logger }).search(SEARCH_TARGET);
    await flush();

    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances.forEach(socket => {
      expect(socket.options).toEqual({ type: 'udp4', reuseAddr: true });
      expect(socket.unref).toHaveBeenCalled();
      expect(socket.bind).toHaveBeenCalledWith(0, expect.any(Function));
    });
  });

  it('joins the SSDP multicast group on each interface', async () => {
    new Client({ logger }).search(SEARCH_TARGET);
    await flush();

    expect(FakeSocket.instances[0].addMembership).toHaveBeenCalledWith('239.255.255.250', '192.168.1.5');
    expect(FakeSocket.instances[1].addMembership).toHaveBeenCalledWith('239.255.255.250', '10.0.0.2');
    expect(FakeSocket.instances[0].setMulticastTTL).toHaveBeenCalledWith(4);
  });

  it('accepts the numeric `family` reported by newer Node versions', async () => {
    networkInterfacesMock.mockReturnValue({
      en0: [{ address: '192.168.1.5', family: 4, internal: false }],
    });

    new Client({ logger }).search(SEARCH_TARGET);
    await flush();

    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('logs instead of throwing when there is no usable interface', async () => {
    networkInterfacesMock.mockReturnValue({ lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] });

    expect(() => new Client({ logger }).search(SEARCH_TARGET)).not.toThrow();
    await flush();

    expect(logger).toHaveBeenCalledWith(expect.stringContaining('No sockets available'));
  });

  it('retries a multicast join that fails because the interface is not ready', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    networkInterfacesMock.mockReturnValue({ en0: [{ address: '192.168.1.5', family: 'IPv4', internal: false }] });

    const socketsFailingOnce = () => {
      const socket = new FakeSocket({ type: 'udp4', reuseAddr: true });
      socket.addMembership.mockImplementationOnce(() => {
        throw Object.assign(new Error('addMembership ENODEV'), { code: 'ENODEV' });
      });
      return socket;
    };
    createSocketMock.mockImplementation(socketsFailingOnce);

    new Client({ logger }).search(SEARCH_TARGET);
    await flush();
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('not ready to join'));

    jest.advanceTimersByTime(5000);
    expect(FakeSocket.instances[0].addMembership).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('drops a socket that fails to bind but keeps the others', async () => {
    const client = new Client({ logger });
    createSocketMock.mockImplementationOnce(() => {
      const socket = new FakeSocket({ type: 'udp4', reuseAddr: true });
      socket.bind.mockImplementation(() => {
        setImmediate(() => socket.emit('error', new Error('EADDRINUSE')));
      });
      return socket;
    });

    client.search(SEARCH_TARGET);
    await flush();
    await flush();

    expect(FakeSocket.instances[0].send).not.toHaveBeenCalled();
    expect(FakeSocket.instances[1].send).toHaveBeenCalled();
  });
});

describe('Client.search', () => {
  it('sends a well-formed M-SEARCH out of every interface', async () => {
    new Client({ logger }).search(SEARCH_TARGET);
    await flush();

    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances.forEach(socket => {
      const [buffer, offset, length, port, host] = socket.send.mock.calls[0];
      expect(offset).toBe(0);
      expect(length).toBe(buffer.length);
      expect(port).toBe(1900);
      expect(host).toBe('239.255.255.250');
      expect(buffer.toString()).toBe(
        'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: 239.255.255.250:1900\r\n' +
        `ST: ${SEARCH_TARGET}\r\n` +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 3\r\n' +
        '\r\n',
      );
    });
  });

  it('reuses the sockets on subsequent searches', async () => {
    const client = new Client({ logger });
    client.search(SEARCH_TARGET);
    await flush();
    client.search(SEARCH_TARGET);
    await flush();

    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[0].send).toHaveBeenCalledTimes(2);
  });

  it('logs a send failure without throwing', async () => {
    new Client({ logger }).search(SEARCH_TARGET);
    await flush();
    FakeSocket.instances[0].send.mock.calls[0][5](new Error('ENETUNREACH'));

    expect(logger).toHaveBeenCalledWith(expect.stringContaining('Unable to send an M-SEARCH request from 192.168.1.5'));
  });
});

describe('Client responses', () => {
  const okResponse = [
    'HTTP/1.1 200 OK',
    'LOCATION: http://192.168.1.10:64321/dmr.xml',
    `ST: ${SEARCH_TARGET}`,
    'USN: uuid:1234::' + SEARCH_TARGET,
    '',
    '',
  ].join('\r\n');

  it('emits `response` with headers, status code and remote info', async () => {
    const client = new Client({ logger });
    const onResponse = jest.fn();
    client.on('response', onResponse);
    client.search(SEARCH_TARGET);
    await flush();

    FakeSocket.instances[0].emit('message', Buffer.from(okResponse), { address: '192.168.1.10', port: 1900 });

    expect(onResponse).toHaveBeenCalledWith(
      expect.objectContaining({ LOCATION: 'http://192.168.1.10:64321/dmr.xml', ST: SEARCH_TARGET }),
      200,
      { address: '192.168.1.10', port: 1900 },
    );
  });

  it('reports a non-200 status code so the discoverer can skip it', async () => {
    const client = new Client({ logger });
    const onResponse = jest.fn();
    client.on('response', onResponse);
    client.search(SEARCH_TARGET);
    await flush();

    FakeSocket.instances[0].emit('message', Buffer.from('HTTP/1.1 404 Not Found\r\n\r\n'), { address: 'x', port: 1 });

    expect(onResponse).toHaveBeenCalledWith(expect.anything(), 404, expect.anything());
  });

  it('ignores NOTIFY advertisements and other non-response datagrams', async () => {
    const client = new Client({ logger });
    const onResponse = jest.fn();
    client.on('response', onResponse);
    client.search(SEARCH_TARGET);
    await flush();

    FakeSocket.instances[0].emit('message', Buffer.from('NOTIFY * HTTP/1.1\r\nNTS: ssdp:alive\r\n\r\n'), { address: 'x', port: 1 });

    expect(onResponse).not.toHaveBeenCalled();
  });

  it('logs socket errors without emitting', async () => {
    const client = new Client({ logger });
    client.search(SEARCH_TARGET);
    await flush();

    FakeSocket.instances[0].emit('error', new Error('boom'));

    expect(logger).toHaveBeenCalledWith(expect.stringContaining('Socket error on 192.168.1.5: boom'));
  });
});

describe('Client.stop', () => {
  it('closes every socket and allows a restart', async () => {
    const client = new Client({ logger });
    client.search(SEARCH_TARGET);
    await flush();

    client.stop();
    expect(FakeSocket.instances[0].close).toHaveBeenCalled();
    expect(FakeSocket.instances[1].close).toHaveBeenCalled();

    client.search(SEARCH_TARGET);
    await flush();
    expect(FakeSocket.instances).toHaveLength(4);
  });

  it('is safe to call before any search', () => {
    expect(() => new Client({ logger }).stop()).not.toThrow();
  });

  it('tolerates a socket that is already closed', async () => {
    const client = new Client({ logger });
    client.search(SEARCH_TARGET);
    await flush();
    FakeSocket.instances[0].close.mockImplementation(() => {
      throw new Error('Not running');
    });

    expect(() => client.stop()).not.toThrow();
  });
});
