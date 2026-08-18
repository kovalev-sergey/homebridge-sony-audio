/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('../src/http', () => ({
  __esModule: true,
  ...jest.requireActual('../src/http'),
  createHttpClient: jest.fn(),
}));

jest.mock('ws', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { FakeWebSocket } = require('./helpers/mockWs');
  return { __esModule: true, default: FakeWebSocket };
});

import { createHttpClient } from '../src/http';
import { URL } from 'url';
import { SonyDevice, DEVICE_EVENTS } from '../src/sonyDevice';
import { GenericApiError, IncompatibleDeviceCategoryError, UnsupportedVersionApiError } from '../src/api';
import { createMockHttpClient, MockHttpClient } from './helpers/mockHttp';
import { FakeWebSocket } from './helpers/mockWs';
import { createMockLogger, MockLogger } from './helpers/logger';
import { defaultRoutes, apisInfo, externalTerminals } from './helpers/fixtures';

const BASE_URL = new URL('http://192.168.1.10:10000/sony');
const UPNP_URL = new URL('http://192.168.1.10:52323/upnp/control/IRCC');
const UDN = 'uuid:00000000-0000-1010-8000-aabbccddeeff';

const createMock = createHttpClient as unknown as jest.Mock;

let log: MockLogger;
let routes: Record<string, any>;
let instances: MockHttpClient[];

/**
 * createHttpClient() is called in this order:
 *  0 - bootstrap client used by `createDevice`
 *  1 - the Audio Control API client of the device
 *  2 - the SOAP/IRCC client (only when an upnp url is known)
 */
const bootstrapClient = () => instances[0];
const apiClient = () => instances[1];
const soapClient = () => instances[2];

function setupHttp() {
  instances = [];
  createMock.mockImplementation((options) => {
    const instance = createMockHttpClient(routes, options);
    instances.push(instance);
    return instance;
  });
}

async function createDevice(upnp: URL = UPNP_URL) {
  return SonyDevice.createDevice(BASE_URL, upnp, UDN, log);
}

/** A device discovered without an IRCC (upnp) control url. */
async function createDeviceWithoutIrcc() {
  return SonyDevice.createDevice(BASE_URL, undefined, UDN, log);
}

beforeEach(() => {
  // Fake timers keep the websocket heartbeat/reconnect timers of SonyDevice
  // from leaking between tests (and from keeping the jest process alive).
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  log = createMockLogger();
  routes = defaultRoutes();
  FakeWebSocket.reset();
  setupHttp();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

/** Lets pending promise chains (and their awaited micro tasks) settle. */
const flush = () => new Promise(resolve => setImmediate(resolve));

describe('SonyDevice.createDevice', () => {
  it('creates a device for a compatible product category', async () => {
    const device = await createDevice();

    expect(device).toBeInstanceOf(SonyDevice);
    expect(device.UDN).toBe(UDN);
    expect(device.baseUrl).toBe(BASE_URL);
    expect(device.upnpUrl).toBe(UPNP_URL);
    expect(device.manufacturer).toBe('Sony Corporation');
    expect(device.systemInfo.model).toBe('HT-Z9F');
    expect(device.systemInfo.serial).toBe('SERIAL-123');
    expect(device.apisInfo).toEqual(apisInfo);
  });

  it('queries interface info, supported api info and system info in order', async () => {
    await createDevice();

    expect(bootstrapClient().calls.map(c => [c.url, c.body.method])).toEqual([
      ['/system', 'getInterfaceInformation'],
      ['/guide', 'getSupportedApiInfo'],
      ['/system', 'getSystemInformation'],
    ]);
  });

  it('rejects an incompatible device category', async () => {
    routes.getInterfaceInformation = { result: [{ productCategory: 'tv' }] };

    await expect(createDevice()).rejects.toBeInstanceOf(IncompatibleDeviceCategoryError);
  });

  it('accepts personalAudio devices', async () => {
    routes.getInterfaceInformation = { result: [{ productCategory: 'personalAudio' }] };
    await expect(createDevice()).resolves.toBeInstanceOf(SonyDevice);
  });

  it('throws UnsupportedVersionApiError when the device does not advertise getSystemInformation', async () => {
    const patched = JSON.parse(JSON.stringify(apisInfo));
    patched[0].apis = patched[0].apis.filter((api: any) => api.name !== 'getSystemInformation');
    routes.getSupportedApiInfo = { result: [patched] };

    await expect(createDevice()).rejects.toBeInstanceOf(UnsupportedVersionApiError);
  });

  it('asks for the newest advertised getSystemInformation version (#36, #39, #40)', async () => {
    // Real devices list every supported version, and not necessarily in order:
    // the 2023 receivers (STR-AZ5000ES, TA-AN1000) answer 1.4 *and* 1.6.
    const patched = JSON.parse(JSON.stringify(apisInfo));
    patched[0].apis[0].versions = [
      { authLevel: '', protocols: '', version: '1.4' },
      { authLevel: '', protocols: '', version: '1.6' },
    ];
    routes.getSupportedApiInfo = { result: [patched] };

    await createDevice();

    expect(bootstrapClient().lastCall('getSystemInformation').version).toBe('1.6');
  });

  it('accepts a device that only advertises a getSystemInformation version unknown to the plugin', async () => {
    const patched = JSON.parse(JSON.stringify(apisInfo));
    patched[0].apis[0].versions = [{ authLevel: '', protocols: '', version: '1.5' }];
    routes.getSupportedApiInfo = { result: [patched] };

    await expect(createDevice()).resolves.toBeInstanceOf(SonyDevice);
    expect(bootstrapClient().lastCall('getSystemInformation').version).toBe('1.5');
  });

  it('uses the v1.6 request when the device advertises getSystemInformation 1.6', async () => {
    const patched = JSON.parse(JSON.stringify(apisInfo));
    patched[0].apis[0].versions = [{ authLevel: '', protocols: '', version: '1.6' }];
    routes.getSupportedApiInfo = { result: [patched] };

    await createDevice();

    expect(bootstrapClient().lastCall('getSystemInformation').version).toBe('1.6');
  });

  it('does not create a SOAP axios instance when there is no upnp url', async () => {
    await createDeviceWithoutIrcc();
    // 1 bootstrap instance + 1 api instance, no SOAP one
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('creates a SOAP axios instance when an upnp url is given', async () => {
    await createDevice(UPNP_URL);
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it('opens websockets for the system, audio and avContent services', async () => {
    await createDevice();

    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(FakeWebSocket.instances.map(ws => ws.url)).toEqual([
      'ws://192.168.1.10:10000/sony/system',
      'ws://192.168.1.10:10000/sony/audio',
      'ws://192.168.1.10:10000/sony/avContent',
    ]);
  });
});

describe('SonyDevice.getDeviceID', () => {
  it('prefers the serial number', async () => {
    const device = await createDevice();
    expect(device.getDeviceID()).toBe('SERIAL-123');
  });

  it('falls back to the mac address', async () => {
    const device = await createDevice();
    device.systemInfo.serial = '';
    expect(device.getDeviceID()).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('falls back to the wireless mac address', async () => {
    const device = await createDevice();
    device.systemInfo.serial = '';
    device.systemInfo.macAddr = '';
    expect(device.getDeviceID()).toBe('11:22:33:44:55:66');
  });
});

describe('SonyDevice.validateRequest', () => {
  it('accepts a supported service/method/version triple', async () => {
    const device = await createDevice();
    expect(device.validateRequest('system', { method: 'getPowerStatus', version: '1.1' })).toBe(true);
  });

  it('rejects an unknown version', async () => {
    const device = await createDevice();
    expect(device.validateRequest('system', { method: 'getPowerStatus', version: '9.9' })).toBe(false);
  });

  it('rejects an unknown method', async () => {
    const device = await createDevice();
    expect(device.validateRequest('system', { method: 'nope', version: '1.0' })).toBe(false);
  });

  it('rejects an unknown service', async () => {
    const device = await createDevice();
    expect(device.validateRequest('unknown', { method: 'getPowerStatus', version: '1.1' })).toBe(false);
  });
});

describe('SonyDevice terminals', () => {
  it('fetches external terminals and appends the extra device terminals', async () => {
    const device = await createDevice();
    const terminals = (await device.getExternalTerminals())!;

    const uris = terminals.map(t => t.uri);
    expect(uris).toEqual(expect.arrayContaining(externalTerminals.map(t => t.uri)));
    // read-only terminals are only added when their scheme is supported
    expect(uris).toContain('radio:fm');
    expect(uris).toContain('storage:usb1');
    expect(uris).not.toContain('dlna:music');
    // non read-only terminals are always added
    expect(uris).toEqual(expect.arrayContaining([
      'netService:audio', 'multiroom:audio', 'cast:audio', 'extInput:airPlay',
    ]));
  });

  it('caches the terminals and does not re-query the device', async () => {
    const device = await createDevice();
    await device.getExternalTerminals();
    const callsAfterFirst = apiClient().calls.length;
    await device.getExternalTerminals();
    expect(apiClient().calls.length).toBe(callsAfterFirst);
  });

  it('uses the v1.2 request when the device advertises it', async () => {
    const patched = JSON.parse(JSON.stringify(apisInfo));
    patched[2].apis[0].versions = [{ authLevel: '', protocols: '', version: '1.2' }];
    routes.getSupportedApiInfo = { result: [patched] };

    const device = await createDevice();
    await device.getExternalTerminals();

    expect(apiClient().lastCall('getCurrentExternalTerminalsStatus').version).toBe('1.2');
  });

  it('uses the v1.2 request when the device advertises both 1.0 and 1.2 (#40)', async () => {
    // The 2023 receivers answer with the full version list; only 1.2 returns
    // all the inputs, the 1.0 answer is truncated to a couple of sources.
    const patched = JSON.parse(JSON.stringify(apisInfo));
    patched[2].apis[0].versions = [
      { authLevel: '', protocols: '', version: '1.0' },
      { authLevel: '', protocols: '', version: '1.2' },
    ];
    routes.getSupportedApiInfo = { result: [patched] };

    const device = await createDevice();
    await device.getExternalTerminals();

    expect(apiClient().lastCall('getCurrentExternalTerminalsStatus').version).toBe('1.2');
  });

  it('getInputs returns everything that is not an output', async () => {
    const device = await createDevice();
    const inputs = await device.getInputs();
    expect(inputs.every(i => !i.uri.startsWith('extOutput:'))).toBe(true);
    expect(inputs.map(i => i.uri)).toContain('extInput:tv');
  });

  it('getZones returns only the outputs', async () => {
    const device = await createDevice();
    const zones = (await device.getZones())!;
    expect(zones.map(z => z.uri)).toEqual(['extOutput:zone?zone=1']);
  });

  it('getActiveZone returns the active output', async () => {
    const device = await createDevice();
    const zone = await device.getActiveZone();
    expect(zone?.uri).toBe('extOutput:zone?zone=1');
  });

  it('getActiveZone returns null when there is no active output', async () => {
    routes.getCurrentExternalTerminalsStatus = { result: [[externalTerminals[0], externalTerminals[1]]] };
    const device = await createDevice();
    expect(await device.getActiveZone()).toBeNull();
  });

  it('isReadonlyTerminal flags the terminals a user cannot select', async () => {
    const device = await createDevice();
    const terminals = (await device.getExternalTerminals())!;
    const find = (uri: string) => terminals.find(t => t.uri === uri)!;

    expect(device.isReadonlyTerminal(find('cast:audio'))).toBe(true);
    expect(device.isReadonlyTerminal(find('netService:audio'))).toBe(true);
    expect(device.isReadonlyTerminal(find('extInput:tv'))).toBe(false);
    expect(device.isReadonlyTerminal(find('radio:fm'))).toBe(false);
  });

  it('getTerminalBySource returns null before the terminals are loaded', async () => {
    const device = await createDevice();
    expect(device.getTerminalBySource('extInput:tv')).toBeNull();
  });

  it('getTerminalBySource finds a loaded terminal and null for an unknown one', async () => {
    const device = await createDevice();
    await device.getExternalTerminals();
    expect(device.getTerminalBySource('extInput:tv')?.title).toBe('TV');
    expect(device.getTerminalBySource('extInput:nope')).toBeNull();
  });

  it('getActiveInput resolves the currently playing source', async () => {
    const device = await createDevice();
    await device.getExternalTerminals();

    const input = await device.getActiveInput();
    expect(input?.uri).toBe('extInput:tv');
    expect(apiClient().lastCall('getPlayingContentInfo').params[0].output).toBe('extOutput:zone?zone=1');
  });

  it('getActiveInput returns null when the device reports several zones', async () => {
    routes.getPlayingContentInfo = { result: [[{ uri: 'extInput:tv' }, { uri: 'extInput:hdmi?port=1' }]] };
    const device = await createDevice();
    expect(await device.getActiveInput()).toBeNull();
  });
});

describe('SonyDevice state getters', () => {
  it.each([
    ['active', true],
    ['activating', true],
    ['standby', false],
    ['off', false],
  ])('getPowerState maps %s to %s', async (status, expected) => {
    routes.getPowerStatus = { result: [{ status }] };
    const device = await createDevice();
    await expect(device.getPowerState()).resolves.toBe(expected);
  });

  it('getVolumeState returns the volume info of the active zone', async () => {
    const device = await createDevice();
    const volume = await device.getVolumeState();
    expect(volume).toMatchObject({ output: 'extOutput:zone?zone=1', volume: 20, mute: 'off' });
  });

  it('getVolumeState returns null when there is no active zone', async () => {
    routes.getCurrentExternalTerminalsStatus = { result: [[externalTerminals[0]]] };
    const device = await createDevice();
    expect(await device.getVolumeState()).toBeNull();
  });

  it('getVolumeInformation caches its result', async () => {
    const device = await createDevice();
    const first = await device.getVolumeInformation();
    const before = apiClient().calls.length;
    const second = await device.getVolumeInformation();
    expect(second).toBe(first);
    expect(apiClient().calls.length).toBe(before);
  });
});

describe('SonyDevice setters', () => {
  it('setVolume increments and decrements for the active zone', async () => {
    const device = await createDevice();

    await expect(device.setVolume(0)).resolves.toBe(0);
    expect(apiClient().lastCall('setAudioVolume').params[0]).toEqual({
      output: 'extOutput:zone?zone=1',
      volume: '+1',
    });

    await device.setVolume(1);
    expect(apiClient().lastCall('setAudioVolume').params[0].volume).toBe('-1');
  });

  it('setVolumeAbsolute sends the value as a string', async () => {
    const device = await createDevice();
    await expect(device.setVolumeAbsolute(33)).resolves.toBe(33);
    expect(apiClient().lastCall('setAudioVolume').params[0].volume).toBe('33');
  });

  it('setVolume falls back to an empty output without an active zone', async () => {
    routes.getCurrentExternalTerminalsStatus = { result: [[externalTerminals[0]]] };
    const device = await createDevice();
    await device.setVolume(0);
    expect(apiClient().lastCall('setAudioVolume').params[0].output).toBe('');
  });

  it.each([
    [true, 'active'],
    [false, 'off'],
  ])('setPower(%s) sends %s', async (power, status) => {
    const device = await createDevice();
    await expect(device.setPower(power)).resolves.toBe(power);
    expect(apiClient().lastCall('setPowerStatus').params[0].status).toBe(status);
  });

  it.each([
    [true, 'on'],
    [false, 'off'],
  ])('setMute(%s) sends %s for the active zone', async (mute, expected) => {
    const device = await createDevice();
    await expect(device.setMute(mute)).resolves.toBe(mute);
    expect(apiClient().lastCall('setAudioMute').params[0]).toEqual({
      mute: expected,
      output: 'extOutput:zone?zone=1',
    });
  });

  it('setMute omits the output when there is no active zone', async () => {
    routes.getCurrentExternalTerminalsStatus = { result: [[externalTerminals[0]]] };
    const device = await createDevice();
    await device.setMute(true);
    expect(apiClient().lastCall('setAudioMute').params[0]).toEqual({ mute: 'on' });
  });

  it('setSource plays the terminal uri on the active zone', async () => {
    const device = await createDevice();
    const terminals = (await device.getExternalTerminals())!;
    const hdmi = terminals.find(t => t.uri === 'extInput:hdmi?port=1')!;

    await expect(device.setSource(hdmi)).resolves.toBe(hdmi);
    expect(apiClient().lastCall('setPlayContent').params[0]).toEqual({
      uri: 'extInput:hdmi?port=1',
      output: 'extOutput:zone?zone=1',
    });
  });

  it('setPause toggles play/pause on the active zone', async () => {
    const device = await createDevice();
    await device.setPause();
    expect(apiClient().lastCall('pausePlayingContent').params[0]).toEqual({ output: 'extOutput:zone?zone=1' });
  });
});

describe('SonyDevice IRCC remote keys', () => {
  const keys: [keyof SonyDevice, string][] = [
    ['setUp', 'AAAAAgAAALAAAAB4AQ=='],
    ['setDown', 'AAAAAgAAALAAAAB5AQ=='],
    ['setRigth', 'AAAAAgAAALAAAAB7AQ=='],
    ['setLeft', 'AAAAAgAAALAAAAB6AQ=='],
    ['setSelect', 'AAAAAgAAADAAAAAMAQ=='],
    ['setBack', 'AAAAAwAAARAAAAB9AQ=='],
    ['setInformation', 'AAAAAgAAADAAAABTAQ=='],
  ];

  it.each(keys)('%s posts the %s IRCC code as SOAP', async (method, code) => {
    const device = await createDevice();

    await (device[method] as () => Promise<void>)();

    expect(soapClient().post).toHaveBeenCalledTimes(1);
    const [url, body] = soapClient().post.mock.calls[0];
    expect(url).toBe('');
    expect(body).toContain(`<IRCCCode>${code}</IRCCCode>`);
    expect(body).toContain('urn:schemas-sony-com:service:IRCC:1');
  });

  it('does nothing when the device has no IRCC endpoint', async () => {
    const device = await createDeviceWithoutIrcc();
    const callsBefore = apiClient().post.mock.calls.length;

    await expect(device.setUp()).resolves.toBeUndefined();

    expect(instances).toHaveLength(2);
    expect(apiClient().post.mock.calls).toHaveLength(callsBefore);
  });
});

describe('SonyDevice.responseInterceptor', () => {
  it('passes a successful response through', () => {
    const interceptor = SonyDevice.responseInterceptor(log);
    const response = { data: { result: [[]] } } as any;
    expect(interceptor(response)).toBe(response);
  });

  it('rejects with a GenericApiError when the payload contains an error', async () => {
    const interceptor = SonyDevice.responseInterceptor(log);
    await expect(interceptor({ data: { error: [7, 'Illegal Argument'] } } as any))
      .rejects.toBeInstanceOf(GenericApiError);
  });

  it('passes non-object payloads through', () => {
    const interceptor = SonyDevice.responseInterceptor(log);
    const response = { data: '<xml/>' } as any;
    expect(interceptor(response)).toBe(response);
  });

  it('logs the response for debugging', () => {
    const interceptor = SonyDevice.responseInterceptor(log);
    interceptor({ data: { result: [] } } as any);
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('Response from device'));
  });
});

describe('SonyDevice.requestInterceptorLogger', () => {
  it('logs and returns the request unchanged', () => {
    const interceptor = SonyDevice.requestInterceptorLogger(log);
    const request = { baseURL: 'http://host/sony', data: '{"method":"x"}' } as any;
    expect(interceptor(request)).toBe(request);
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('Request to device'));
  });
});

describe('SonyDevice notifications', () => {
  const initialFrame = {
    id: 1,
    result: [{
      enabled: [],
      disabled: [
        { name: 'notifyVolumeInformation', version: '1.0' },
        { name: 'notifyPowerStatus', version: '1.0' },
      ],
    }],
  };

  it('asks for the current subscriptions when a socket opens', async () => {
    await createDevice();
    const ws = FakeWebSocket.forService('audio');
    ws.emit('open');

    expect(ws.lastSent).toMatchObject({ method: 'switchNotifications', id: 1 });
  });

  it('subscribes to the notifications it needs after the initial answer', async () => {
    await createDevice();
    const ws = FakeWebSocket.forService('audio');
    ws.emit('open');
    ws.receive(initialFrame);

    const subscribe = ws.lastSent;
    expect(subscribe.id).toBe(2);
    expect(subscribe.params[0].enabled).toEqual([{ name: 'notifyVolumeInformation', version: '1.0' }]);
    expect(subscribe.params[0].disabled).toEqual([{ name: 'notifyPowerStatus', version: '1.0' }]);
  });

  it('emits POWER on notifyPowerStatus', async () => {
    const device = await createDevice();
    const ws = FakeWebSocket.forService('system');
    const onPower = jest.fn();
    device.on(DEVICE_EVENTS.POWER, onPower);

    ws.receive({ method: 'notifyPowerStatus', params: [{ status: 'active' }], version: '1.0' });
    ws.receive({ method: 'notifyPowerStatus', params: [{ status: 'standby' }], version: '1.0' });

    expect(onPower.mock.calls).toEqual([[true], [false]]);
  });

  it('emits VOLUME and MUTE on notifyVolumeInformation', async () => {
    const device = await createDevice();
    const ws = FakeWebSocket.forService('audio');
    const onVolume = jest.fn();
    const onMute = jest.fn();
    device.on(DEVICE_EVENTS.VOLUME, onVolume);
    device.on(DEVICE_EVENTS.MUTE, onMute);

    ws.receive({
      method: 'notifyVolumeInformation',
      params: [{ output: 'extOutput:zone?zone=1', volume: 12, mute: 'on' }],
      version: '1.0',
    });

    expect(onVolume).toHaveBeenCalledWith(12);
    expect(onMute).toHaveBeenCalledWith(true);
  });

  it('does not emit VOLUME when the device reports -1', async () => {
    const device = await createDevice();
    const ws = FakeWebSocket.forService('audio');
    const onVolume = jest.fn();
    const onMute = jest.fn();
    device.on(DEVICE_EVENTS.VOLUME, onVolume);
    device.on(DEVICE_EVENTS.MUTE, onMute);

    ws.receive({
      method: 'notifyVolumeInformation',
      params: [{ output: 'extOutput:zone?zone=1', volume: -1, mute: 'toggle' }],
      version: '1.0',
    });

    expect(onVolume).not.toHaveBeenCalled();
    expect(onMute).not.toHaveBeenCalled();
  });

  it('updates the cached volume information from a notification', async () => {
    const device = await createDevice();
    await device.getVolumeInformation();
    const ws = FakeWebSocket.forService('audio');

    ws.receive({
      method: 'notifyVolumeInformation',
      params: [{ output: 'extOutput:zone?zone=1', volume: 42, mute: 'on' }],
      version: '1.0',
    });

    const cached = await device.getVolumeInformation();
    expect(cached!.find(v => v.output === 'extOutput:zone?zone=1')).toMatchObject({ volume: 42, mute: 'on' });
  });

  it('emits SOURCE on notifyPlayingContentInfo', async () => {
    const device = await createDevice();
    const ws = FakeWebSocket.forService('avContent');
    const onSource = jest.fn();
    device.on(DEVICE_EVENTS.SOURCE, onSource);

    ws.receive({
      method: 'notifyPlayingContentInfo',
      params: [{ output: 'extOutput:zone?zone=1', source: 'extInput:hdmi?port=1', uri: 'extInput:hdmi?port=1' }],
      version: '1.0',
    });

    expect(onSource).toHaveBeenCalledWith('extInput:hdmi?port=1');
  });

  it('falls back to the uri when a playing content notification has no source', async () => {
    const device = await createDevice();
    const ws = FakeWebSocket.forService('avContent');
    const onSource = jest.fn();
    device.on(DEVICE_EVENTS.SOURCE, onSource);

    ws.receive({ method: 'notifyPlayingContentInfo', params: [{ uri: 'radio:fm' }], version: '1.0' });

    expect(onSource).toHaveBeenCalledWith('radio:fm');
  });

  it('updates cached terminals and re-checks the power state on notifyExternalTerminalStatus', async () => {
    const device = await createDevice();
    await device.getExternalTerminals();
    const ws = FakeWebSocket.forService('avContent');
    const onPower = jest.fn();
    device.on(DEVICE_EVENTS.POWER, onPower);

    ws.receive({
      method: 'notifyExternalTerminalStatus',
      params: [{ active: 'inactive', connection: 'connected', label: 'Renamed', uri: 'extOutput:zone?zone=1' }],
      version: '1.0',
    });
    await flush();

    expect(device.getTerminalBySource('extOutput:zone?zone=1')).toMatchObject({
      active: 'inactive',
      label: 'Renamed',
    });
    expect(onPower).toHaveBeenCalledWith(true);
  });

  it('adds unknown terminals reported by a notification', async () => {
    const device = await createDevice();
    await device.getExternalTerminals();
    const ws = FakeWebSocket.forService('avContent');

    ws.receive({
      method: 'notifyExternalTerminalStatus',
      params: [{ connection: 'connected', label: 'New', title: 'New', uri: 'extInput:hdmi?port=9' }],
      version: '1.0',
    });
    await flush();

    expect(device.getTerminalBySource('extInput:hdmi?port=9')).toMatchObject({ label: 'New' });
  });

  it('logs unknown notification methods', async () => {
    await createDevice();
    const ws = FakeWebSocket.forService('system');

    ws.receive({ method: 'notifySomethingNew', params: [{}], version: '1.0' });

    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('not implemented notification'));
  });

  it('emits RESTORE once after a reconnect is confirmed', async () => {
    const device = await createDevice();
    const onRestore = jest.fn();
    device.on(DEVICE_EVENTS.RESTORE, onRestore);

    const ws = FakeWebSocket.forService('system');
    ws.emit('close');
    jest.advanceTimersByTime(5000);

    const reconnected = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    expect(reconnected).not.toBe(ws);
    reconnected.receive({ id: 2, result: [] });

    expect(onRestore).toHaveBeenCalledTimes(1);

    reconnected.receive({ id: 2, result: [] });
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('drops the socket and stops on a websocket error', async () => {
    const device = await createDevice();
    const ws = FakeWebSocket.forService('audio');

    ws.emit('error', new Error('ECONNRESET'));

    expect(ws.terminated).toBe(true);
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('ECONNRESET'));
    expect(device).toBeInstanceOf(SonyDevice);
  });

  it('re-sends the subscription command when subscribe() is called again', async () => {
    const device = await createDevice();
    const ws = FakeWebSocket.forService('audio');
    ws.emit('open');
    ws.receive(initialFrame);
    const before = ws.sent.length;

    device.subscribe();

    expect(ws.sent.length).toBe(before + 1);
    expect(ws.lastSent.id).toBe(2);
  });
});

describe('SonyDevice websocket heartbeat', () => {
  const openAndSubscribe = (ws: FakeWebSocket) => {
    ws.emit('open');
    ws.receive({
      id: 1,
      result: [{ enabled: [], disabled: [{ name: 'notifyVolumeInformation', version: '1.0' }] }],
    });
  };

  it('re-sends the subscription command on every heartbeat', async () => {
    await createDevice();
    const ws = FakeWebSocket.forService('audio');
    openAndSubscribe(ws);
    const before = ws.sent.length;

    jest.advanceTimersByTime(60 * 1000);

    expect(ws.sent.length).toBe(before + 1);
    expect(ws.lastSent.id).toBe(2);
  });

  it('terminates a socket that does not answer a heartbeat', async () => {
    await createDevice();
    const ws = FakeWebSocket.forService('audio');
    openAndSubscribe(ws);

    jest.advanceTimersByTime(60 * 1000 + 3000);

    expect(ws.terminated).toBe(true);
  });

  it('keeps a socket that answers the heartbeat alive', async () => {
    await createDevice();
    const ws = FakeWebSocket.forService('audio');
    openAndSubscribe(ws);

    jest.advanceTimersByTime(60 * 1000);
    ws.receive({ id: 2, result: [] });
    jest.advanceTimersByTime(3000);

    expect(ws.terminated).toBe(false);
  });

  it('reconnects a socket that was closed unexpectedly', async () => {
    await createDevice();
    const ws = FakeWebSocket.forService('audio');
    const count = FakeWebSocket.instances.length;

    ws.emit('close');
    jest.advanceTimersByTime(5000);

    expect(FakeWebSocket.instances.length).toBe(count + 1);
    expect(FakeWebSocket.instances[count].url).toBe('ws://192.168.1.10:10000/sony/audio');
  });
});

describe('SonyDevice.unsubscribe', () => {
  it('sends a disabling switchNotifications frame on every open socket', async () => {
    const device = await createDevice();

    device.unsubscribe();

    const ws = FakeWebSocket.forService('audio');
    expect(ws.lastSent).toMatchObject({ method: 'switchNotifications', id: 100 });
    expect(ws.lastSent.params[0].disabled).toEqual([{ name: 'notifyVolumeInformation', version: '1.0' }]);
    expect(ws.lastSent.params[0].enabled).toEqual([]);
  });

  it('terminates the socket when the device confirms the unsubscribe', async () => {
    const device = await createDevice();
    device.unsubscribe();

    const ws = FakeWebSocket.forService('system');
    ws.receive({ id: 100, result: [] });

    expect(ws.terminated).toBe(true);
  });

  it('does not reconnect after unsubscribing', async () => {
    const device = await createDevice();
    device.unsubscribe();

    const count = FakeWebSocket.instances.length;
    FakeWebSocket.forService('audio').emit('close');
    jest.advanceTimersByTime(10000);

    expect(FakeWebSocket.instances).toHaveLength(count);
  });

  it('skips sockets that are not open', async () => {
    const device = await createDevice();
    const ws = FakeWebSocket.forService('audio');
    ws.readyState = FakeWebSocket.CLOSED;

    device.unsubscribe();

    expect(ws.sent).toHaveLength(0);
  });
});
