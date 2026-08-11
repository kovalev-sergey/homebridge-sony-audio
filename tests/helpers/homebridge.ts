/* eslint-disable @typescript-eslint/no-explicit-any */
import { Service, Characteristic, uuid } from './hap';
import type { API, PlatformAccessory, WithUUID, Service as HapService } from 'homebridge';

/**
 * A minimal stand-in for Homebridge's `PlatformAccessory` backed by real
 * hap-nodejs services, so characteristic behaviour is exercised for real.
 */
export class FakePlatformAccessory {
  public services: HapService[] = [];
  public context: any = {};
  public reachable = true;

  constructor(
    public displayName: string,
    public UUID: string,
    public category?: number,
  ) {
    this.services.push(new Service.AccessoryInformation('', ''));
  }

  getService(target: string | WithUUID<typeof HapService>): HapService | undefined {
    if (typeof target === 'string') {
      return this.services.find(s => s.displayName === target);
    }
    return this.services.find(s => s.UUID === (target as unknown as { UUID: string }).UUID);
  }

  getServiceById(target: WithUUID<typeof HapService>, subtype: string): HapService | undefined {
    return this.services.find(
      s => s.UUID === (target as unknown as { UUID: string }).UUID && s.subtype === subtype,
    );
  }

  addService(target: any, ...args: unknown[]): HapService {
    const service = typeof target === 'function' ? new target(...args) : target;
    this.services.push(service);
    return service;
  }

  removeService(service: HapService) {
    this.services = this.services.filter(s => s !== service);
  }
}

export type MockApi = API & {
  on: jest.Mock;
  emit: (event: string) => void;
  updatePlatformAccessories: jest.Mock;
  registerPlatformAccessories: jest.Mock;
  unregisterPlatformAccessories: jest.Mock;
  publishExternalAccessories: jest.Mock;
  registerPlatform: jest.Mock;
};

/**
 * Builds a fake Homebridge `API` object. Handlers registered through `on()`
 * can be triggered with `api.emit('didFinishLaunching')`.
 */
export function createMockApi(persistPath = '/tmp/homebridge-sony-audio-tests'): MockApi {
  const handlers = new Map<string, (() => void)[]>();

  const api = {
    version: 2.7,
    serverVersion: '1.6.0',
    hap: { Service, Characteristic, uuid },
    platformAccessory: FakePlatformAccessory,
    user: { persistPath: () => persistPath, storagePath: () => persistPath },
    on: jest.fn((event: string, handler: () => void) => {
      handlers.set(event, [...(handlers.get(event) || []), handler]);
      return api;
    }),
    emit: (event: string) => (handlers.get(event) || []).forEach(handler => handler()),
    registerPlatform: jest.fn(),
    registerAccessory: jest.fn(),
    registerPlatformAccessories: jest.fn(),
    updatePlatformAccessories: jest.fn(),
    unregisterPlatformAccessories: jest.fn(),
    publishExternalAccessories: jest.fn(),
  } as unknown as MockApi;

  return api;
}

export const asPlatformAccessory = (accessory: FakePlatformAccessory) =>
  accessory as unknown as PlatformAccessory<any>;
