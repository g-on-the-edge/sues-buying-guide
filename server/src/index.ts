import express from 'express';
import cors from 'cors';
import path from 'path';
import uploadRouter from './routes/upload';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', uploadRouter);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientBuildPath));

  // Handle client-side routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);

  if (err instanceof Error) {
    if (err.message === 'Only PDF files are allowed') {
      return res.status(400).json({
        error: 'Invalid file type',
        message: err.message,
      });
    }

    if (err.message.includes('File too large')) {
      return res.status(400).json({
        error: 'File too large',
        message: 'Maximum file size is 50MB',
      });
    }
  }

  res.status(500).json({
    error: 'Internal server error',
    message: err.message || 'An unexpected error occurred',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                   Sue's Buying Guide                       ║
║                    Server Running                          ║
╠════════════════════════════════════════════════════════════╣
║  Local:   http://localhost:${PORT}                           ║
║  API:     http://localhost:${PORT}/api/health                ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;
