import {
  ApiRequestSupportedApiInfo,
  ApiRequestSystemInformationv1_4,
  ApiRequestSystemInformationv1_6,
  ApiRequestCurrentExternalTerminalsStatusv1_0,
  ApiRequestCurrentExternalTerminalsStatusv1_2,
  ApiRequestVolumeInformation,
  ApiRequestGetPowerStatus,
  ApiRequestGetSchemeList,
  ApiRequestGetInterfaceInformation,
  GenericApiError,
  UnsupportedVersionApiError,
  IncompatibleDeviceCategoryError,
} from '../src/api';

describe('api request constants', () => {
  const requests: [string, { id: number; method: string; version: string; params: unknown[] }][] = [
    ['getSupportedApiInfo', ApiRequestSupportedApiInfo],
    ['getSystemInformation v1.4', ApiRequestSystemInformationv1_4],
    ['getSystemInformation v1.6', ApiRequestSystemInformationv1_6],
    ['getCurrentExternalTerminalsStatus v1.0', ApiRequestCurrentExternalTerminalsStatusv1_0],
    ['getCurrentExternalTerminalsStatus v1.2', ApiRequestCurrentExternalTerminalsStatusv1_2],
    ['getVolumeInformation', ApiRequestVolumeInformation],
    ['getPowerStatus', ApiRequestGetPowerStatus],
    ['getSchemeList', ApiRequestGetSchemeList],
    ['getInterfaceInformation', ApiRequestGetInterfaceInformation],
  ];

  it.each(requests)('%s is a well formed JSON-RPC payload', (_name, request) => {
    expect(typeof request.id).toBe('number');
    expect(typeof request.method).toBe('string');
    expect(request.method.length).toBeGreaterThan(0);
    expect(request.version).toMatch(/^\d+\.\d+$/);
    expect(Array.isArray(request.params)).toBe(true);
    expect(() => JSON.stringify(request)).not.toThrow();
  });

  it('declares the expected api versions', () => {
    expect(ApiRequestSystemInformationv1_4.version).toBe('1.4');
    expect(ApiRequestSystemInformationv1_6.version).toBe('1.6');
    expect(ApiRequestCurrentExternalTerminalsStatusv1_0.version).toBe('1.0');
    expect(ApiRequestCurrentExternalTerminalsStatusv1_2.version).toBe('1.2');
  });

  it('uses the same method name for both getSystemInformation versions', () => {
    expect(ApiRequestSystemInformationv1_4.method).toBe('getSystemInformation');
    expect(ApiRequestSystemInformationv1_6.method).toBe('getSystemInformation');
    expect(ApiRequestCurrentExternalTerminalsStatusv1_0.method).toBe('getCurrentExternalTerminalsStatus');
    expect(ApiRequestCurrentExternalTerminalsStatusv1_2.method).toBe('getCurrentExternalTerminalsStatus');
  });
});

describe('api errors', () => {
  it('GenericApiError carries a name, message and code', () => {
    const err = new GenericApiError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('boom');
    expect(err.name).toBe('GENERIC_API_ERROR');
    expect(err.code).toBe(1);
    expect(err.stack).toBeDefined();
  });

  it('UnsupportedVersionApiError extends GenericApiError', () => {
    const err = new UnsupportedVersionApiError('old api');
    expect(err).toBeInstanceOf(GenericApiError);
    expect(err).toBeInstanceOf(UnsupportedVersionApiError);
    expect(err.message).toBe('old api');
    expect(err.name).toBe('UNSUPPORTED_VERSION_API');
    expect(err.code).toBe(14);
  });

  it('IncompatibleDeviceCategoryError is recognisable via instanceof', () => {
    const err = new IncompatibleDeviceCategoryError('tv is not supported');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(IncompatibleDeviceCategoryError);
    expect(err).not.toBeInstanceOf(GenericApiError);
    expect(err.name).toBe('INCOMPATIBLE_DEVICE_CATEGORY');
    expect(err.message).toBe('tv is not supported');
  });
});
