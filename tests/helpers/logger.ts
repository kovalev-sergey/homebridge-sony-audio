import { Logger } from 'homebridge';

export type MockLogger = Logger & {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
  log: jest.Mock;
};

/**
 * A Homebridge `Logger` implementation where every method is a jest mock,
 * so tests can assert on what the code under test logged.
 */
export function createMockLogger(): MockLogger {
  return {
    prefix: 'test',
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  } as unknown as MockLogger;
}
