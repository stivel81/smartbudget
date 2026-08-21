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

export default router;
