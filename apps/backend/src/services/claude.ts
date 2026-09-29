import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Must stay in sync with the category set in apps/mobile/screens/DashboardScreen.tsx,
// which maps each of these to a fixed icon/color per docs/DESIGN_REFERENCE.md.
export const RECEIPT_CATEGORIES = [
  'Groceries',
  'Dining',
  'Transport',
  'Entertainment',
  'Health',
  'Other',
] as const;

export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number];

export const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    merchant: { type: 'string' },
    total: { type: 'number' },
    // ISO calendar date, or null when no date is legible on the receipt.
    date: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amount: { type: 'number' },
          category: { type: 'string', enum: [...RECEIPT_CATEGORIES] },
        },
        required: ['name', 'amount', 'category'],
        additionalProperties: false,
      },
    },
  },
  required: ['merchant', 'total', 'date', 'items'],
  additionalProperties: false,
} as const;

export const RECEIPT_PROMPT = [
  'Analyze this receipt image and return JSON only: merchant, total, date, and items (name, amount, category).',
  `Each item's category must be one of: ${RECEIPT_CATEGORIES.join(', ')}. Use "Other" when nothing else fits.`,
  'Return date as an ISO 8601 calendar date: YYYY-MM-DD.',
  'Receipts are usually Israeli and print dates day-first (DD/MM/YYYY, DD.MM.YYYY or DD/MM/YY),',
  'so read 17/08/2026 as 17 August 2026 and return "2026-08-17"; a two-digit year YY means 20YY.',
  'If no date is visible on the receipt, return null for date. Never guess a date.',
].join(' ');

export interface ReceiptExtraction {
  merchant: string;
  total: number;
  /** ISO "YYYY-MM-DD", or null when the receipt shows no legible date. */
  date: string | null;
  items: { name: string; amount: number; category: ReceiptCategory }[];
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
}

export interface ScanReceiptResult {
  extraction: ReceiptExtraction;
  usage: ClaudeUsage;
}

export async function scanReceipt(
  base64Image: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
): Promise<ScanReceiptResult> {
  const response = await anthropic.messages.parse({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          {
            type: 'text',
            text: RECEIPT_PROMPT,
          },
        ],
      },
    ],
    output_config: {
      format: { type: 'json_schema', schema: RECEIPT_SCHEMA },
    },
  });

  if (!response.parsed_output) {
    throw new Error('Claude did not return a parseable receipt extraction');
  }

  return {
    extraction: response.parsed_output as ReceiptExtraction,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? null,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? null,
    },
  };
}
