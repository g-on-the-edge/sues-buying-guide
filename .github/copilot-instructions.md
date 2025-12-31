# Sue's Buying Guide - AI Agent Instructions

## Project Overview

**Sue's Buying Guide** is a specialized inventory management tool for Performance Foodservice Shawano. It parses daily PDF inventory reports to identify items requiring immediate attention based on Days Supply calculations, helping Sue prioritize ordering decisions.

**Tech Stack**: Full-stack TypeScript monorepo with Vite + React client, Express + PDF parsing server

---

## Critical Architecture Patterns

### Monorepo Structure

This is a **client-server monorepo** with separate build processes:

```
sues-buying-guide/
├── client/          # Vite + React frontend
│   ├── src/
│   └── package.json
├── server/          # Express + PDF parsing backend
│   ├── src/
│   └── package.json
└── package.json     # Root package with convenience scripts
```

**Key Commands**:
```bash
# Install all dependencies (root, client, server)
npm run install:all

# Development (runs both client and server)
npm run dev

# Build both for production
npm run build

# Production server (serves client build)
npm start
```

### PDF Parsing Strategy

The core feature is **right-to-left PDF parsing** for accurate data extraction:

**Why Right-to-Left?**:
- Performance Foodservice PDFs have inconsistent column spacing
- Product descriptions contain numbers that interfere with left-to-right parsing
- Days Supply is always the rightmost numeric column
- Right-to-left ensures we capture the correct value

**Implementation** (`server/src/parser/`):
1. Extract all text from PDF with position coordinates
2. Sort text elements right-to-left
3. Parse numeric values from right edge first
4. Match products to their Days Supply values
5. Calculate confidence scores for uncertain parses

**Confidence Scoring**:
- **High confidence** (>0.8): Display normally
- **Low confidence** (<0.8): Flag in "Needs Review" category
- Scoring based on: position consistency, numeric pattern matching, column alignment

### Client-Server Communication

- **API Endpoint**: `POST /api/upload` accepts PDF files (max 50MB)
- **Response Format**: JSON with categorized items
- **Error Handling**: Structured errors with user-friendly messages
- **CORS**: Configured for development (localhost:5173) and production

**Upload Flow**:
```typescript
// Client: Upload PDF
const formData = new FormData();
formData.append('pdf', file);
const response = await fetch('http://localhost:3001/api/upload', {
  method: 'POST',
  body: formData
});
const data = await response.json();

// Server: Parse and return categorized items
{
  critical: [],      // ≤ 2 days supply
  attention: [],     // ≤ 5 days supply
  needsReview: [],   // Low confidence parses
  allItems: []       // Full inventory list
}
```

### Categorization Logic

Items are automatically sorted into action categories:

- **Critical (≤ 2 days)**: Immediate ordering required (red badge)
- **Attention (3-5 days)**: Review soon (yellow badge)
- **Needs Review**: Parsing confidence < 80% (gray badge)
- **All Items**: Complete inventory for reference

---

## Development Workflows

### First-Time Setup (Windows)

```cmd
cd sues-buying-guide
npm run install:all
```

### Running Development

```bash
# Start both client and server with hot reload
npm run dev

# Client runs on http://localhost:5173
# Server runs on http://localhost:3001
```

### Production Build & Deploy

**Standard Production Build**:
```bash
# Build both client and server
npm run build

# Start production server (serves static client)
npm start

# Access at http://localhost:3001
```

**Portable Installation (USB/Thumb Drive for Work Laptop)**:

1. **Initial Setup on Development Machine**:
   ```bash
   # Install all dependencies
   npm run install:all
   
   # Build for production
   npm run build
   ```

2. **Package for Portable Use**:
   - Copy entire `sues-buying-guide/` folder to USB drive
   - Includes: `node_modules/`, `client/dist/`, `server/dist/`, all `package.json` files
   - Size: ~200-300MB with all dependencies

3. **Running from USB on Work Laptop**:
   ```bash
   # Navigate to USB drive
   cd /path/to/usb/sues-buying-guide
   
   # Start production server (no build needed)
   npm start
   
   # Open browser to http://localhost:3001
   ```

4. **No Admin Rights Needed**:
   - If Node.js not installed on work laptop, use **portable Node.js**:
     - Download Node.js portable from https://nodejs.org/en/download/
     - Extract to USB drive alongside project
     - Run: `path/to/portable-node/node.exe server/dist/index.js`

5. **IT Department Restrictions**:
   - Works entirely on localhost - no internet connection required
   - No installation/admin privileges needed (if using portable Node.js)
   - PDF files processed locally - never uploaded to external servers
   - Port 3001 usually not blocked by corporate firewalls

**Vercel Deployment** (if laptop installation not possible):
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from project root
vercel

# Access via generated URL (e.g., sues-buying-guide.vercel.app)
```

### Testing PDF Parsing

```bash
# Run server tests with coverage
cd server
npm test

# Test with sample PDFs (place in /test-pdfs folder)
# Upload via UI at http://localhost:5173
```

---

## Code Conventions

### TypeScript Configuration

- **Strict Mode**: Enabled across both client and server
- **Shared Types**: Define in `server/src/types/` for API contracts
- **Client Types**: Import server types or duplicate minimal subset
- **No `any`**: Prefer `unknown` or proper typing

### File Organization

**Client** (`client/src/`):
- `App.tsx` - Main component with upload and results display
- `components/` - Reusable UI (UploadZone, ItemCard, CategoryTabs)
- `services/` - API calls and data fetching
- `types/` - TypeScript interfaces

**Server** (`server/src/`):
- `index.ts` - Express app setup and middleware
- `routes/` - API route handlers
- `parser/` - PDF parsing logic (core business logic)
- `types/` - Shared type definitions
- `__tests__/` - Jest test suites

### React Patterns

- Functional components with hooks
- Props interfaces defined inline or in types file
- Error boundaries for PDF upload failures
- Loading states during parse operations

---

## Key Domain Concepts

### Days Supply Calculation

Days Supply = Current Inventory / Average Daily Usage

**Critical for ordering decisions**:
- 0-2 days: Order immediately or risk stockout
- 3-5 days: Monitor and prepare order
- 6+ days: Adequate stock

### Vendor Grouping

Items are organized by vendor/distributor for efficient ordering:
- Each vendor section is collapsible
- Shows item count per vendor
- Facilitates batch ordering from same supplier

### Export Capabilities

Multiple export formats for different workflows:

1. **Excel (.xlsx)**: Separate sheets per category, formatted for printing
2. **CSV**: Current filtered view for database import
3. **Email Summary**: Copy-to-clipboard formatted text for quick communication
4. **Print View**: Optimized layout for physical ordering sheets

---

## Common Gotchas

1. **PDF Parser Sensitivity**: Parser expects specific PDF structure from Performance Foodservice. Different vendors' PDFs may need parser adjustments in `server/src/parser/`.

2. **File Size Limits**: Multer configured for 50MB max. Adjust in `server/src/routes/upload.ts` if needed.

3. **Port Conflicts**: Client (5173) and server (3001) must be available. Change in package.json scripts if conflicts occur.

4. **Production Routing**: Server serves client build from `client/dist/`. Build client before deploying server.

5. **CORS in Production**: Remove/adjust CORS middleware in production. Currently allows all origins for dev.

6. **Confidence Threshold**: Set to 0.8 in parser. Adjust if too many/few items flagged for review.

---

## Integration Points

- **PDF Parsing**: `pdf-parse` and `pdfjs-dist` libraries for text extraction
- **Excel Export**: `xlsx` library (SheetJS) for .xlsx generation
- **File Upload**: `multer` middleware for multipart form handling
- **Testing**: Jest with `ts-jest` for TypeScript support

---

## Reference Files for Patterns

- **PDF parsing logic**: `server/src/parser/` (core algorithm)
- **API routes**: `server/src/routes/upload.ts`
- **Upload UI**: `client/src/App.tsx`, `client/src/components/UploadZone.tsx`
- **Type definitions**: `server/src/types.ts`, `server/src/types/index.ts`
- **Express setup**: `server/src/index.ts`
- **Test examples**: `server/src/__tests__/`

---

## Quick Start for AI Agents

1. **Understand the parsing strategy**: Read `server/src/parser/` to grasp right-to-left logic
2. **Test with real PDFs**: Use sample PDFs to see categorization in action
3. **Focus on accuracy**: Days Supply extraction is mission-critical - validate all parser changes
4. **Client is simple**: Most complexity lives in server-side parsing
5. **Monorepo commands**: Always use root-level scripts (`npm run install:all`, `npm run dev`)
6. **Types matter**: PDF parsing requires careful type handling - no shortcuts

When modifying the parser, always test with multiple PDF samples to ensure accuracy across different report formats.
