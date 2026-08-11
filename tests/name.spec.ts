import { getHomeKitName } from '../src/name';

describe('getHomeKitName', () => {
  it('keeps already valid names untouched', () => {
    expect(getHomeKitName('Living Room')).toBe('Living Room');
    expect(getHomeKitName("Sergey's Sony")).toBe("Sergey's Sony");
    expect(getHomeKitName('HT Z9F 2')).toBe('HT Z9F 2');
  });

  it('replaces unsupported punctuation with a space', () => {
    expect(getHomeKitName('HT-Z9F')).toBe('HT Z9F');
    expect(getHomeKitName('extInput:hdmi?port=1')).toBe('extInput hdmi port 1');
  });

  it('collapses repeated whitespace', () => {
    expect(getHomeKitName('Sony    Audio')).toBe('Sony Audio');
    expect(getHomeKitName('Sony\t\nAudio')).toBe('Sony Audio');
  });

  it('trims non alphanumeric boundaries', () => {
    expect(getHomeKitName('  Sony Audio  ')).toBe('Sony Audio');
    expect(getHomeKitName('***Sony Audio***')).toBe('Sony Audio');
    expect(getHomeKitName("'Sony'")).toBe('Sony');
  });

  it('falls back when the name is empty or fully sanitized away', () => {
    expect(getHomeKitName('')).toBe('Sony Audio');
    expect(getHomeKitName(undefined)).toBe('Sony Audio');
    expect(getHomeKitName('***')).toBe('Sony Audio');
    expect(getHomeKitName('   ')).toBe('Sony Audio');
  });

  it('uses the provided fallback when given', () => {
    expect(getHomeKitName('', 'Input 3')).toBe('Input 3');
    expect(getHomeKitName(':::', 'extInput:tv')).toBe('extInput tv');
  });

  it('falls back to the default name when the fallback is invalid too', () => {
    expect(getHomeKitName('', '???')).toBe('Sony Audio');
    expect(getHomeKitName(undefined, '')).toBe('Sony Audio');
  });

  it('always returns a HomeKit-acceptable name', () => {
    const samples = ['', '-', '???', 'a', 'ドルビー', 'dlna:music', '  x  '];
    for (const sample of samples) {
      const result = getHomeKitName(sample);
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[A-Za-z0-9].*[A-Za-z0-9]$|^[A-Za-z0-9]$/);
      expect(result).not.toMatch(/[^A-Za-z0-9 ']/);
    }
  });
});
