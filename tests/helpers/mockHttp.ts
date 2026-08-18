/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HttpClientOptions, HttpResponse } from '../../src/http';

export type PostCall = { url: string; body: any };

export type MockHttpClient = {
  post: jest.Mock;
  /** The options the client was constructed with (baseURL, headers, timeout, hooks). */
  options: HttpClientOptions;
  /** All POSTs performed through this client, with parsed bodies. */
  calls: PostCall[];
  /** Body of the last POST whose JSON-RPC `method` matches. */
  lastCall(method: string): any;
};

/**
 * Builds a fake `HttpClient` that answers POSTs based on a route table keyed by
 * the JSON-RPC `method` of the request body.
 *
 * A route value may be a plain object (returned as `response.data`), or a
 * function receiving the parsed body. Throwing/rejecting functions are used
 * to simulate device errors.
 *
 * The `onRequest`/`onResponse` hooks the real client is configured with are
 * applied here too, so the logging and the API-error mapping they perform are
 * covered by the tests rather than stubbed out.
 */
export function createMockHttpClient(
  routes: Record<string, any> = {},
  options: HttpClientOptions = {},
): MockHttpClient {
  const calls: PostCall[] = [];

  const respond = async (url: string, data?: string): Promise<HttpResponse> => {
    let body: any = {};
    try {
      body = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      body = { raw: data };
    }
    calls.push({ url, body });
    if (!body || typeof body.method !== 'string') {
      // e.g. the SOAP/IRCC endpoint, which posts an XML envelope
      return { data: '', status: 200, headers: {} };
    }
    const route = routes[body.method];
    if (route === undefined) {
      throw new Error(`No mocked route for method "${body.method}" at ${url}`);
    }
    const value = typeof route === 'function' ? await route(body) : route;
    return { data: value, status: 200, headers: {} };
  };

  const client: MockHttpClient = {
    calls,
    options,
    post: jest.fn(async (url: string, data?: string) => {
      if (options.onRequest) {
        options.onRequest({ baseURL: options.baseURL, data });
      }
      const response = await respond(url, data);
      return options.onResponse ? options.onResponse(response) : response;
    }),
    lastCall(method: string) {
      const found = [...calls].reverse().find(c => c.body?.method === method);
      return found?.body;
    },
  };

  return client;
}
