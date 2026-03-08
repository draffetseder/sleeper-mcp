import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SleeperServer } from '../src/SleeperServer.js';

// Mock axios
vi.mock('axios');

describe('SleeperServer', () => {
  let server: SleeperServer;
  let mockAxiosGet: any;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create a mock axios instance
    mockAxiosGet = vi.fn();
    (axios.create as any).mockReturnValue({
      get: mockAxiosGet,
    });

    server = new SleeperServer();
  });

  // Helper to access private methods for testing
  // Since we are testing internal logic via public tool handlers, we simulate tool calls
  // However, the tool handlers are private callbacks.
  // A better approach for unit testing this specific implementation is to test the private _apiCall or specific methods
  // if we cast to any, or we can test the public interface (tool calling) if we mocked the transport.
  // For simplicity and effectiveness, we will test the private methods by casting to any,
  // as setting up a full MCP client/transport for unit tests is complex.

  const invokePrivateMethod = async (methodName: string, args?: any) => {
    return await (server as any)[methodName](args);
  };

  it('should get user', async () => {
    mockAxiosGet.mockResolvedValue({ data: { username: 'testuser' } });
    const result = await invokePrivateMethod('_getUser', { user_id_or_name: 'testuser' });

    expect(mockAxiosGet).toHaveBeenCalledWith('/user/testuser', { params: undefined });
    expect(JSON.parse(result.content[0].text)).toEqual({ username: 'testuser' });
  });

  it('should get user leagues', async () => {
    mockAxiosGet.mockResolvedValue({ data: [] });
    await invokePrivateMethod('_getUserLeagues', { user_id: '123', season: '2024' });

    expect(mockAxiosGet).toHaveBeenCalledWith('/user/123/leagues/nfl/2024', { params: undefined });
  });

  it('should get trending players with defaults', async () => {
    mockAxiosGet.mockResolvedValue({ data: [] });
    await invokePrivateMethod('_getTrendingPlayers', { type: 'add' });

    expect(mockAxiosGet).toHaveBeenCalledWith('/players/nfl/trending/add', {
      params: { lookback_hours: 24, limit: 25 },
    });
  });

  it('should handle API errors', async () => {
    const error = new Error('API Error');
    (error as any).isAxiosError = true;
    (error as any).response = { data: { message: 'Not Found' } };

    // We need to simulate the CallToolRequest handler to test error handling properly
    // or just test that the private method throws and the handler catches it.
    // Since _getUser calls _apiCall which awaits axios, it will throw.
    mockAxiosGet.mockRejectedValue(error);

    await expect(invokePrivateMethod('_getUser', { user_id_or_name: 'baduser' })).rejects.toThrow(
      'API Error'
    );
  });
});
