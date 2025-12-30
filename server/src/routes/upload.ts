import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parsePdf } from '../parser/pdfParser';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

/**
 * POST /api/parse
 * Upload and parse a PDF inventory report
 */
router.post('/parse', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please upload a PDF file',
      });
    }

    console.log(`Processing file: ${req.file.originalname} (${req.file.size} bytes)`);

    const result = await parsePdf(req.file.buffer);

    console.log(`Parsed ${result.stats.totalItems} items from ${result.stats.vendorCount} vendors`);
    console.log(`  - High confidence: ${result.stats.highConfidenceCount}`);
    console.log(`  - Attention (≤5 days): ${result.stats.attentionCount}`);
    console.log(`  - Critical (≤2 days): ${result.stats.criticalCount}`);
    console.log(`  - Needs review: ${result.stats.needsReviewCount}`);

    if (result.parseErrors.length > 0) {
      console.log(`  - Parse errors: ${result.parseErrors.length}`);
    }

    res.json(result);

  } catch (err) {
    console.error('Parse error:', err);

    const message = err instanceof Error ? err.message : 'Unknown error occurred';

    res.status(500).json({
      error: 'Parse failed',
      message,
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
