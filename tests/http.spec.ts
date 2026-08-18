/* eslint-disable @typescript-eslint/no-explicit-any */
import * as http from 'http';
import { AddressInfo } from 'net';
import { createHttpClient, httpGet, HttpError, buildFullPath } from '../src/http';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;

let server: http.Server;
let baseOrigin: string;
let handler: Handler;
/** Everything the server received, so the tests can assert on the wire format. */
let received: { method: string; url: string; headers: http.IncomingHttpHeaders; body: string }[];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      received.push({ method: req.method!, url: req.url!, headers: req.headers, body });
      handler(req, res, body);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  baseOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

beforeEach(() => {
  received = [];
  handler = (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ result: [{ ok: true }] }));
  };
});

describe('buildFullPath', () => {
  it('joins a base url and a path without doubling slashes', () => {
    expect(buildFullPath('http://host:10000/sony', '/system')).toBe('http://host:10000/sony/system');
    expect(buildFullPath('http://host:10000/sony/', '/system')).toBe('http://host:10000/sony/system');
  });

  it('returns the base url untouched for an empty path (the SOAP/IRCC endpoint)', () => {
    expect(buildFullPath('http://host:52323/upnp/control/IRCC', '')).toBe('http://host:52323/upnp/control/IRCC');
  });

  it('keeps an absolute url even when a base url is set', () => {
    expect(buildFullPath('http://host/sony', 'http://other/desc.xml')).toBe('http://other/desc.xml');
  });

  it('works without a base url', () => {
    expect(buildFullPath(undefined, 'http://host/desc.xml')).toBe('http://host/desc.xml');
  });
});

describe('HttpClient.post', () => {
  it('posts to baseURL + path and parses a JSON answer', async () => {
    const client = createHttpClient({ baseURL: `${baseOrigin}/sony` });
    const res = await client.post('/system', JSON.stringify({ method: 'getPowerStatus' }));

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ result: [{ ok: true }] });
    expect(received[0].method).toBe('POST');
    expect(received[0].url).toBe('/sony/system');
    expect(received[0].body).toBe('{"method":"getPowerStatus"}');
  });

  it('sends the configured headers and a correct Content-Length', async () => {
    const client = createHttpClient({
      baseURL: `${baseOrigin}/upnp/control/IRCC`,
      headers: {
        'SOAPACTION': '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
        'Content-Type': 'text/xml; charset="utf-8"',
      },
    });
    await client.post('', '<Envelope/>');

    expect(received[0].url).toBe('/upnp/control/IRCC');
    expect(received[0].headers['soapaction']).toBe('"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"');
    expect(received[0].headers['content-type']).toBe('text/xml; charset="utf-8"');
    expect(received[0].headers['content-length']).toBe('11');
  });

  it('parses JSON even when the device declares a non-JSON content type', async () => {
    handler = (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(JSON.stringify({ result: [1] }));
    };
    const client = createHttpClient({ baseURL: baseOrigin });

    await expect(client.post('/x', '{}')).resolves.toMatchObject({ data: { result: [1] } });
  });

  it('leaves a non-JSON body as text', async () => {
    handler = (_req, res) => res.end('<s:Envelope/>');
    const client = createHttpClient({ baseURL: baseOrigin });

    await expect(client.post('/x', '{}')).resolves.toMatchObject({ data: '<s:Envelope/>' });
  });

  it('resolves with an empty body', async () => {
    handler = (_req, res) => res.end();
    const client = createHttpClient({ baseURL: baseOrigin });

    await expect(client.post('/x', '{}')).resolves.toMatchObject({ data: '' });
  });

  it('rejects a non-2xx answer', async () => {
    handler = (_req, res) => {
      res.statusCode = 500;
      res.end('nope');
    };
    const client = createHttpClient({ baseURL: baseOrigin });

    await expect(client.post('/x', '{}')).rejects.toMatchObject({
      name: 'HttpError',
      message: 'Request failed with status code 500',
      status: 500,
    });
  });

  it('rejects when the host refuses the connection, keeping the system error code', async () => {
    // Port 1 is reserved and nothing listens on it.
    const client = createHttpClient({ baseURL: 'http://127.0.0.1:1' });

    const err = await client.post('/x', '{}').catch(e => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.code).toBe('ECONNREFUSED');
  });

  it('times out a device that never answers', async () => {
    handler = () => undefined; // never responds
    const client = createHttpClient({ baseURL: baseOrigin, timeout: 100 });

    const err = await client.post('/x', '{}').catch(e => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.message).toBe('timeout of 100ms exceeded');
    expect(err.code).toBe('ECONNABORTED');
  });

  it('waits indefinitely when the timeout is 0', async () => {
    let release: () => void = () => undefined;
    handler = (_req, res) => {
      release = () => res.end(JSON.stringify({ result: [] }));
    };
    const client = createHttpClient({ baseURL: baseOrigin, timeout: 0 });

    const pending = client.post('/x', '{}');
    await new Promise(resolve => setTimeout(resolve, 300));
    release();

    await expect(pending).resolves.toMatchObject({ data: { result: [] } });
  });

  it('calls the onRequest and onResponse hooks', async () => {
    const onRequest = jest.fn();
    const onResponse = jest.fn((res: any) => res);
    const client = createHttpClient({ baseURL: baseOrigin, onRequest, onResponse });

    await client.post('/x', '{"method":"m"}');

    expect(onRequest).toHaveBeenCalledWith({ baseURL: baseOrigin, data: '{"method":"m"}' });
    expect(onResponse).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('propagates a rejection from the onResponse hook', async () => {
    const client = createHttpClient({
      baseURL: baseOrigin,
      onResponse: () => Promise.reject(new Error('api error')),
    });

    await expect(client.post('/x', '{}')).rejects.toThrow('api error');
  });
});

describe('httpGet', () => {
  it('fetches a body and leaves XML as text', async () => {
    handler = (_req, res) => {
      res.setHeader('Content-Type', 'text/xml');
      res.end('<root><device/></root>');
    };

    await expect(httpGet(`${baseOrigin}/dmr.xml`)).resolves.toMatchObject({ data: '<root><device/></root>' });
    expect(received[0].method).toBe('GET');
  });

  it('follows a redirect', async () => {
    handler = (req, res) => {
      if (req.url === '/dmr.xml') {
        res.statusCode = 302;
        res.setHeader('Location', '/moved.xml');
        res.end();
        return;
      }
      res.end('<root/>');
    };

    await expect(httpGet(`${baseOrigin}/dmr.xml`)).resolves.toMatchObject({ data: '<root/>' });
    expect(received.map(r => r.url)).toEqual(['/dmr.xml', '/moved.xml']);
  });

  it('rejects an invalid url instead of throwing synchronously', async () => {
    await expect(httpGet('not a url')).rejects.toMatchObject({ code: 'ERR_INVALID_URL' });
  });
});
