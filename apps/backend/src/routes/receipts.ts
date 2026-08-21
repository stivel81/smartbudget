import { Router, Response } from 'express';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { scanReceipt } from '../services/claude';
import { requireAuth, AuthedRequest } from '../middleware/requireAuth';

const router = Router();

const VALID_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

interface ScanRequest {
  image?: string;
  mediaType?: string;
}

// POST /api/v1/receipts/scan
router.post('/scan', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { image, mediaType } = req.body as ScanRequest;

  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing required field: image (base64)', status: 400 });
  }

  if (!mediaType || !VALID_MEDIA_TYPES.has(mediaType)) {
    return res.status(400).json({
      error: `Missing or invalid mediaType. Must be one of: ${[...VALID_MEDIA_TYPES].join(', ')}`,
      status: 400,
    });
  }

  try {
    const extraction = await scanReceipt(image, mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif');

    const { data, error } = await supabase
      .from('receipts')
      .insert({ user_id: req.userId, raw_response: extraction })
      .select()
      .single();

    if (error) {
      console.error('Failed to save receipt:', error);
      return res.status(500).json({ error: 'Failed to save receipt', status: 500 });
    }

    return res.status(201).json({ receipt: data });
  } catch (err) {
    console.error('Receipt scan error:', err);
    return res.status(500).json({ error: 'Failed to analyze receipt', status: 500 });
  }
});

// GET /api/v1/receipts
router.get('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch receipts:', error);
    return res.status(500).json({ error: 'Failed to fetch receipts', status: 500 });
  }

  return res.status(200).json({ receipts: data });
});

interface UpdateReceiptRequest {
  merchant?: string;
  total?: number;
  date?: string;
}

// PATCH /api/v1/receipts/:id — correct a scanned receipt before/after confirming
router.patch('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { merchant, total, date } = req.body as UpdateReceiptRequest;

  if (merchant === undefined && total === undefined && date === undefined) {
    return res.status(400).json({ error: 'Provide at least one of: merchant, total, date', status: 400 });
  }
  if (merchant !== undefined && (typeof merchant !== 'string' || !merchant.trim())) {
    return res.status(400).json({ error: 'merchant must be a non-empty string', status: 400 });
  }
  if (total !== undefined && (typeof total !== 'number' || !(total > 0))) {
    return res.status(400).json({ error: 'total must be a positive number', status: 400 });
  }
  if (date !== undefined && typeof date !== 'string') {
    return res.status(400).json({ error: 'date must be a string', status: 400 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Receipt not found', status: 404 });
  }

  const updatedRawResponse = {
    ...existing.raw_response,
    ...(merchant !== undefined && { merchant }),
    ...(total !== undefined && { total }),
    ...(date !== undefined && { date }),
  };

  const { data, error } = await supabase
    .from('receipts')
    .update({ raw_response: updatedRawResponse })
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update receipt:', error);
    return res.status(500).json({ error: 'Failed to update receipt', status: 500 });
  }

  return res.status(200).json({ receipt: data });
});

// DELETE /api/v1/receipts/:id
router.delete('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { error, count } = await supabase
    .from('receipts')
    .delete({ count: 'exact' })
    .eq('id', req.params.id)
    .eq('user_id', req.userId);

  if (error) {
    console.error('Failed to delete receipt:', error);
    return res.status(500).json({ error: 'Failed to delete receipt', status: 500 });
  }

  if (!count) {
    return res.status(404).json({ error: 'Receipt not found', status: 404 });
  }

  return res.status(204).send();
});

export default router;
