import { SleeperServer } from './SleeperServer.js';

const server = new SleeperServer();
server.run().catch(console.error);
