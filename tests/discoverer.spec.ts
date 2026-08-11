/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('axios', () => ({
  __esModule: true,
  default: { create: jest.fn(), get: jest.fn() },
}));

jest.mock('node-ssdp', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { EventEmitter } = require('events');
  class FakeSsdpClient extends EventEmitter {
    static instances: FakeSsdpClient[] = [];
    search = jest.fn();
    constructor(public options: unknown) {
      super();
      FakeSsdpClient.instances.push(this);
    }
  }
  return { Client: FakeSsdpClient };
});

jest.mock('../src/sonyDevice', () => ({
  SonyDevice: { createDevice: jest.fn() },
}));

import axios from 'axios';
import { URL } from 'url';
import { Client as ssdp } from 'node-ssdp';
import { Discoverer, DiscoveryEvents } from '../src/discoverer';
import { SonyDevice } from '../src/sonyDevice';
import { GenericApiError, IncompatibleDeviceCategoryError, UnsupportedVersionApiError } from '../src/api';
import { createMockLogger, MockLogger } from './helpers/logger';

const SEARCH_TARGET = 'urn:schemas-sony-com:service:ScalarWebAPI:1';
const LOCATION = 'http://192.168.1.10:64321/dmr.xml';
const USN = 'uuid:00000000-0000-1010-8000-aabbccddeeff::urn:schemas-sony-com:service:ScalarWebAPI:1';
const UDN = 'uuid:00000000-0000-1010-8000-aabbccddeeff';

const axiosGet = axios.get as unknown as jest.Mock;
const createDeviceMock = SonyDevice.createDevice as unknown as jest.Mock;
const FakeSsdpClient = ssdp as unknown as { instances: { search: jest.Mock; emit: (e: string, ...a: unknown[]) => void }[] };

function descriptionXml(options: {
  withScalarWebApi?: boolean;
  ircc?: string | null;
  baseUrl?: string | null;
  udn?: string | null;
} = {}) {
  const {
    withScalarWebApi = true,
    ircc = '/upnp/control/IRCC',
    baseUrl = 'http://192.168.1.10:10000/sony',
    udn = UDN,
  } = options;

  const scalar = withScalarWebApi
    ? `<av:X_ScalarWebAPI_DeviceInfo>
         <av:X_ScalarWebAPI_Version>1.0</av:X_ScalarWebAPI_Version>
         ${baseUrl === null ? '' : `<av:X_ScalarWebAPI_BaseURL>${baseUrl}</av:X_ScalarWebAPI_BaseURL>`}
       </av:X_ScalarWebAPI_DeviceInfo>`
    : '';

  const service = ircc === null
    ? '<service><serviceId>urn:upnp-org:serviceId:RenderingControl</serviceId><controlURL>/upnp/control/rc</controlURL></service>'
    : `<service><serviceId>urn:schemas-sony-com:serviceId:IRCC</serviceId><controlURL>${ircc}</controlURL></service>`;

  return `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <device>
    <friendlyName>HT-Z9F</friendlyName>
    <manufacturer>Sony Corporation</manufacturer>
    <modelName>HT-Z9F</modelName>
    ${udn === null ? '' : `<UDN>${udn}</UDN>`}
    <serviceList>${service}</serviceList>
    ${scalar}
  </device>
</root>`;
}

const ssdpHeaders = (overrides: Record<string, string> = {}) => ({
  USN,
  LOCATION,
  ST: SEARCH_TARGET,
  ...overrides,
});

let log: MockLogger;
let discoverer: Discoverer;

/** Lets the promise chain inside `registerDevice` settle. */
const flush = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
  log = createMockLogger();
  (axios.create as unknown as jest.Mock).mockReturnValue({
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  });
  axiosGet.mockResolvedValue({ data: descriptionXml() });
  createDeviceMock.mockImplementation(async () => ({
    systemInfo: { name: '', model: '' },
    manufacturer: 'Sony Corporation',
    UDN,
  }));
  discoverer = new Discoverer(log);
});

afterEach(() => {
  discoverer.stopDiscovery();
  jest.useRealTimers();
});

describe('Discoverer discovery loop', () => {
  it('searches immediately and then periodically', () => {
    jest.useFakeTimers();
    const client = FakeSsdpClient.instances[FakeSsdpClient.instances.length - 1];

    discoverer.startDiscovery();
    expect(client.search).toHaveBeenCalledWith(SEARCH_TARGET);
    expect(client.search).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(15000);
    expect(client.search).toHaveBeenCalledTimes(4);
  });

  it('stops searching after stopDiscovery', () => {
    jest.useFakeTimers();
    const client = FakeSsdpClient.instances[FakeSsdpClient.instances.length - 1];

    discoverer.startDiscovery();
    discoverer.stopDiscovery();
    jest.advanceTimersByTime(60000);

    expect(client.search).toHaveBeenCalledTimes(1);
  });

  it('tolerates stopDiscovery before startDiscovery', () => {
    expect(() => discoverer.stopDiscovery()).not.toThrow();
  });
});

describe('Discoverer.handleSsdpResponse', () => {
  it('ignores non 200 answers', () => {
    discoverer.handleSsdpResponse(ssdpHeaders(), 404);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('ignores answers without USN or LOCATION', () => {
    discoverer.handleSsdpResponse({ USN } as Record<string, string>, 200);
    discoverer.handleSsdpResponse({ LOCATION } as Record<string, string>, 200);
    discoverer.handleSsdpResponse({} as Record<string, string>, 200);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('ignores answers for a different search target', () => {
    discoverer.handleSsdpResponse(ssdpHeaders({ ST: 'urn:schemas-upnp-org:device:MediaRenderer:1' }), 200);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('fetches the device description of a matching answer', () => {
    discoverer.handleSsdpResponse(ssdpHeaders(), 200);
    expect(axiosGet).toHaveBeenCalledWith(LOCATION);
  });

  it('does not process the same device twice', async () => {
    discoverer.handleSsdpResponse(ssdpHeaders(), 200);
    await flush();
    discoverer.handleSsdpResponse(ssdpHeaders(), 200);
    expect(axiosGet).toHaveBeenCalledTimes(1);
  });

  it('is wired to the ssdp client response event', () => {
    const client = FakeSsdpClient.instances[FakeSsdpClient.instances.length - 1];
    client.emit('response', ssdpHeaders(), 200);
    expect(axiosGet).toHaveBeenCalledWith(LOCATION);
  });
});

describe('Discoverer.registerDevice', () => {
  it('skips descriptions served from the root path', () => {
    discoverer.registerDevice(USN, new URL('http://192.168.1.10:64321/'));
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('emits NewDeviceFound with a fully populated device', async () => {
    const onFound = jest.fn();
    discoverer.on(DiscoveryEvents.NewDeviceFound, onFound);

    discoverer.registerDevice(USN, new URL(LOCATION));
    await flush();

    expect(createDeviceMock).toHaveBeenCalledWith(
      new URL('http://192.168.1.10:10000/sony'),
      new URL('http://192.168.1.10:64321/upnp/control/IRCC'),
      UDN,
      log,
    );
    expect(onFound).toHaveBeenCalledTimes(1);
    const device = onFound.mock.calls[0][0];
    expect(device.systemInfo.name).toBe('HT-Z9F');
    expect(device.systemInfo.model).toBe('HT-Z9F');
    expect(device.manufacturer).toBe('Sony Corporation');
    expect(log.info).toHaveBeenCalledWith('Compatible device found, added:', 'HT-Z9F');
  });

  it('keeps an absolute IRCC control url as is', async () => {
    axiosGet.mockResolvedValue({ data: descriptionXml({ ircc: 'http://192.168.1.10:52323/upnp/control/IRCC' }) });

    discoverer.registerDevice(USN, new URL(LOCATION));
    await flush();

    expect(createDeviceMock.mock.calls[0][1]).toEqual(new URL('http://192.168.1.10:52323/upnp/control/IRCC'));
  });

  it('creates the device without an upnp url when there is no IRCC service', async () => {
    axiosGet.mockResolvedValue({ data: descriptionXml({ ircc: null }) });

    discoverer.registerDevice(USN, new URL(LOCATION));
    await flush();

    expect(createDeviceMock.mock.calls[0][1]).toBeUndefined();
  });

  it('ignores devices without the ScalarWebAPI device info tag', async () => {
    axiosGet.mockResolvedValue({ data: descriptionXml({ withScalarWebApi: false }) });
    const onFound = jest.fn();
    discoverer.on(DiscoveryEvents.NewDeviceFound, onFound);

    discoverer.registerDevice(USN, new URL(LOCATION));
    await flush();

    expect(createDeviceMock).not.toHaveBeenCalled();
    expect(onFound).not.toHaveBeenCalled();
  });

  it('logs and skips a device without a base url', async () => {
    axiosGet.mockResolvedValue({ data: descriptionXml({ baseUrl: null }) });

    discoverer.registerDevice(USN, new URL(LOCATION));
    await flush();

    expect(createDeviceMock).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Url or UDN is not found'));
  });

  it('logs and skips a device without a UDN', async () => {
    axiosGet.mockResolvedValue({ data: descriptionXml({ udn: null }) });

    discoverer.registerDevice(USN, new URL(LOCATION));
    await flush();

    expect(createDeviceMock).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Url or UDN is not found'));
  });

  it('reports incompatible devices without emitting an event', async () => {
    createDeviceMock.mockRejectedValue(new IncompatibleDeviceCategoryError('tv'));
    const onFound = jest.fn();
    discoverer.on(DiscoveryEvents.NewDeviceFound, onFound);

    discoverer.registerDevice(USN, new URL(LOCATION));
    await flush();

    expect(onFound).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith('Incompatible device found, skipped:', 'HT-Z9F');
  });

  it('logs UnsupportedVersionApiError at debug level only', async () => {
    createDeviceMock.mockRejectedValue(new UnsupportedVersionApiError('too old'));

    discoverer.registerDevice(USN, new URL(LOCATION));
    await flush();

    expect(log.debug).toHaveBeenCalledWith('too old');
    expect(log.error).not.toHaveBeenCalled();
  });

  it('logs unexpected device errors at error level', async () => {
    createDeviceMock.mockRejectedValue(new Error('ECONNREFUSED'));

    discoverer.registerDevice(USN, new URL(LOCATION));
    await flush();

    expect(log.error).toHaveBeenCalledWith('ECONNREFUSED');
  });

  it('logs a transport error only once per location', async () => {
    axiosGet.mockRejectedValue(Object.assign(new Error('timeout of 0ms exceeded'), { isAxiosError: true }));

    discoverer.registerDevice(USN, new URL(LOCATION));
    await flush();
    discoverer.registerDevice(USN, new URL(LOCATION));
    await flush();

    const messages = log.debug.mock.calls.filter(c => String(c[0]).includes("Can't retrieve the device description"));
    expect(messages).toHaveLength(1);
  });

  it('retries a device after a transport error', async () => {
    axiosGet.mockRejectedValueOnce(Object.assign(new Error('timeout'), { isAxiosError: true }));
    const onFound = jest.fn();
    discoverer.on(DiscoveryEvents.NewDeviceFound, onFound);

    discoverer.handleSsdpResponse(ssdpHeaders(), 200);
    await flush();
    // the failed device was forgotten, so a new answer is processed again
    discoverer.handleSsdpResponse(ssdpHeaders(), 200);
    await flush();

    expect(onFound).toHaveBeenCalledTimes(1);
  });
});

describe('Discoverer.responseInterceptor', () => {
  it('passes a successful response through', () => {
    const response = { data: { result: [[]] } } as any;
    expect(discoverer.responseInterceptor(response)).toBe(response);
  });

  it('rejects a response containing an error', async () => {
    await expect(discoverer.responseInterceptor({ data: { error: [7, 'Illegal Argument'] } } as any))
      .rejects.toBeInstanceOf(GenericApiError);
  });
});
