/* eslint-disable @typescript-eslint/no-explicit-any */

export type PostCall = { url: string; body: any };

export type MockAxiosInstance = {
  post: jest.Mock;
  get: jest.Mock;
  defaults: any;
  interceptors: {
    request: { use: jest.Mock };
    response: { use: jest.Mock };
  };
  /** All POSTs performed through this instance, with parsed bodies. */
  calls: PostCall[];
  /** Body of the last POST whose JSON-RPC `method` matches. */
  lastCall(method: string): any;
};

/**
 * Builds a fake axios instance that answers POSTs based on a route table
 * keyed by the JSON-RPC `method` of the request body.
 *
 * A route value may be a plain object (returned as `response.data`), or a
 * function receiving the parsed body. Throwing/rejecting functions are used
 * to simulate device errors.
 */
export function createMockAxiosInstance(routes: Record<string, any> = {}): MockAxiosInstance {
  const calls: PostCall[] = [];

  const instance: MockAxiosInstance = {
    calls,
    defaults: { headers: {} },
    get: jest.fn(),
    post: jest.fn(async (url: string, data?: string) => {
      let body: any = {};
      try {
        body = typeof data === 'string' ? JSON.parse(data) : data;
      } catch {
        body = { raw: data };
      }
      calls.push({ url, body });
      if (!body || typeof body.method !== 'string') {
        // e.g. the SOAP/IRCC endpoint, which posts an XML envelope
        return { data: '', status: 200, statusText: 'OK', headers: {}, config: {} };
      }
      const route = routes[body.method];
      if (route === undefined) {
        throw new Error(`No mocked route for method "${body.method}" at ${url}`);
      }
      const value = typeof route === 'function' ? await route(body) : route;
      return { data: value, status: 200, statusText: 'OK', headers: {}, config: {} };
    }),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    lastCall(method: string) {
      const found = [...calls].reverse().find(c => c.body?.method === method);
      return found?.body;
    },
  };

  return instance;
}
