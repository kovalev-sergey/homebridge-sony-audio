/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Canonical API fixtures used by the SonyDevice / Discoverer tests.
 * They mirror real answers of a HT-Z9F / STR-DN1080 style device.
 */

export const interfaceInformation = {
  result: [
    {
      productCategory: 'homeTheaterSystem',
      interfaceVersion: '1.0',
      modelName: 'HT-Z9F',
      productName: 'Sony Audio',
      serverName: '',
    },
  ],
  id: 33,
};

export const apisInfo = [
  {
    service: 'system',
    protocols: ['websocket:jsonizer', 'xhrpost:jsonizer'],
    apis: [
      { name: 'getSystemInformation', versions: [{ authLevel: '', protocols: '', version: '1.4' }] },
      { name: 'getPowerStatus', versions: [{ authLevel: '', protocols: '', version: '1.1' }] },
      { name: 'getInterfaceInformation', versions: [{ authLevel: '', protocols: '', version: '1.0' }] },
    ],
    notifications: [
      { name: 'notifyPowerStatus', versions: [{ authLevel: '', version: '1.0' }] },
    ],
  },
  {
    service: 'audio',
    protocols: ['websocket:jsonizer', 'xhrpost:jsonizer'],
    apis: [
      { name: 'getVolumeInformation', versions: [{ authLevel: '', protocols: '', version: '1.1' }] },
      { name: 'setAudioVolume', versions: [{ authLevel: '', protocols: '', version: '1.1' }] },
    ],
    notifications: [
      { name: 'notifyVolumeInformation', versions: [{ authLevel: '', version: '1.0' }] },
    ],
  },
  {
    service: 'avContent',
    protocols: ['websocket:jsonizer', 'xhrpost:jsonizer'],
    apis: [
      { name: 'getCurrentExternalTerminalsStatus', versions: [{ authLevel: '', protocols: '', version: '1.0' }] },
      { name: 'getSchemeList', versions: [{ authLevel: '', protocols: '', version: '1.0' }] },
    ],
    notifications: [
      { name: 'notifyExternalTerminalStatus', versions: [{ authLevel: '', version: '1.0' }] },
      { name: 'notifyPlayingContentInfo', versions: [{ authLevel: '', version: '1.0' }] },
    ],
  },
];

export const systemInformation = {
  product: 'HT',
  region: 'RUS',
  language: 'rus',
  model: 'HT-Z9F',
  serial: 'SERIAL-123',
  macAddr: 'aa:bb:cc:dd:ee:ff',
  name: '',
  generation: '1.0.0',
  area: 'RUS',
  cid: '',
  wirelessMacAddr: '11:22:33:44:55:66',
};

export const externalTerminals = [
  {
    active: 'active',
    connection: 'connected',
    iconUrl: '',
    label: 'TV',
    meta: 'meta:tv',
    outputs: [],
    title: 'TV',
    uri: 'extInput:tv',
  },
  {
    connection: 'connected',
    iconUrl: '',
    label: 'BD player',
    meta: 'meta:hdmi',
    title: 'HDMI 1',
    uri: 'extInput:hdmi?port=1',
  },
  {
    active: 'active',
    connection: 'connected',
    label: 'Main zone',
    meta: 'meta:zone:output',
    title: 'Main',
    uri: 'extOutput:zone?zone=1',
  },
];

export const schemeList = [
  { scheme: 'extInput' },
  { scheme: 'radio' },
  { scheme: 'storage' },
];

export const volumeInformation = [
  {
    output: 'extOutput:zone?zone=1',
    volume: 20,
    mute: 'off',
    maxVolume: 50,
    minVolume: 0,
    step: 1,
  },
  {
    output: 'extOutput:zone?zone=2',
    volume: 5,
    mute: 'on',
    maxVolume: 50,
    minVolume: 0,
    step: 1,
  },
];

/**
 * A route table used by the mocked axios instance: keyed by the JSON-RPC
 * `method` of the outgoing request.
 */
export function defaultRoutes(): Record<string, any> {
  return {
    getInterfaceInformation: interfaceInformation,
    getSupportedApiInfo: { result: [apisInfo], id: 5 },
    getSystemInformation: { result: [systemInformation], id: 33 },
    getCurrentExternalTerminalsStatus: { result: [externalTerminals], id: 99 },
    getSchemeList: { result: [schemeList], id: 1 },
    getVolumeInformation: { result: [volumeInformation], id: 33 },
    getPowerStatus: { result: [{ status: 'active' }], id: 50 },
    getPlayingContentInfo: {
      result: [[{ output: 'extOutput:zone?zone=1', source: 'extInput:tv', uri: 'extInput:tv' }]],
      id: 37,
    },
    setAudioVolume: { result: [], id: 98 },
    setPowerStatus: { result: [], id: 55 },
    setAudioMute: { result: [], id: 601 },
    setPlayContent: { result: [], id: 47 },
    pausePlayingContent: { result: [], id: 31 },
  };
}
