/* eslint-disable no-console */
/**
 * Manual helper: pretends to be a Sony device on the LAN.
 *
 * Run it with `npx ts-node tests/ssdp-server.ts` on the same network as the
 * machine running Homebridge (or in another terminal on the same machine) to
 * exercise discovery end to end without real hardware:
 * it answers M-SEARCH requests for `urn:schemas-sony-com:service:ScalarWebAPI:1`
 * and serves a minimal UPnP device description over HTTP.
 *
 * It is not part of the jest run.
 */
import * as dgram from 'dgram';
import * as http from 'http';
import * as os from 'os';

const SSDP_IP = '239.255.255.250';
const SSDP_PORT = 1900;
const SEARCH_TARGET = 'urn:schemas-sony-com:service:ScalarWebAPI:1';
const UDN = 'uuid:00000000-0000-1010-8000-aabbccddeeff';
const HTTP_PORT = 64321;

/** First external IPv4 address, used in the advertised LOCATION. */
function localAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name] ?? []) {
      const isIPv4 = info.family === 'IPv4' || (info.family as unknown as number) === 4;
      if (!info.internal && isIPv4) {
        return info.address;
      }
    }
  }
  return '127.0.0.1';
}

const address = localAddress();
const location = `http://${address}:${HTTP_PORT}/dmr.xml`;

const description = `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0" xmlns:av="urn:schemas-sony-com:av">
  <device>
    <friendlyName>Fake Sony Device</friendlyName>
    <manufacturer>Sony Corporation</manufacturer>
    <modelName>HT-FAKE</modelName>
    <UDN>${UDN}</UDN>
    <serviceList>
      <service>
        <serviceId>urn:schemas-sony-com:serviceId:IRCC</serviceId>
        <controlURL>/upnp/control/IRCC</controlURL>
      </service>
    </serviceList>
    <av:X_ScalarWebAPI_DeviceInfo>
      <av:X_ScalarWebAPI_Version>1.0</av:X_ScalarWebAPI_Version>
      <av:X_ScalarWebAPI_BaseURL>http://${address}:10000/sony</av:X_ScalarWebAPI_BaseURL>
    </av:X_ScalarWebAPI_DeviceInfo>
  </device>
</root>`;

http.createServer((req, res) => {
  console.log(`HTTP ${req.method} ${req.url}`);
  res.setHeader('Content-Type', 'text/xml');
  res.end(description);
}).listen(HTTP_PORT, () => console.log(`Serving the device description at ${location}`));

const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

socket.on('message', (msg, rinfo) => {
  const text = msg.toString();
  if (!text.startsWith('M-SEARCH')) {
    return;
  }
  const st = /^ST:\s*(.*)$/im.exec(text)?.[1]?.trim();
  console.log(`M-SEARCH for "${st}" from ${rinfo.address}:${rinfo.port}`);
  if (st !== SEARCH_TARGET && st !== 'ssdp:all') {
    return;
  }

  const response = [
    'HTTP/1.1 200 OK',
    'CACHE-CONTROL: max-age=1800',
    'EXT: ',
    `LOCATION: ${location}`,
    'SERVER: FakeSony/1.0 UPnP/1.1',
    `ST: ${SEARCH_TARGET}`,
    `USN: ${UDN}::${SEARCH_TARGET}`,
    '',
    '',
  ].join('\r\n');

  socket.send(Buffer.from(response, 'ascii'), rinfo.port, rinfo.address, err => {
    console.log(err ? `Failed to answer: ${err.message}` : `Answered ${rinfo.address}:${rinfo.port}`);
  });
});

socket.on('listening', () => {
  socket.addMembership(SSDP_IP);
  console.log(`Listening for M-SEARCH on ${SSDP_IP}:${SSDP_PORT}`);
});

socket.bind(SSDP_PORT);

process.on('SIGINT', () => {
  socket.close();
  process.exit(0);
});
