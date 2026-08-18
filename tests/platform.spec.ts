/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('../src/discoverer', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { EventEmitter } = require('events');
  class FakeDiscoverer extends EventEmitter {
    static instances: FakeDiscoverer[] = [];
    startDiscovery = jest.fn();
    stopDiscovery = jest.fn();
    constructor() {
      super();
      FakeDiscoverer.instances.push(this);
    }
  }
  return { Discoverer: FakeDiscoverer, DiscoveryEvents: { NewDeviceFound: 'new-device-found' } };
});

jest.mock('../src/sonyAudioAccessory', () => ({
  SonyAudioAccessory: jest.fn(function (this: { ready: Promise<void> }) {
    this.ready = Promise.resolve();
  }),
}));

import { Categories, PlatformConfig } from 'homebridge';
import { SonyAudioHomebridgePlatform } from '../src/platform';
import { PLATFORM_NAME, PLUGIN_NAME } from '../src/settings';
import { Discoverer } from '../src/discoverer';
import { SonyAudioAccessory } from '../src/sonyAudioAccessory';
import { SonyDevice } from '../src/sonyDevice';
import { createMockApi, MockApi, FakePlatformAccessory, asPlatformAccessory } from './helpers/homebridge';
import { createMockLogger, MockLogger } from './helpers/logger';

const AccessoryMock = SonyAudioAccessory as unknown as jest.Mock;
const DiscovererMock = Discoverer as unknown as { instances: { startDiscovery: jest.Mock; stopDiscovery: jest.Mock; emit: (e: string, ...a: unknown[]) => void }[] };

const config: PlatformConfig = { platform: PLATFORM_NAME, name: 'SonyAudio' };

function fakeDevice(udn = 'uuid:device-1', name = 'HT-Z9F'): SonyDevice {
  return {
    UDN: udn,
    manufacturer: 'Sony Corporation',
    systemInfo: { name, model: 'HT-Z9F', serial: 'SERIAL-123' },
    unsubscribe: jest.fn(),
  } as unknown as SonyDevice;
}

let log: MockLogger;
let api: MockApi;
let platform: SonyAudioHomebridgePlatform;

const discoverer = () => DiscovererMock.instances[DiscovererMock.instances.length - 1];

/** The accessory is published once its inputs are ready, i.e. after a few microtasks. */
const flushPublish = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
  DiscovererMock.instances.length = 0;
  log = createMockLogger();
  api = createMockApi();
  delete process.env.HOMEBRIDGE_SONY_AUDIO_DEV;
  platform = new SonyAudioHomebridgePlatform(log, config, api);
});

describe('SonyAudioHomebridgePlatform construction', () => {
  it('exposes the hap Service and Characteristic', () => {
    expect(platform.Service).toBe(api.hap.Service);
    expect(platform.Characteristic).toBe(api.hap.Characteristic);
  });

  it('registers the didFinishLaunching and shutdown handlers', () => {
    expect(api.on).toHaveBeenCalledWith('didFinishLaunching', expect.any(Function));
    expect(api.on).toHaveBeenCalledWith('shutdown', expect.any(Function));
  });

  it('does not start discovery before didFinishLaunching', () => {
    expect(discoverer().startDiscovery).not.toHaveBeenCalled();
  });

  it('starts discovery on didFinishLaunching', () => {
    api.emit('didFinishLaunching');
    expect(discoverer().startDiscovery).toHaveBeenCalledTimes(1);
  });
});

describe('configureAccessory', () => {
  it('keeps restored accessories in the cache', () => {
    const cached = new FakePlatformAccessory('HT-Z9F', 'uuid-1');
    platform.configureAccessory(asPlatformAccessory(cached));

    expect(platform.accessories).toContain(cached as unknown as never);
    expect(log.info).toHaveBeenCalledWith('Loading accessory from cache:', 'HT-Z9F');
  });
});

describe('publishDevice', () => {
  it('publishes a brand new accessory as an external accessory', async () => {
    const device = fakeDevice();
    platform.publishDevice(device);
    await flushPublish();

    expect(api.publishExternalAccessories).toHaveBeenCalledTimes(1);
    const [pluginName, accessories] = api.publishExternalAccessories.mock.calls[0];
    expect(pluginName).toBe(PLUGIN_NAME);
    expect(accessories).toHaveLength(1);
    expect(accessories[0].displayName).toBe('HT-Z9F');
    expect(accessories[0].UUID).toBe(api.hap.uuid.generate(device.UDN));
    expect(accessories[0].category).toBe(Categories.AUDIO_RECEIVER);
    expect(accessories[0].context).toBe(device);
    expect(AccessoryMock).toHaveBeenCalledWith(platform, accessories[0]);
  });

  it('tracks published devices for a clean shutdown', () => {
    const device = fakeDevice();
    platform.publishDevice(device);
    expect(platform.devices).toEqual([device]);
  });

  it('reuses a cached accessory with the same uuid', () => {
    const device = fakeDevice();
    const cached = new FakePlatformAccessory('HT-Z9F', api.hap.uuid.generate(device.UDN));
    platform.configureAccessory(asPlatformAccessory(cached));

    platform.publishDevice(device);

    expect(api.publishExternalAccessories).not.toHaveBeenCalled();
    expect(api.updatePlatformAccessories).toHaveBeenCalledWith([cached]);
    expect(AccessoryMock).toHaveBeenCalledWith(platform, cached);
    expect(log.info).toHaveBeenCalledWith('Restoring existing accessory from cache:', 'HT-Z9F');
  });

  // `publishDevice` dereferences `device.UDN` before its `if (device)` check,
  // so the "remove a stale accessory" branch is currently unreachable. This test
  // pins the current behaviour down: passing no device throws instead.
  it('throws when called without a device', () => {
    const cached = new FakePlatformAccessory('HT-Z9F', api.hap.uuid.generate('uuid:device-1'));
    platform.configureAccessory(asPlatformAccessory(cached));

    expect(() => platform.publishDevice(undefined as unknown as SonyDevice)).toThrow(TypeError);

    expect(api.unregisterPlatformAccessories).not.toHaveBeenCalled();
    expect(AccessoryMock).not.toHaveBeenCalled();
  });

  it('salts the uuid with HOMEBRIDGE_SONY_AUDIO_DEV', async () => {
    process.env.HOMEBRIDGE_SONY_AUDIO_DEV = 'dev1';
    const device = fakeDevice();

    platform.publishDevice(device);
    await flushPublish();

    const [, accessories] = api.publishExternalAccessories.mock.calls[0];
    expect(accessories[0].UUID).toBe(api.hap.uuid.generate(device.UDN + 'dev1'));
    expect(accessories[0].UUID).not.toBe(api.hap.uuid.generate(device.UDN));
  });

  it('gives different devices different accessories', async () => {
    platform.publishDevice(fakeDevice('uuid:a', 'Bedroom'));
    platform.publishDevice(fakeDevice('uuid:b', 'Kitchen'));
    await flushPublish();

    expect(api.publishExternalAccessories).toHaveBeenCalledTimes(2);
    expect(platform.devices).toHaveLength(2);
  });

  // The InputSource services are created asynchronously (persisted settings + a device
  // query), so the accessory must not be published before they exist - otherwise HomeKit
  // sees a Television without inputs. See #42.
  it('publishes the accessory only after its inputs have been built (#42)', async () => {
    let buildInputs!: () => void;
    AccessoryMock.mockImplementationOnce(function (this: { ready: Promise<void> }) {
      this.ready = new Promise<void>(resolve => buildInputs = resolve);
    });

    platform.publishDevice(fakeDevice());
    await Promise.resolve();
    expect(api.publishExternalAccessories).not.toHaveBeenCalled();

    buildInputs();
    await Promise.resolve();
    await Promise.resolve();
    expect(api.publishExternalAccessories).toHaveBeenCalledTimes(1);
  });

  // Television accessories are published as *external* accessories, which homebridge
  // does not cache: `configureAccessory` is never called for them, so "Adding new
  // accessory" is logged on every start. That is expected - the accessory keeps its
  // pairing because the uuid is derived from the (stable) device UDN. See #33.
  it('re-adds the accessory with the same uuid on every restart (#33)', async () => {
    const device = fakeDevice();
    platform.publishDevice(device);
    await flushPublish();
    const firstUuid = api.publishExternalAccessories.mock.calls[0][1][0].UUID;

    // a restart: a brand new platform, homebridge restores nothing for external accessories
    api = createMockApi();
    const restarted = new SonyAudioHomebridgePlatform(log, config, api);
    restarted.publishDevice(fakeDevice());
    await flushPublish();

    expect(restarted.accessories).toHaveLength(0);
    expect(api.publishExternalAccessories.mock.calls[0][1][0].UUID).toBe(firstUuid);
    expect(log.info).toHaveBeenCalledWith('Adding new accessory:', 'HT-Z9F');
  });
});

describe('discoverDevices', () => {
  it('publishes every device the discoverer finds', async () => {
    api.emit('didFinishLaunching');
    const device = fakeDevice();

    discoverer().emit('new-device-found', device);
    await flushPublish();

    expect(api.publishExternalAccessories).toHaveBeenCalledTimes(1);
    expect(platform.devices).toEqual([device]);
  });
});

describe('shutdown', () => {
  it('stops discovery and unsubscribes every device', () => {
    const first = fakeDevice('uuid:a');
    const second = fakeDevice('uuid:b');
    platform.publishDevice(first);
    platform.publishDevice(second);

    api.emit('shutdown');

    expect(discoverer().stopDiscovery).toHaveBeenCalledTimes(1);
    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    expect(second.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
