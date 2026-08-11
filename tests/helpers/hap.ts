/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
/**
 * Version agnostic access to the HAP implementation shipped with Homebridge.
 *
 * Homebridge 2.x depends on the scoped fork `@homebridge/hap-nodejs`, while
 * Homebridge 1.x still depends on the unscoped `hap-nodejs`. The tests exercise
 * real HAP services, so they resolve whichever package is installed.
 */
function loadHap(): any {
  try {
    return require('@homebridge/hap-nodejs');
  } catch {
    return require('hap-nodejs');
  }
}

const hap = loadHap();

export const Service: any = hap.Service;
export const Characteristic: any = hap.Characteristic;
export const uuid: { generate(data: string): string } = hap.uuid;
