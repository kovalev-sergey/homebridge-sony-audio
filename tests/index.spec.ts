import { API } from 'homebridge';
import { PLATFORM_NAME } from '../src/settings';
import { SonyAudioHomebridgePlatform } from '../src/platform';
import { createMockApi } from './helpers/homebridge';

describe('plugin entry point', () => {
  it('registers the platform under the documented alias', () => {
    const api = createMockApi();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const register = require('../src/index') as (api: API) => void;

    register(api);

    expect(api.registerPlatform).toHaveBeenCalledWith(PLATFORM_NAME, SonyAudioHomebridgePlatform);
    expect(PLATFORM_NAME).toBe('SonyAudio');
  });

  it('uses the package name as plugin name', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../package.json');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PLUGIN_NAME } = require('../src/settings');
    expect(PLUGIN_NAME).toBe(pkg.name);
  });

  it('matches the platform alias declared in config.schema.json', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schema = require('../config.schema.json');
    expect(schema.pluginAlias).toBe(PLATFORM_NAME);
    expect(schema.singular).toBe(true);
  });
});
