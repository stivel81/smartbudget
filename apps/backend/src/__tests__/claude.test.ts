const mockParse = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ messages: { parse: mockParse } })),
}));

import { RECEIPT_CATEGORIES, RECEIPT_PROMPT, RECEIPT_SCHEMA, scanReceipt } from '../services/claude';

const USAGE = { input_tokens: 1500, output_tokens: 80, cache_creation_input_tokens: null, cache_read_input_tokens: 0 };

beforeEach(() => mockParse.mockReset());

describe('receipt prompt and schema', () => {
  it('asks for an ISO YYYY-MM-DD date and explains day-first Israeli receipts', () => {
    expect(RECEIPT_PROMPT).toContain('YYYY-MM-DD');
    expect(RECEIPT_PROMPT).toMatch(/Israeli/);
    expect(RECEIPT_PROMPT).toMatch(/day-first/);
    expect(RECEIPT_PROMPT).toContain('"2026-08-17"');
    expect(RECEIPT_PROMPT).toMatch(/YY means 20YY/);
  });

  it('tells Claude to return null when no date is visible', () => {
    expect(RECEIPT_PROMPT).toMatch(/no date is visible.*return null/i);
  });

  it('still lists every category', () => {
    for (const category of RECEIPT_CATEGORIES) expect(RECEIPT_PROMPT).toContain(category);
  });

  it('constrains date to an ISO date string or null', () => {
    expect(RECEIPT_SCHEMA.properties.date).toEqual({
      anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }],
    });
    expect(RECEIPT_SCHEMA.required).toContain('date');
  });
});

describe('scanReceipt', () => {
  it('sends the image, the prompt and the schema, and returns the extraction with usage', async () => {
    const extraction = { merchant: 'טיטניום בע"מ', total: 350, date: '2026-08-17', items: [] };
    mockParse.mockResolvedValue({ parsed_output: extraction, usage: USAGE });

    const result = await scanReceipt('b64', 'image/jpeg');

    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'b64' } },
              { type: 'text', text: RECEIPT_PROMPT },
            ],
          },
        ],
        output_config: { format: { type: 'json_schema', schema: RECEIPT_SCHEMA } },
      })
    );
    expect(result).toEqual({ extraction, usage: USAGE });
  });

  it('passes a null date through (normalized later by the route)', async () => {
    mockParse.mockResolvedValue({ parsed_output: { merchant: 'M', total: 1, date: null, items: [] }, usage: USAGE });
    expect((await scanReceipt('b64', 'image/png')).extraction.date).toBeNull();
  });

  it('defaults missing cache usage fields to null', async () => {
    mockParse.mockResolvedValue({
      parsed_output: { merchant: 'M', total: 1, date: null, items: [] },
      usage: { input_tokens: 1, output_tokens: 2 },
    });
    expect((await scanReceipt('b64', 'image/png')).usage).toEqual({
      input_tokens: 1,
      output_tokens: 2,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    });
  });

  it('throws when Claude returns no parseable output', async () => {
    mockParse.mockResolvedValue({ parsed_output: null, usage: USAGE });
    await expect(scanReceipt('b64', 'image/jpeg')).rejects.toThrow('Claude did not return a parseable receipt extraction');
  });
});
