# Sue's Buying Guide

A web application to help Sue identify inventory items requiring attention based on Days Supply values from Performance Foodservice Shawano's daily Inventory Order Report PDFs.

## Features

- **PDF Upload**: Drag-and-drop or browse to upload daily inventory reports
- **Smart Parsing**: Right-to-left parsing strategy for accurate Days Supply extraction
- **Confidence Scoring**: Items flagged for review when parsing is uncertain
- **Categorization**:
  - **Critical**: Items with 2 days or less supply (immediate action required)
  - **Attention**: Items with 5 days or less supply
  - **Needs Review**: Items that couldn't be parsed with high confidence
- **Vendor Grouping**: Items organized by vendor for easy review
- **Search & Filter**: Find items by product number, brand, description, or vendor
- **Export Options**:
  - Excel (.xlsx) with separate sheets for each category
  - CSV export for current view
  - Copy email summary to clipboard
  - Print-friendly view

## Quick Start (Windows)

### Prerequisites

- **Node.js 18+** - Download from https://nodejs.org/
- **npm** (comes with Node.js)

### Installation

1. **Open Command Prompt or PowerShell**

2. **Navigate to the project folder**:
   ```cmd
   cd sues-buying-guide
   ```

3. **Install all dependencies**:
   ```cmd
   npm run install:all
   ```
   This installs dependencies for the root, server, and client.

4. **Start the development server**:
   ```cmd
   npm run dev
   ```

5. **Open your browser** to http://localhost:5173

### Usage

1. Upload your daily Inventory Order Report PDF
2. Review the summary dashboard showing critical and attention items
3. Click on category tabs to filter the view
4. Use search to find specific items
5. Export to Excel or copy email summary as needed

## Project Structure

```
sues-buying-guide/
├── package.json          # Root package with scripts
├── README.md
├── server/               # Express backend
│   ├── src/
│   │   ├── index.ts      # Server entry point
│   │   ├── types.ts      # TypeScript interfaces
│   │   ├── routes/
│   │   │   └── upload.ts # Upload endpoint
│   │   ├── parser/
│   │   │   ├── pdfParser.ts    # PDF extraction
│   │   │   └── lineParser.ts   # Line-by-line parsing
│   │   └── __tests__/
│   │       └── parser.test.ts  # Parser tests
│   └── package.json
└── client/               # React frontend
    ├── src/
    │   ├── App.tsx
    │   ├── App.css
    │   ├── types.ts
    │   ├── components/
    │   │   ├── Upload.tsx
    │   │   ├── Dashboard.tsx
    │   │   ├── ItemTable.tsx
    │   │   ├── VendorGroup.tsx
    │   │   └── ExportButtons.tsx
    │   └── utils/
    │       └── exportUtils.ts
    └── package.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both server and client in development mode |
| `npm run dev:server` | Start only the backend server |
| `npm run dev:client` | Start only the frontend |
| `npm run build` | Build both server and client for production |
| `npm run test` | Run parser unit tests |
| `npm run install:all` | Install all dependencies |

## How the Parser Works

### PDF Format Understanding

The Inventory Order Report PDF has this structure:

1. **Vendor Headers**:
   ```
   Vendor: 00001740 FRITO LAY * Broker: Min Order: 1000
   ```

2. **Column Headers**:
   ```
   Prod# Unt Size Brand Description Y-T-D Wk3 Wk2 Wk1 Curr Avg Avail Ordr Sply LndCst MrkCst Slot IP
   ```

3. **Item Lines** (multi-line blocks):
   ```
   54406 CS 72/1 OZ DORITO CHIP TORTILLA NACHO CHSE 665 39 29 4 1 24 46 48 9 28.79 31.05 DL3400 4.4
   TiHi:06X06 Catg:10
   Cube: 1.73 06x08 BuyMult: 12
   ```

### Right-to-Left Parsing Strategy

The parser reads item lines from the **right side** first because the tail columns have a predictable structure:

```
... Avail Ordr Sply LndCst MrkCst Slot IP
... 46    48   9    28.79  31.05  DL3400 4.4
```

This ensures we correctly identify:
- **IP** (last float)
- **Slot** (alphanumeric code)
- **MrkCst** (marked cost)
- **LndCst** (landed cost)
- **Sply** (Days Supply - THE KEY FIELD)
- **Ordr** (on order)
- **Avail** (available)

### Confidence Scoring

- **High Confidence**: All required fields parsed successfully
- **Low Confidence**: Missing or ambiguous fields, goes to "Needs Review"

The parser **never guesses** Days Supply. If it can't parse it reliably, the item is flagged for manual review.

## API Endpoints

### POST /api/parse

Upload and parse a PDF file.

**Request**: `multipart/form-data` with file field `file`

**Response**:
```json
{
  "items": [...],
  "stats": {
    "totalItems": 150,
    "highConfidenceCount": 145,
    "lowConfidenceCount": 5,
    "attentionCount": 23,
    "criticalCount": 8,
    "needsReviewCount": 5,
    "vendorCount": 12
  },
  "parseErrors": []
}
```

### GET /api/health

Health check endpoint.

## Testing

Run the parser tests:

```cmd
cd server
npm test
```

Tests cover:
- Vendor line parsing
- Line skip detection
- Item line detection
- Tail parsing (right-to-left)
- Front parsing (left-to-right)
- Full item line parsing
- Edge cases (negative IP, decimal days supply)

## Troubleshooting

### "PDF extraction produced insufficient content"

The PDF may be:
- Scanned image (not text-based)
- Password protected
- Corrupted

Try opening the PDF in a text editor to verify it contains extractable text.

### Items showing in "Needs Review"

These items couldn't be parsed with high confidence. Common reasons:
- S/O (Special Order) items with incomplete data
- Unusual line formatting
- Items at page boundaries

Review these manually by clicking "Review" to see the raw line.

### Server won't start

1. Make sure Node.js 18+ is installed: `node --version`
2. Make sure dependencies are installed: `npm run install:all`
3. Check if port 3001 is in use: `netstat -an | findstr 3001`

## Technology Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, Vite, TypeScript
- **PDF Parsing**: pdf-parse (primary), pdfjs-dist (fallback)
- **Excel Export**: SheetJS (xlsx)
- **Testing**: Jest

## License

Internal use only - Performance Foodservice Shawano
