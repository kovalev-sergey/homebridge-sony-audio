/* eslint-disable @typescript-eslint/no-explicit-any */
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

/**
 * A minimal HTTP client built on the Node.js `http`/`https` modules.
 *
 * It intentionally reproduces the small subset of `axios` behaviour this plugin
 * relied on, so that swapping the transport does not change what the devices see:
 * - `baseURL` + path joining follows the same rules as `axios` (`combineURLs`);
 * - a response body that looks like JSON is parsed, anything else is left as text;
 * - a non-2xx status rejects with `Request failed with status code <status>`;
 * - `timeout: 0` means "wait forever", which some devices need while powering on.
 */

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  headers: http.IncomingHttpHeaders;
}

/**
 * The error thrown for any failed request.
 * `code` carries the underlying system error (`ECONNREFUSED`, `ETIMEDOUT`, ...) when
 * there is one, so callers can tell different network faults apart.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface HttpClientOptions {
  baseURL?: string;
  headers?: Record<string, string>;
  /** Milliseconds to wait for a response. `0` disables the timeout. */
  timeout?: number;
  /** Called before the request goes out. Used for debug logging. */
  onRequest?: (request: { baseURL?: string; data?: string }) => void;
  /** Called with a successful response. May reject to turn it into an error. */
  onResponse?: (response: HttpResponse) => HttpResponse | Promise<HttpResponse>;
}

/** Matches `axios`'s `isAbsoluteURL`. */
function isAbsoluteURL(url: string): boolean {
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
}

/** Matches `axios`'s `combineURLs`: an empty relative url yields the base url unchanged. */
function combineURLs(baseURL: string, relativeURL: string): string {
  return relativeURL
    ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
    : baseURL;
}

export function buildFullPath(baseURL: string | undefined, requestedURL: string): string {
  if (baseURL && !isAbsoluteURL(requestedURL)) {
    return combineURLs(baseURL, requestedURL);
  }
  return requestedURL;
}

/**
 * Parses a response body the way `axios`'s default `transformResponse` does:
 * attempt `JSON.parse`, and silently keep the raw text when it is not JSON.
 * Devices are known to return JSON under a non-JSON `Content-Type`, so the
 * declared content type is deliberately ignored.
 */
function parseBody(body: string): any {
  const trimmed = body.trim();
  if (trimmed === '') {
    return body;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return body;
  }
}

interface RawRequestOptions {
  method: 'GET' | 'POST';
  url: string;
  body?: string;
  headers?: Record<string, string>;
  timeout?: number;
  /** Number of redirects still allowed to be followed (GET only). */
  redirects?: number;
}

function rawRequest(options: RawRequestOptions): Promise<HttpResponse> {
  const { method, url, body, headers = {}, timeout = 0, redirects = 5 } = options;

  return new Promise<HttpResponse>((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      reject(new HttpError(`Invalid url: ${url}`, 'ERR_INVALID_URL'));
      return;
    }

    const transport = target.protocol === 'https:' ? https : http;
    const requestHeaders: Record<string, string> = {
      // `axios` sends this by default and devices are known to work with it.
      'Accept': 'application/json, text/plain, */*',
      ...headers,
    };
    if (body !== undefined) {
      requestHeaders['Content-Length'] = String(Buffer.byteLength(body));
    }

    const request = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method,
        headers: requestHeaders,
      },
      (response) => {
        const status = response.statusCode ?? 0;

        // Follow redirects for GET, as `axios` did through `follow-redirects`.
        const location = response.headers.location;
        if (method === 'GET' && status >= 300 && status < 400 && location && redirects > 0) {
          response.resume(); // discard the body
          resolve(rawRequest({ ...options, url: new URL(location, target).href, redirects: redirects - 1 }));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', (err: NodeJS.ErrnoException) => {
          reject(new HttpError(err.message, err.code, status));
        });
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (status < 200 || status > 299) {
            reject(new HttpError(`Request failed with status code ${status}`, undefined, status));
            return;
          }
          resolve({ data: parseBody(text), status, headers: response.headers });
        });
      },
    );

    if (timeout > 0) {
      request.setTimeout(timeout, () => {
        request.destroy(new HttpError(`timeout of ${timeout}ms exceeded`, 'ECONNABORTED'));
      });
    }

    request.on('error', (err: NodeJS.ErrnoException) => {
      reject(err instanceof HttpError ? err : new HttpError(err.message, err.code));
    });

    request.end(body);
  });
}

/**
 * A configured client for one device endpoint.
 */
export class HttpClient {
  constructor(private readonly options: HttpClientOptions = {}) {}

  public async post(path: string, data?: string): Promise<HttpResponse> {
    const { baseURL, headers, timeout, onRequest, onResponse } = this.options;
    if (onRequest) {
      onRequest({ baseURL, data });
    }
    const response = await rawRequest({
      method: 'POST',
      url: buildFullPath(baseURL, path),
      body: data,
      headers,
      timeout,
    });
    return onResponse ? onResponse(response) : response;
  }

}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  return new HttpClient(options);
}

/**
 * A one-off GET, used to fetch UPnP device descriptions during discovery.
 */
export function httpGet(url: string, timeout = 0): Promise<HttpResponse> {
  return rawRequest({ method: 'GET', url, timeout });
}
