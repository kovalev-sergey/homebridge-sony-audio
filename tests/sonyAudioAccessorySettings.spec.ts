// `fs-extra` exports non-configurable properties, so it cannot be spied on
// directly. Wrap the real implementation in a jest mock instead.
jest.mock('fs-extra', () => {
  const actual = jest.requireActual('fs-extra');
  return { ...actual, writeJson: jest.fn(actual.writeJson) };
});

import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { SonyAudioAccessorySettings } from '../src/sonyAudioAccessorySettings';
import { createMockLogger, MockLogger } from './helpers/logger';

const UUID = '0f5c1a2b-3d4e-5f60-7182-93a4b5c6d7e8';

describe('SonyAudioAccessorySettings', () => {
  let storagePath: string;
  let log: MockLogger;

  beforeEach(async () => {
    storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'sony-audio-settings-'));
    log = createMockLogger();
  });

  afterEach(async () => {
    await fs.remove(storagePath);
  });

  const persistFile = () =>
    path.join(storagePath, `SonyAudioAccessorySettings.${UUID.replace(/-/g, '').toUpperCase()}.json`);

  describe('GetInstance', () => {
    it('creates the storage directory when it does not exist', async () => {
      const missing = path.join(storagePath, 'nested', 'deep');
      await SonyAudioAccessorySettings.GetInstance(UUID, missing, log);
      expect(await fs.pathExists(missing)).toBe(true);
    });

    it('does not fail when there is no persisted file yet', async () => {
      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      expect(settings).toBeInstanceOf(SonyAudioAccessorySettings);
      expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('Settings not found at path'));
    });

    it('loads previously persisted inputs', async () => {
      await fs.writeJson(persistFile(), { inputs: [{ id: 'input-1', name: 'Chromecast', visibilityState: 1 }] });

      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      expect(await settings.getInputName('input-1', 'fallback')).toBe('Chromecast');
      expect(await settings.getInputVisibility('input-1', 0)).toBe(1);
    });

    it('survives a corrupted settings file', async () => {
      await fs.writeFile(persistFile(), '{not json');
      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      expect(settings).toBeInstanceOf(SonyAudioAccessorySettings);
      expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('An error occurred while loading the settings'));
    });

    it('derives the persist key from the uuid without dashes, uppercased', async () => {
      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      await settings.setInputName('input-1', 'TV');
      expect(await fs.pathExists(persistFile())).toBe(true);
    });
  });

  describe('input names', () => {
    it('persists the default name on first read', async () => {
      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      expect(await settings.getInputName('tv', 'TV')).toBe('TV');

      const stored = await fs.readJson(persistFile());
      expect(stored.inputs).toEqual([{ id: 'tv', name: 'TV' }]);
    });

    it('returns the stored name instead of the default on later reads', async () => {
      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      await settings.setInputName('tv', 'Television');
      await settings.setInputVisibility('tv', 0);
      expect(await settings.getInputName('tv', 'TV')).toBe('Television');
    });

    it('does not rewrite the file when the name is unchanged', async () => {
      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      await settings.setInputName('tv', 'TV');
      (fs.writeJson as unknown as jest.Mock).mockClear();
      await settings.setInputName('tv', 'TV');
      expect(fs.writeJson).not.toHaveBeenCalled();
    });

    it('updates an existing input in place', async () => {
      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      await settings.setInputName('tv', 'TV');
      await settings.setInputName('tv', 'Telly');

      const stored = await fs.readJson(persistFile());
      expect(stored.inputs).toHaveLength(1);
      expect(stored.inputs[0]).toMatchObject({ id: 'tv', name: 'Telly' });
    });
  });

  describe('input visibility', () => {
    it('persists the default visibility on first read', async () => {
      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      expect(await settings.getInputVisibility('hdmi1', 0)).toBe(0);

      const stored = await fs.readJson(persistFile());
      expect(stored.inputs).toEqual([{ id: 'hdmi1', visibilityState: 0 }]);
    });

    it('returns the stored visibility on later reads', async () => {
      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      await settings.setInputVisibility('hdmi1', 1);
      expect(await settings.getInputVisibility('hdmi1', 0)).toBe(1);
    });

    it('does not rewrite the file when the visibility is unchanged', async () => {
      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      await settings.setInputVisibility('hdmi1', 1);
      (fs.writeJson as unknown as jest.Mock).mockClear();
      await settings.setInputVisibility('hdmi1', 1);
      expect(fs.writeJson).not.toHaveBeenCalled();
    });

    it('keeps names and visibility of the same input together', async () => {
      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      await settings.setInputName('hdmi1', 'BD player');
      await settings.setInputVisibility('hdmi1', 1);

      const stored = await fs.readJson(persistFile());
      expect(stored.inputs).toEqual([{ id: 'hdmi1', name: 'BD player', visibilityState: 1 }]);
    });

    it('keeps different inputs separate', async () => {
      const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
      await settings.setInputName('a', 'A');
      await settings.setInputName('b', 'B');

      const stored = await fs.readJson(persistFile());
      expect(stored.inputs.map((i: { id: string }) => i.id)).toEqual(['a', 'b']);
    });
  });

  it('round-trips settings across instances', async () => {
    const first = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
    await first.setInputName('tv', 'Kitchen TV');
    await first.setInputVisibility('tv', 1);

    const second = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
    expect(await second.getInputName('tv', 'TV')).toBe('Kitchen TV');
    expect(await second.getInputVisibility('tv', 0)).toBe(1);
  });

  it('logs but does not throw when saving fails', async () => {
    const settings = await SonyAudioAccessorySettings.GetInstance(UUID, storagePath, log);
    (fs.writeJson as unknown as jest.Mock).mockRejectedValueOnce(new Error('EACCES'));

    await expect(settings.setInputName('tv', 'TV')).resolves.toMatchObject({ id: 'tv', name: 'TV' });
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('An error occurred while saving the settings'));
  });
});
