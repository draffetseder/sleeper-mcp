import { beforeAll, describe, expect, it } from 'vitest';
import { SleeperServer } from '../../src/SleeperServer.js';

describe('SleeperServer Integration (Real API)', () => {
  let server: SleeperServer;
  let userId: string;
  let leagueId: string;
  let draftId: string;

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
    userId = data.user_id;
  });

  it('should fetch user leagues and discover a league ID', async () => {
    // We use a recent season to ensure data existence
    const result = await invokePrivateMethod('_getUserLeagues', {
      user_id: userId,
      season: '2024',
    });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('league_id');
      leagueId = data[0].league_id;
    }
  });

  it('should fetch league details', async () => {
    if (!leagueId) return; // Skip if no league found

    const result = await invokePrivateMethod('_getLeague', { league_id: leagueId });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveProperty('league_id', leagueId);
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('roster_positions');
  });

  it('should fetch rosters in a league', async () => {
    if (!leagueId) return;

    const result = await invokePrivateMethod('_getRostersInLeague', { league_id: leagueId });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('roster_id');
      expect(data[0]).toHaveProperty('owner_id');
    }
  });

  it('should fetch users in a league', async () => {
    if (!leagueId) return;

    const result = await invokePrivateMethod('_getUsersInLeague', { league_id: leagueId });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('user_id');
      expect(data[0]).toHaveProperty('display_name');
    }
  });

  it('should fetch user drafts and discover a draft ID', async () => {
    const result = await invokePrivateMethod('_getUserDrafts', { user_id: userId, season: '2024' });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('draft_id');
      draftId = data[0].draft_id;
    }
  });

  it('should fetch specific draft details', async () => {
    if (!draftId) return;

    const result = await invokePrivateMethod('_getDraft', { draft_id: draftId });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveProperty('draft_id', draftId);
    expect(data).toHaveProperty('status');
  });

  it('should fetch trending players', async () => {
    const result = await invokePrivateMethod('_getTrendingPlayers', { type: 'add', limit: 5 });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('player_id');
  });
});
