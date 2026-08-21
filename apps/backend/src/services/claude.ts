import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    merchant: { type: 'string' },
    total: { type: 'number' },
    date: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amount: { type: 'number' },
          category: { type: 'string' },
        },
        required: ['name', 'amount', 'category'],
        additionalProperties: false,
      },
    },
  },
  required: ['merchant', 'total', 'date', 'items'],
  additionalProperties: false,
} as const;

export interface ReceiptExtraction {
  merchant: string;
  total: number;
  date: string;
  items: { name: string; amount: number; category: string }[];
}

export async function scanReceipt(
  base64Image: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
): Promise<ReceiptExtraction> {
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
            text: 'Analyze this receipt image and return JSON only: merchant, total, date, and items (name, amount, category).',
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

  return response.parsed_output as ReceiptExtraction;
}
