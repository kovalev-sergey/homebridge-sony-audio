/* eslint-disable no-console */
/**
 * Manual helper: runs the plugin's SSDP client on the real network and prints
 * every answer. Useful together with `tests/ssdp-server.ts` to check discovery
 * without a Sony device. Run with `npx ts-node tests/ssdp-client.ts`.
 *
 * It is not part of the jest run.
 */
import { Client } from '../src/ssdp';

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const client = new Client({ logger: message => console.log(`[ssdp] ${message}`) });

client.on('response', (headers, statusCode, rinfo) => {
  console.log(`status ${statusCode} from ${rinfo.address}:${rinfo.port}`);
  console.log(`Got a response to an m-search:\n${JSON.stringify(headers)}\n\n`);
});

async function main() {
  client.search('urn:schemas-sony-com:service:ScalarWebAPI:1');
  // client.search('ssdp:all');
  await timeout(5000);
  client.stop();
}


// Or get a list of all services on the network

// client.search('ssdp:all');

main();
