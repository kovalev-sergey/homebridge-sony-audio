/* eslint-disable no-console */
import { Client } from 'node-ssdp';

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const client = new Client();

client.on('response', (headers, statusCode, rinfo) => {
  console.log(`Got a response to an m-search:\n${JSON.stringify(headers)}\n\n`);
});

async function main() {
  client.search('urn:schemas-sony-com:service:ScalarWebAPI:1');
  // client.search('ssdp:all');
  await timeout(5000);
}


// Or get a list of all services on the network

// client.search('ssdp:all');

main();
