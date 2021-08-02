/* eslint-disable no-console */
import { Server } from 'node-ssdp';

const server = new Server({
  location: 'http://0.0.0.0:123/desc.xml',
});

server.addUSN('upnp:rootdevice');
server.addUSN('urn:schemas-upnp-org:device:MediaServer:1');
server.addUSN('urn:schemas-upnp-org:service:ContentDirectory:1');
server.addUSN('urn:schemas-upnp-org:service:ConnectionManager:1');
server.addUSN('urn:schemas-sony-com:service:ScalarWebAPI:1');


server.on('advertise-alive', (headers) => {
  console.log(`'advertise-alive:'\n${JSON.stringify(headers)}`);
});

server.on('advertise-bye', (headers) => {
  console.log(`'advertise-bye:'\n${JSON.stringify(headers)}`);
});

server.start();

process.on('exit', () => {
  server.stop(); 
});
