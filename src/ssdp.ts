/**
 * A minimal SSDP (Simple Service Discovery Protocol) client.
 *
 * This replaces the `node-ssdp` package, which is unmaintained and pulls in
 * `lodash`, `bluebird` and a `ip` version flagged by `npm audit`. Only the
 * M-SEARCH client half of SSDP is implemented, which is all the discovery
 * process needs; the socket setup deliberately mirrors what `node-ssdp` did:
 * one unref'd, `reuseAddr` UDP socket per external IPv4 interface, bound to
 * `0.0.0.0` and joined to the SSDP multicast group for that interface.
 */
import * as dgram from 'dgram';
import * as os from 'os';
import { EventEmitter } from 'events';

const SSDP_DEFAULT_IP = '239.255.255.250';
const SSDP_DEFAULT_PORT = 1900;
const SSDP_MULTICAST_TTL = 4;
/** How long to wait before retrying a multicast join for an interface that is not ready yet. */
const MEMBERSHIP_RETRY_DELAY = 5000;

const HTTP_STATUS_LINE = /HTTP\/\d{1}\.\d{1} \d+ .*/;
const SSDP_HEADER = /^([^:]+):\s*(.*)$/;

export interface SsdpRemoteInfo {
  address: string;
  port: number;
}

export interface SsdpClientOptions {
  /** Called with debug messages about socket lifecycle. */
  logger?: (message: string) => void;
}

/**
 * Emits `response(headers, statusCode, rinfo)` for every reply to an M-SEARCH.
 */
export class Client extends EventEmitter {
  /** One socket per external IPv4 interface address. */
  private sockets = new Map<string, dgram.Socket>();
  private started = false;
  private starting?: Promise<void>;
  private readonly logger: (message: string) => void;

  constructor(options: SsdpClientOptions = {}) {
    super();
    this.logger = options.logger ?? (() => undefined);
  }

  /**
   * Sends an M-SEARCH for the given service type out of every interface.
   * Starts the sockets on first use.
   */
  public search(serviceType: string): void {
    this.start()
      .then(() => this.send(this.buildSearchMessage(serviceType)))
      .catch(err => this.logger(`Unable to send an M-SEARCH request: ${(err as Error).message}`));
  }

  /**
   * Closes all sockets. Safe to call when not started.
   */
  public stop(): void {
    this.sockets.forEach((socket, address) => {
      try {
        socket.close();
      } catch {
        // already closed
      }
      this.logger(`Stopped socket on ${address}`);
    });
    this.sockets.clear();
    this.started = false;
    this.starting = undefined;
  }

  private start(): Promise<void> {
    if (this.started) {
      return Promise.resolve();
    }
    if (!this.starting) {
      this.starting = this.createSockets().then(() => {
        this.started = true;
      });
    }
    return this.starting;
  }

  /**
   * A socket per external IPv4 address, so that the M-SEARCH really leaves every
   * interface. Hosts running Homebridge frequently have several (Ethernet + Wi-Fi,
   * Docker bridges, VPN adapters) and a single socket would only reach one of them.
   */
  private async createSockets(): Promise<void> {
    const addresses: string[] = [];
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach(name => {
      interfaces[name]?.forEach(info => {
        // `family` is the number 4 on newer Node versions and the string 'IPv4' on older ones.
        const isIPv4 = info.family === 'IPv4' || (info.family as unknown as number) === 4;
        if (!info.internal && isIPv4) {
          this.logger(`Will use interface ${name} (${info.address})`);
          addresses.push(info.address);
        }
      });
    });

    if (addresses.length === 0) {
      throw new Error('No sockets available, cannot start.');
    }

    await Promise.all(addresses.map(address => this.createSocket(address)));
  }

  private createSocket(interfaceAddress: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      // Do not hold the event loop open just for discovery.
      socket.unref();

      socket.on('error', (err: Error) => {
        this.logger(`Socket error on ${interfaceAddress}: ${err.message}`);
        // A socket that failed to bind must not break discovery on the other interfaces.
        this.sockets.delete(interfaceAddress);
        resolve();
      });
      socket.on('message', (msg: Buffer, rinfo: SsdpRemoteInfo) => this.handleMessage(msg, rinfo));
      socket.on('listening', () => {
        const addMembership = () => {
          socket.addMembership(SSDP_DEFAULT_IP, interfaceAddress);
          socket.setMulticastTTL(SSDP_MULTICAST_TTL);
        };
        try {
          addMembership();
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'ENODEV' || code === 'EADDRNOTAVAIL') {
            // The interface may not be up yet; retry once it settles.
            this.logger(`Interface ${interfaceAddress} is not ready to join the multicast group, retrying. ${(err as Error).message}`);
            const retry = setTimeout(() => {
              try {
                addMembership();
              } catch (retryErr) {
                this.logger(`Giving up joining the multicast group on ${interfaceAddress}: ${(retryErr as Error).message}`);
              }
            }, MEMBERSHIP_RETRY_DELAY);
            retry.unref?.();
          } else {
            this.logger(`Cannot join the multicast group on ${interfaceAddress}: ${(err as Error).message}`);
          }
        }
      });

      // Bind on 0.0.0.0 with a system-assigned port, as `node-ssdp` did: unicast
      // replies from devices are then accepted regardless of the interface they
      // arrive on. A failed bind must not prevent the other interfaces from working.
      socket.bind(0, () => resolve());

      this.sockets.set(interfaceAddress, socket);
    });
  }

  /**
   * Builds the M-SEARCH datagram. The header set and order match the SSDP spec
   * and the discovery process documented by Sony.
   */
  private buildSearchMessage(serviceType: string): Buffer {
    const message = [
      'M-SEARCH * HTTP/1.1',
      `HOST: ${SSDP_DEFAULT_IP}:${SSDP_DEFAULT_PORT}`,
      `ST: ${serviceType}`,
      'MAN: "ssdp:discover"',
      'MX: 3',
      '\r\n',
    ].join('\r\n');
    return Buffer.from(message, 'ascii');
  }

  private send(message: Buffer): void {
    this.sockets.forEach((socket, address) => {
      socket.send(message, 0, message.length, SSDP_DEFAULT_PORT, SSDP_DEFAULT_IP, (err) => {
        if (err) {
          this.logger(`Unable to send an M-SEARCH request from ${address}: ${err.message}`);
        }
      });
    });
  }

  private handleMessage(msg: Buffer, rinfo: SsdpRemoteInfo): void {
    const text = msg.toString();
    const statusLine = text.split('\r\n')[0];
    // Only replies to our M-SEARCH are of interest; NOTIFY advertisements are ignored.
    if (!HTTP_STATUS_LINE.test(statusLine)) {
      return;
    }
    const statusCode = parseInt(statusLine.split(' ')[1], 10);
    this.emit('response', parseHeaders(text), statusCode, rinfo);
  }
}

/**
 * Turns the raw datagram into upper-cased headers, matching `node-ssdp`'s output
 * so that the `LOCATION` / `USN` / `ST` lookups in the discoverer keep working.
 */
export function parseHeaders(message: string): Record<string, string> {
  const headers: Record<string, string> = {};
  message.split('\r\n').forEach(line => {
    if (line.length) {
      const pairs = line.match(SSDP_HEADER);
      if (pairs) {
        headers[pairs[1].toUpperCase()] = pairs[2];
      }
    }
  });
  return headers;
}
