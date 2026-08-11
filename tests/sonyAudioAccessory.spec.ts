/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('../src/sonyAudioAccessorySettings', () => {
  class FakeSettings {
    static instances: FakeSettings[] = [];
    static persistPathUsed: string | undefined;
    static uuidUsed: string | undefined;

    /** Values every new instance starts with, so tests can pre-seed storage. */
    static preset = new Map<string, { name?: string; visibilityState?: 0 | 1 }>();

    inputs = new Map<string, { name?: string; visibilityState?: 0 | 1 }>(FakeSettings.preset);
    getInputName = jest.fn(async (id: string, defaultName: string) => {
      const input = this.inputs.get(id);
      if (input?.name === undefined) {
        this.inputs.set(id, { ...input, name: defaultName });
        return defaultName;
      }
      return input.name;
    });

    getInputVisibility = jest.fn(async (id: string, defaultVisibility: 0 | 1) => {
      const input = this.inputs.get(id);
      if (input?.visibilityState === undefined) {
        this.inputs.set(id, { ...input, visibilityState: defaultVisibility });
        return defaultVisibility;
      }
      return input.visibilityState;
    });

    setInputName = jest.fn(async (id: string, name: string) => {
      this.inputs.set(id, { ...this.inputs.get(id), name });
      return { id, ...this.inputs.get(id) };
    });

    setInputVisibility = jest.fn(async (id: string, visibilityState: 0 | 1) => {
      this.inputs.set(id, { ...this.inputs.get(id), visibilityState });
      return { id, ...this.inputs.get(id) };
    });

    static GetInstance = jest.fn(async (uuid: string, storagePath: string) => {
      FakeSettings.uuidUsed = uuid;
      FakeSettings.persistPathUsed = storagePath;
      const settings = new FakeSettings();
      FakeSettings.instances.push(settings);
      return settings;
    });
  }
  return { SonyAudioAccessorySettings: FakeSettings };
});

import { CharacteristicSetCallback } from 'homebridge';
import { EventEmitter } from 'events';
import { Characteristic, Service } from 'hap-nodejs';
import { SonyAudioAccessory } from '../src/sonyAudioAccessory';
import { SonyAudioAccessorySettings } from '../src/sonyAudioAccessorySettings';
import { SonyDevice, DEVICE_EVENTS } from '../src/sonyDevice';
import { ExternalTerminal, TerminalTypeMeta } from '../src/api';
import { SonyAudioHomebridgePlatform } from '../src/platform';
import { createMockApi, FakePlatformAccessory, asPlatformAccessory, MockApi } from './helpers/homebridge';
import { createMockLogger, MockLogger } from './helpers/logger';

const Settings = SonyAudioAccessorySettings as unknown as {
  GetInstance: jest.Mock;
  instances: any[];
  preset: Map<string, { name?: string; visibilityState?: 0 | 1 }>;
  persistPathUsed?: string;
  uuidUsed?: string;
};

const TERMINALS: ExternalTerminal[] = [
  {
    active: 'active',
    connection: 'connected',
    label: 'Telly',
    meta: TerminalTypeMeta.TV,
    title: 'TV',
    uri: 'extInput:tv',
  } as ExternalTerminal,
  {
    connection: 'connected',
    label: '',
    meta: TerminalTypeMeta.HDMI,
    title: 'HDMI 1',
    uri: 'extInput:hdmi?port=1',
  } as ExternalTerminal,
];

class FakeDevice extends EventEmitter {
  systemInfo = { name: 'HT Z9F', model: 'HT-Z9F', serial: 'SERIAL-123' };
  manufacturer = 'Sony Corporation';
  UDN = 'uuid:00000000-0000-1010-8000-aabbccddeeff';

  terminals: ExternalTerminal[] = TERMINALS;

  getInputs = jest.fn(async () => this.terminals);
  isReadonlyTerminal = jest.fn(() => false);
  getPowerState = jest.fn(async () => true);
  getVolumeState = jest.fn(async () => ({
    output: 'extOutput:zone?zone=1',
    volume: 20,
    mute: 'off',
    maxVolume: 50,
    minVolume: 0,
    step: 1,
  }));

  getActiveInput = jest.fn(async () => this.terminals[0]);
  getTerminalBySource = jest.fn((uri: string) => this.terminals.find(t => t.uri === uri) || null);
  setVolume = jest.fn(async (v: 0 | 1) => v);
  setVolumeAbsolute = jest.fn(async (v: number) => v);
  setMute = jest.fn(async (m: boolean) => m);
  setPower = jest.fn(async (p: boolean) => p);
  setSource = jest.fn(async (t: ExternalTerminal) => t);
  setPause = jest.fn(async () => undefined);
  setUp = jest.fn(async () => undefined);
  setDown = jest.fn(async () => undefined);
  setRigth = jest.fn(async () => undefined);
  setLeft = jest.fn(async () => undefined);
  setSelect = jest.fn(async () => undefined);
  setBack = jest.fn(async () => undefined);
  setInformation = jest.fn(async () => undefined);
}

let log: MockLogger;
let api: MockApi;
let platform: SonyAudioHomebridgePlatform;
let device: FakeDevice;
let accessory: FakePlatformAccessory;

const flush = () => new Promise(resolve => setImmediate(resolve));

function build() {
  accessory = new FakePlatformAccessory(device.systemInfo.name, 'ACCESSORY-UUID');
  accessory.context = device;
  return new SonyAudioAccessory(platform, asPlatformAccessory(accessory));
}

/** Builds the accessory and waits for its async init to settle. */
async function buildReady() {
  const sonyAccessory = build();
  await flush();
  await flush();
  return sonyAccessory;
}

const tvService = () => accessory.getService(device.systemInfo.name)!;
const speakerService = () => accessory.getService(device.systemInfo.name + ' Speaker')!;
const inputServices = () => accessory.services.filter(s => s.UUID === Service.InputSource.UUID);
const subtypeOf = (terminal: ExternalTerminal) => api.hap.uuid.generate(terminal.uri);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  Settings.instances.length = 0;
  Settings.preset.clear();
  log = createMockLogger();
  api = createMockApi('/var/lib/homebridge');
  platform = { Service, Characteristic, api, log } as unknown as SonyAudioHomebridgePlatform;
  device = new FakeDevice();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('accessory setup', () => {
  it('fills in the accessory information service', async () => {
    await buildReady();
    const info = accessory.getService(Service.AccessoryInformation)!;

    expect(info.getCharacteristic(Characteristic.Manufacturer).value).toBe('Sony Corporation');
    expect(info.getCharacteristic(Characteristic.Model).value).toBe('HT-Z9F');
    expect(info.getCharacteristic(Characteristic.SerialNumber).value).toBe('SERIAL-123');
  });

  it('falls back to the UDN when the device has no serial', async () => {
    device.systemInfo.serial = '';
    await buildReady();
    const info = accessory.getService(Service.AccessoryInformation)!;
    expect(info.getCharacteristic(Characteristic.SerialNumber).value).toBe(device.UDN);
  });

  it('creates a Television and a TelevisionSpeaker service', async () => {
    await buildReady();

    expect(tvService().UUID).toBe(Service.Television.UUID);
    expect(speakerService().UUID).toBe(Service.TelevisionSpeaker.UUID);
    expect(tvService().getCharacteristic(Characteristic.ConfiguredName).value).toBe('HT Z9F');
    expect(tvService().getCharacteristic(Characteristic.SleepDiscoveryMode).value)
      .toBe(Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
  });

  it('links the speaker and the inputs to the television service', async () => {
    await buildReady();
    const linked = tvService().linkedServices;

    expect(linked).toContain(speakerService());
    inputServices().forEach(input => expect(linked).toContain(input));
  });

  it('reuses services of a restored accessory instead of adding new ones', async () => {
    await buildReady();
    const serviceCount = accessory.services.length;
    const tv = tvService();

    // simulate homebridge restoring the same accessory
    new SonyAudioAccessory(platform, asPlatformAccessory(accessory));
    await flush();
    await flush();

    expect(accessory.services).toHaveLength(serviceCount);
    expect(tvService()).toBe(tv);
  });

  it('loads the settings from the homebridge persist path', async () => {
    await buildReady();
    expect(Settings.GetInstance).toHaveBeenCalledWith('ACCESSORY-UUID', '/var/lib/homebridge', log);
  });
});

describe('buildInputs', () => {
  it('creates one InputSource service per device input', async () => {
    await buildReady();
    expect(inputServices()).toHaveLength(TERMINALS.length);
  });

  it('uses HomeKit safe names derived from the terminal', async () => {
    await buildReady();
    const [tv, hdmi] = inputServices();

    expect(tv.getCharacteristic(Characteristic.Name).value).toBe('extInput tv');
    expect(tv.getCharacteristic(Characteristic.ConfiguredName).value).toBe('Telly');
    // an empty label falls back to the terminal title
    expect(hdmi.getCharacteristic(Characteristic.ConfiguredName).value).toBe('HDMI 1');
  });

  it('numbers the inputs with sequential identifiers', async () => {
    await buildReady();
    expect(inputServices().map(s => s.getCharacteristic(Characteristic.Identifier).value)).toEqual([0, 1]);
  });

  it('derives the input subtype from the terminal uri', async () => {
    await buildReady();
    expect(inputServices().map(s => s.subtype)).toEqual(TERMINALS.map(subtypeOf));
  });

  it('shows the inputs by default', async () => {
    await buildReady();
    inputServices().forEach(input => {
      expect(input.getCharacteristic(Characteristic.CurrentVisibilityState).value)
        .toBe(Characteristic.CurrentVisibilityState.SHOWN);
      expect(input.getCharacteristic(Characteristic.TargetVisibilityState).value)
        .toBe(Characteristic.TargetVisibilityState.SHOWN);
    });
  });

  it('restores a persisted name and visibility', async () => {
    Settings.preset.set(subtypeOf(TERMINALS[0]), { name: 'Kitchen TV', visibilityState: 1 });

    await buildReady();
    const [tv] = inputServices();

    expect(tv.getCharacteristic(Characteristic.ConfiguredName).value).toBe('Kitchen TV');
    expect(tv.getCharacteristic(Characteristic.CurrentVisibilityState).value)
      .toBe(Characteristic.CurrentVisibilityState.HIDDEN);
    expect(tv.getCharacteristic(Characteristic.TargetVisibilityState).value)
      .toBe(Characteristic.TargetVisibilityState.HIDDEN);
  });

  it('marks readonly terminals as not configured', async () => {
    device.isReadonlyTerminal = jest.fn((terminal: ExternalTerminal) => terminal.uri === 'extInput:tv') as any;
    await buildReady();
    const [tv, hdmi] = inputServices();

    expect(tv.getCharacteristic(Characteristic.IsConfigured).value).toBe(Characteristic.IsConfigured.NOT_CONFIGURED);
    expect(hdmi.getCharacteristic(Characteristic.IsConfigured).value).toBe(Characteristic.IsConfigured.CONFIGURED);
  });

  const inputSourceTypes: [TerminalTypeMeta, number][] = [
    [TerminalTypeMeta.HDMI, Characteristic.InputSourceType.HDMI],
    [TerminalTypeMeta.TV, Characteristic.InputSourceType.HDMI],
    [TerminalTypeMeta.BTAUDIO, Characteristic.InputSourceType.AIRPLAY],
    [TerminalTypeMeta.BTPHONE, Characteristic.InputSourceType.AIRPLAY],
    [TerminalTypeMeta.COMPOSITE, Characteristic.InputSourceType.COMPOSITE_VIDEO],
    [TerminalTypeMeta.COAXIAL, Characteristic.InputSourceType.COMPOSITE_VIDEO],
    [TerminalTypeMeta.COMPONENT, Characteristic.InputSourceType.COMPONENT_VIDEO],
    [TerminalTypeMeta.DIGITALCAMERA, Characteristic.InputSourceType.DVI],
    [TerminalTypeMeta.SVIDEO, Characteristic.InputSourceType.S_VIDEO],
    [TerminalTypeMeta.TUNER, Characteristic.InputSourceType.TUNER],
    [TerminalTypeMeta.USBDAC, Characteristic.InputSourceType.USB],
    [TerminalTypeMeta.NO_INFO, Characteristic.InputSourceType.OTHER],
  ];

  it.each(inputSourceTypes)('maps the meta %s to the right InputSourceType', async (meta, expected) => {
    device.terminals = [{ ...TERMINALS[0], meta, uri: 'extInput:test' } as ExternalTerminal];
    await buildReady();
    expect(inputServices()[0].getCharacteristic(Characteristic.InputSourceType).value).toBe(expected);
  });

  const inputDeviceTypes: [TerminalTypeMeta, number][] = [
    [TerminalTypeMeta.TV, Characteristic.InputDeviceType.TV],
    [TerminalTypeMeta.SAT_CATV, Characteristic.InputDeviceType.TV],
    [TerminalTypeMeta.CAMCODER, Characteristic.InputDeviceType.RECORDING],
    [TerminalTypeMeta.TUNER, Characteristic.InputDeviceType.TUNER],
    [TerminalTypeMeta.DISC, Characteristic.InputDeviceType.PLAYBACK],
    [TerminalTypeMeta.AUDIOSYSTEM, Characteristic.InputDeviceType.AUDIO_SYSTEM],
    [TerminalTypeMeta.HDMI, Characteristic.InputDeviceType.OTHER],
  ];

  it.each(inputDeviceTypes)('maps the meta %s to the right InputDeviceType', async (meta, expected) => {
    device.terminals = [{ ...TERMINALS[0], meta, uri: 'extInput:test' } as ExternalTerminal];
    await buildReady();
    expect(inputServices()[0].getCharacteristic(Characteristic.InputDeviceType).value).toBe(expected);
  });
});

describe('initAccessoryCharacteristics', () => {
  it('reads power, volume, mute and the active input from the device', async () => {
    await buildReady();

    expect(device.getPowerState).toHaveBeenCalled();
    expect(device.getVolumeState).toHaveBeenCalled();
    expect(device.getActiveInput).toHaveBeenCalled();
    expect(tvService().getCharacteristic(Characteristic.Active).value).toBe(Characteristic.Active.ACTIVE);
    expect(speakerService().getCharacteristic(Characteristic.Volume).value).toBe(20);
    expect(speakerService().getCharacteristic(Characteristic.Mute).value).toBe(false);
  });

  it('applies the volume range reported by the device', async () => {
    await buildReady();
    const volume = speakerService().getCharacteristic(Characteristic.Volume);

    expect(volume.props.minValue).toBe(0);
    expect(volume.props.maxValue).toBe(50);
    expect(volume.props.minStep).toBe(1);
    expect(speakerService().getCharacteristic(Characteristic.VolumeControlType).value)
      .toBe(Characteristic.VolumeControlType.ABSOLUTE);
  });

  it('uses a minStep of 1 when the device reports a step of 0', async () => {
    device.getVolumeState = jest.fn(async () => ({
      output: 'extOutput:zone?zone=1', volume: 10, mute: 'off', maxVolume: 50, minVolume: 0, step: 0,
    }));
    await buildReady();
    expect(speakerService().getCharacteristic(Characteristic.Volume).props.minStep).toBe(1);
  });

  it('switches to relative volume control when the device has no absolute volume', async () => {
    device.getVolumeState = jest.fn(async () => ({
      output: 'extOutput:zone?zone=1', volume: 10, mute: 'off', maxVolume: -1, minVolume: -1, step: 1,
    }));
    await buildReady();

    expect(speakerService().getCharacteristic(Characteristic.VolumeControlType).value)
      .toBe(Characteristic.VolumeControlType.RELATIVE);
  });

  it('reflects a muted device', async () => {
    device.getVolumeState = jest.fn(async () => ({
      output: 'extOutput:zone?zone=1', volume: 10, mute: 'on', maxVolume: 50, minVolume: 0, step: 1,
    }));
    await buildReady();
    expect(speakerService().getCharacteristic(Characteristic.Mute).value).toBe(true);
  });

  it('marks the accessory inactive when the device is off', async () => {
    device.getPowerState = jest.fn(async () => false);
    await buildReady();
    expect(tvService().getCharacteristic(Characteristic.Active).value).toBe(Characteristic.Active.INACTIVE);
  });

  it('selects the currently active input', async () => {
    device.getActiveInput = jest.fn(async () => device.terminals[1]);
    await buildReady();
    expect(tvService().getCharacteristic(Characteristic.ActiveIdentifier).value).toBe(1);
  });

  it('logs an unreachable device once and retries later', async () => {
    device.getPowerState = jest.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    });

    await buildReady();
    expect(log.error).toHaveBeenCalledWith('Device HT Z9F: connect ECONNREFUSED');
    expect(log.error).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    await flush();
    await flush();

    expect(device.getPowerState.mock.calls.length).toBeGreaterThan(1);
    // the same error must not be logged again
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('recovers once the device answers again', async () => {
    device.getPowerState = jest.fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValue(true);

    await buildReady();
    jest.advanceTimersByTime(5000);
    await flush();
    await flush();

    expect(tvService().getCharacteristic(Characteristic.Active).value).toBe(Characteristic.Active.ACTIVE);
  });

  it('re-initialises the characteristics on a RESTORE event', async () => {
    await buildReady();
    const before = device.getPowerState.mock.calls.length;

    device.emit(DEVICE_EVENTS.RESTORE);
    await flush();

    expect(device.getPowerState.mock.calls.length).toBe(before + 1);
  });
});

describe('device events', () => {
  it('updates the volume characteristic on a VOLUME event', async () => {
    await buildReady();
    device.emit(DEVICE_EVENTS.VOLUME, 35);
    expect(speakerService().getCharacteristic(Characteristic.Volume).value).toBe(35);
  });

  it('updates the mute characteristic on a MUTE event', async () => {
    await buildReady();
    device.emit(DEVICE_EVENTS.MUTE, true);
    expect(speakerService().getCharacteristic(Characteristic.Mute).value).toBe(true);
  });

  it('updates both Active characteristics on a POWER event', async () => {
    await buildReady();
    device.emit(DEVICE_EVENTS.POWER, false);
    expect(tvService().getCharacteristic(Characteristic.Active).value).toBe(Characteristic.Active.INACTIVE);
    expect(speakerService().getCharacteristic(Characteristic.Active).value).toBe(Characteristic.Active.INACTIVE);
  });

  it('updates the active identifier on a SOURCE event', async () => {
    await buildReady();
    device.emit(DEVICE_EVENTS.SOURCE, 'extInput:hdmi?port=1');
    expect(tvService().getCharacteristic(Characteristic.ActiveIdentifier).value).toBe(1);
  });

  it('ignores a SOURCE event for an unknown terminal', async () => {
    await buildReady();
    device.emit(DEVICE_EVENTS.SOURCE, 'extInput:hdmi?port=1');
    device.emit(DEVICE_EVENTS.SOURCE, 'extInput:unknown');
    expect(tvService().getCharacteristic(Characteristic.ActiveIdentifier).value).toBe(1);
  });
});

describe('HomeKit set handlers', () => {
  let sonyAccessory: SonyAudioAccessory;

  beforeEach(async () => {
    sonyAccessory = await buildReady();
  });

  const callbackPromise = () => {
    let resolve!: (err: unknown) => void;
    const promise = new Promise<unknown>(r => (resolve = r));
    const callback = ((err?: unknown) => resolve(err)) as unknown as CharacteristicSetCallback;
    return { promise, callback };
  };

  it('increments and decrements the volume', async () => {
    const inc = callbackPromise();
    sonyAccessory.setVolume(Characteristic.VolumeSelector.INCREMENT, inc.callback);
    await expect(inc.promise).resolves.toBeUndefined();
    expect(device.setVolume).toHaveBeenCalledWith(0);

    const dec = callbackPromise();
    sonyAccessory.setVolume(Characteristic.VolumeSelector.DECREMENT, dec.callback);
    await dec.promise;
    expect(device.setVolume).toHaveBeenLastCalledWith(1);
  });

  it('sets an absolute volume', async () => {
    const cb = callbackPromise();
    sonyAccessory.setVolumeAbsolute(42, cb.callback);
    await cb.promise;
    expect(device.setVolumeAbsolute).toHaveBeenCalledWith(42);
  });

  it('ignores a non numeric absolute volume', () => {
    const callback = jest.fn();
    sonyAccessory.setVolumeAbsolute('loud' as never, callback);
    expect(device.setVolumeAbsolute).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('mutes and unmutes', async () => {
    const on = callbackPromise();
    sonyAccessory.setMute(true, on.callback);
    await on.promise;
    expect(device.setMute).toHaveBeenCalledWith(true);

    const off = callbackPromise();
    sonyAccessory.setMute(0, off.callback);
    await off.promise;
    expect(device.setMute).toHaveBeenLastCalledWith(false);
  });

  it('powers the device on and off', async () => {
    const on = callbackPromise();
    sonyAccessory.setPower(Characteristic.Active.ACTIVE, on.callback);
    await on.promise;
    expect(device.setPower).toHaveBeenCalledWith(true);

    const off = callbackPromise();
    sonyAccessory.setPower(Characteristic.Active.INACTIVE, off.callback);
    await off.promise;
    expect(device.setPower).toHaveBeenLastCalledWith(false);
  });

  it('switches the input source', async () => {
    const cb = callbackPromise();
    sonyAccessory.setSource(1, cb.callback);
    await cb.promise;
    expect(device.setSource).toHaveBeenCalledWith(TERMINALS[1]);
  });

  it('ignores an unknown input source identifier', () => {
    const callback = jest.fn();
    sonyAccessory.setSource(99, callback);
    expect(device.setSource).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  const remoteKeys: [number, keyof FakeDevice][] = [
    [Characteristic.RemoteKey.ARROW_UP, 'setUp'],
    [Characteristic.RemoteKey.ARROW_DOWN, 'setDown'],
    [Characteristic.RemoteKey.ARROW_RIGHT, 'setRigth'],
    [Characteristic.RemoteKey.ARROW_LEFT, 'setLeft'],
    [Characteristic.RemoteKey.SELECT, 'setSelect'],
    [Characteristic.RemoteKey.BACK, 'setBack'],
    [Characteristic.RemoteKey.INFORMATION, 'setInformation'],
    [Characteristic.RemoteKey.PLAY_PAUSE, 'setPause'],
  ];

  it.each(remoteKeys)('remote key %s calls %s', async (key, method) => {
    const cb = callbackPromise();
    sonyAccessory.setRemoteKey(key, cb.callback);
    await cb.promise;
    expect(device[method]).toHaveBeenCalledTimes(1);
  });

  it('acknowledges an unhandled remote key without touching the device', async () => {
    const cb = callbackPromise();
    sonyAccessory.setRemoteKey(Characteristic.RemoteKey.EXIT, cb.callback);
    await expect(cb.promise).resolves.toBeUndefined();
    expect(device.setUp).not.toHaveBeenCalled();
  });

  it('reports device errors to HomeKit and re-initialises the accessory', async () => {
    const error = new Error('timeout of 5000ms exceeded');
    device.setPower = jest.fn(async () => {
      throw error;
    }) as any;
    const before = device.getPowerState.mock.calls.length;

    const cb = callbackPromise();
    sonyAccessory.setPower(Characteristic.Active.ACTIVE, cb.callback);

    await expect(cb.promise).resolves.toBe(error);
    expect(log.error).toHaveBeenCalledWith('Device HT Z9F: timeout of 5000ms exceeded');
    expect(device.getPowerState.mock.calls.length).toBeGreaterThan(before);
  });

  it('omits the device name from the error when it is unknown', async () => {
    device.systemInfo.name = '';
    const nameless = await buildReady();
    device.setMute = jest.fn(async () => {
      throw new Error('boom');
    }) as any;

    const cb = callbackPromise();
    nameless.setMute(true, cb.callback);
    await cb.promise;

    expect(log.error).toHaveBeenCalledWith('boom');
  });
});

describe('input source settings handlers', () => {
  let sonyAccessory: SonyAudioAccessory;
  let settings: any;

  beforeEach(async () => {
    sonyAccessory = await buildReady();
    settings = Settings.instances[0];
  });

  it('persists a renamed input under a HomeKit safe name', async () => {
    const input = inputServices()[0];
    const callback = jest.fn();

    sonyAccessory.setInputSourceConfiguredName(input, 'Kitchen: TV', callback);
    await flush();

    expect(settings.setInputName).toHaveBeenCalledWith(input.subtype, 'Kitchen TV');
    expect(callback).toHaveBeenCalledWith(null);
  });

  it('falls back to "Input" when the new name is unusable', async () => {
    const input = inputServices()[0];
    sonyAccessory.setInputSourceConfiguredName(input, '???', jest.fn());
    await flush();
    expect(settings.setInputName).toHaveBeenCalledWith(input.subtype, 'Input');
  });

  it('reports a settings failure while renaming', async () => {
    const error = new Error('disk full');
    settings.setInputName.mockRejectedValueOnce(error);
    const callback = jest.fn();

    sonyAccessory.setInputSourceConfiguredName(inputServices()[0], 'TV', callback);
    await flush();

    expect(callback).toHaveBeenCalledWith(error);
  });

  it('persists and mirrors the target visibility state', async () => {
    const input = inputServices()[0];
    const callback = jest.fn();

    sonyAccessory.setInputSourceTargetVisibilityState(input, Characteristic.TargetVisibilityState.HIDDEN, callback);
    await flush();

    expect(settings.setInputVisibility).toHaveBeenCalledWith(input.subtype, 1);
    expect(input.getCharacteristic(Characteristic.CurrentVisibilityState).value)
      .toBe(Characteristic.CurrentVisibilityState.HIDDEN);
    expect(callback).toHaveBeenCalledWith(null);
  });

  it('reports a settings failure while hiding an input', async () => {
    const error = new Error('read only fs');
    settings.setInputVisibility.mockRejectedValueOnce(error);
    const callback = jest.fn();

    sonyAccessory.setInputSourceTargetVisibilityState(inputServices()[0], 1, callback);
    await flush();

    expect(callback).toHaveBeenCalledWith(error);
  });

  it('reads the current visibility state from the settings', async () => {
    const input = inputServices()[0];
    settings.inputs.set(input.subtype!, { visibilityState: 1 });
    const callback = jest.fn();

    sonyAccessory.getInputSourceCurrentVisibilityState(input, callback);
    await flush();

    expect(callback).toHaveBeenCalledWith(null, 1);
  });

  it('reads the target visibility state from the settings', async () => {
    const input = inputServices()[0];
    settings.inputs.set(input.subtype!, { visibilityState: 1 });
    const callback = jest.fn();

    sonyAccessory.getInputSourceTargetVisibilityState(input, callback);
    await flush();

    expect(callback).toHaveBeenCalledWith(null, 1);
  });

  it('reports a settings failure while reading the visibility', async () => {
    const error = new Error('nope');
    settings.getInputVisibility.mockRejectedValueOnce(error);
    const callback = jest.fn();

    sonyAccessory.getInputSourceCurrentVisibilityState(inputServices()[0], callback);
    await flush();

    expect(callback).toHaveBeenCalledWith(error);
  });
});

describe('accessory wiring to hap characteristics', () => {
  it('forwards a HomeKit set on Active to the device', async () => {
    await buildReady();
    tvService().getCharacteristic(Characteristic.Active).setValue(Characteristic.Active.INACTIVE);
    await flush();
    expect(device.setPower).toHaveBeenCalledWith(false);
  });

  it('forwards a HomeKit set on ActiveIdentifier to the device', async () => {
    await buildReady();
    tvService().getCharacteristic(Characteristic.ActiveIdentifier).setValue(1);
    await flush();
    expect(device.setSource).toHaveBeenCalledWith(TERMINALS[1]);
  });

  it('forwards a HomeKit set on Mute to the device', async () => {
    await buildReady();
    speakerService().getCharacteristic(Characteristic.Mute).setValue(true);
    await flush();
    expect(device.setMute).toHaveBeenCalledWith(true);
  });

  it('forwards a HomeKit set on VolumeSelector to the device', async () => {
    await buildReady();
    speakerService().getCharacteristic(Characteristic.VolumeSelector)
      .setValue(Characteristic.VolumeSelector.DECREMENT);
    await flush();
    expect(device.setVolume).toHaveBeenCalledWith(1);
  });

  it('forwards a HomeKit set on RemoteKey to the device', async () => {
    await buildReady();
    tvService().getCharacteristic(Characteristic.RemoteKey).setValue(Characteristic.RemoteKey.SELECT);
    await flush();
    expect(device.setSelect).toHaveBeenCalledTimes(1);
  });

  it('sends the device the terminal of the selected input, not the identifier', async () => {
    await buildReady();
    const sonyDevice = device as unknown as SonyDevice;
    expect(sonyDevice).toBeDefined();

    tvService().getCharacteristic(Characteristic.ActiveIdentifier).setValue(0);
    await flush();
    expect(device.setSource).toHaveBeenCalledWith(TERMINALS[0]);
  });
});
