import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function (this: any) {
    this.models = { generateContent: mockGenerateContent };
  }),
}));

import { rankVenuesBySunExposure, VenueRankingInput } from './aiService';

const venue: VenueRankingInput = {
  id: 'abc',
  name: 'Test Venue',
  address: '1 Main St',
  types: ['bar'],
  lat: 37.7,
  lng: -122.4,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('rankVenuesBySunExposure', () => {
  it('returns parsed rankings on success', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '[{"id":"abc","sunScore":80,"reasoning":"south patio"}]',
    });

    const result = await rankVenuesBySunExposure([venue], 14, 'test-key');

    expect(result).toEqual([{ id: 'abc', sunScore: 80, reasoning: 'south patio' }]);
  });

  it('calls generateContent with correct model', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '[{"id":"abc","sunScore":80,"reasoning":"south patio"}]',
    });

    await rankVenuesBySunExposure([venue], 14, 'test-key');

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.0-flash' })
    );
  });

  it('returns neutral fallback when generateContent rejects', async () => {
    mockGenerateContent.mockRejectedValue(new Error('network error'));

    const result = await rankVenuesBySunExposure([venue], 14, 'test-key');

    expect(result).toEqual([{ id: 'abc', sunScore: 50, reasoning: 'unavailable' }]);
  });
});
