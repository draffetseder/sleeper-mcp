import { describe, it, expect, beforeAll } from 'vitest';
import { SleeperServer } from '../../src/SleeperServer.js';

describe('SleeperServer Integration (Real API)', () => {
  let server: SleeperServer;

  beforeAll(() => {
    server = new SleeperServer();
  });

  const invokePrivateMethod = async (methodName: string, args?: any) => {
    return await (server as any)[methodName](args);
  };

  it('should fetch real NFL state', async () => {
    const result = await invokePrivateMethod('_getNflState');
    const data = JSON.parse(result.content[0].text);
    
    expect(data).toHaveProperty('season');
    expect(data).toHaveProperty('week');
    expect(data).toHaveProperty('season_type');
  });

  it('should fetch a real user (sleeper)', async () => {
    const result = await invokePrivateMethod('_getUser', { user_id_or_name: 'sleeper' });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveProperty('username', 'sleeper');
    expect(data).toHaveProperty('user_id');
  });

  it('should fetch trending players', async () => {
    const result = await invokePrivateMethod('_getTrendingPlayers', { type: 'add', limit: 5 });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('player_id');
  });
});
