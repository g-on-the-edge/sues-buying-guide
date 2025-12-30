# Sue's Buying Guide - Complete App Specification

Build a web app that parses "Inventory Order Report" PDFs to help buyers identify low-stock items and track incoming Purchase Orders.

**Stack**: Node.js/Express (TypeScript) backend + React/Vite (TypeScript) frontend

---

## WHAT THE APP DOES

1. **Upload PDF** - Buyer uploads daily INVORD report
2. **Parse Items** - Extract all inventory items with Days Supply
3. **Parse Purchase Orders** - Extract all open POs and special orders
4. **Show Attention Items** - Items with ≤5 days supply (color-coded)
5. **Show Purchase Orders** - What's coming in and when
6. **Export** - Excel, CSV, email summary, print view

---

## DATA MODELS

### Parsed Item
```typescript
interface ParsedItem {
  vendorId: string;
  vendorName: string;
  prodNo: string;
  specialOrder: boolean;      // true if "S/O"
  unit: string;               // CS, EA, S/O
  size: string;               // "72/1 OZ", "2/5 LB"
  brand: string;
  description: string;
  ytd: number | null;         // Year-to-date sales
  avg: number | null;         // Average weekly sales
  avail: number | null;       // Current inventory
  onOrder: number | null;     // Qty on order
  daysSply: number | null;    // CRITICAL: Days of supply remaining
  lndCst: number | null;      // Landed cost
  mrkCst: number | null;      // Market cost
  slot: string | null;        // Warehouse slot
  ip: number | null;          // Item priority
  confidence: 'high' | 'medium' | 'low';
  numericColumns: number;     // For debugging
  rawLine: string;
}
```

### Purchase Order
```typescript
interface PurchaseOrder {
  poNumber: string;           // 5-digit (e.g., "60649")
  vendorId: string;
  vendorName: string;
  dueDate: string;            // MM/DD/YY
  totalCases: number;
  status: string;             // "Conf:Recpt/Qty/Costs.", etc.
  edi: boolean | null;        // true = EDI confirmed, false/null = NOT confirmed
  appointment: string | null; // "01/02/26 06:00"
  pickUp: string | null;
  entered: string | null;
  
  // COMPUTED FIELDS (calculate after parsing)
  daysUntilDue: number;       // Days from report date to due date
  isUrgent: boolean;          // true if needs immediate attention
  urgentReasons: string[];    // ["No EDI confirmation", "No appointment"]
}
```

### Urgent PO Logic (CRITICAL FOR SUE)
```typescript
const URGENT_WINDOW_DAYS = 5;  // POs due within 5 days need attention

function calculatePOUrgency(po: PurchaseOrder, reportDate: Date): void {
  // Parse due date
  const dueDate = parseDate(po.dueDate);  // MM/DD/YY format
  po.daysUntilDue = Math.floor((dueDate - reportDate) / (1000 * 60 * 60 * 24));
  
  // Determine urgency
  po.urgentReasons = [];
  po.isUrgent = false;
  
  // Only check POs due within the urgent window (or overdue)
  if (po.daysUntilDue <= URGENT_WINDOW_DAYS) {
    
    // Check 1: No EDI confirmation
    if (!po.edi) {
      po.urgentReasons.push('No EDI confirmation');
      po.isUrgent = true;
    }
    
    // Check 2: No appointment scheduled
    if (!po.appointment) {
      po.urgentReasons.push('No appointment');
      po.isUrgent = true;
    }
  }
}
```

**What makes a PO urgent:**
- Due within 5 days (or overdue)
- AND missing EDI confirmation OR missing appointment
- Sue needs to call these vendors to confirm delivery
```

### Special Order (Customer Orders)
```typescript
interface SpecialOrder {
  prodNo: string;
  description: string;
  custNo: string;
  customerName: string;
  dateEntered: string;
  dateDoq: string | null;
  dateDue: string | null;
  poNumber: string | null;
  qtyOrdered: number;
  onHand: number;
  status: 'Ready' | '*DOQ*' | 'Order';
  vendorId: string;
  vendorName: string;
}
```

### API Response
```typescript
interface ParseResponse {
  items: ParsedItem[];
  purchaseOrders: PurchaseOrder[];
  specialOrders: SpecialOrder[];
  stats: {
    totalItems: number;
    highConfidenceCount: number;
    mediumConfidenceCount: number;
    lowConfidenceCount: number;
    attentionCount: number;       // HIGH confidence, Sply ≤ 5
    criticalCount: number;        // HIGH confidence, Sply ≤ 2
    watchListCount: number;       // MEDIUM confidence, Sply ≤ 5
    needsReviewCount: number;     // LOW confidence
  };
  poStats: {
    totalPOs: number;
    totalCases: number;
    vendorsWithPOs: number;
    thisWeekArrivals: number;
    specialOrderCount: number;
    readyCount: number;
    doqCount: number;
    pendingCount: number;
    
    // URGENT PO STATS (for Action Required section)
    urgentPOCount: number;        // POs needing immediate attention
    urgentCases: number;          // Total cases at risk
    missingEDICount: number;      // POs without EDI confirmation
    missingAppointmentCount: number;  // POs without scheduled appointment
    overduePOCount: number;       // POs past due date
  };
}
```

---

## PARSING RULES (CRITICAL - FOLLOW EXACTLY)

### Item Line Detection
```javascript
function isItemLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 6) return false;
  
  // Must start with alphanumeric Prod# (2-8 chars)
  if (!/^[A-Z0-9]{2,8}$/i.test(tokens[0])) return false;
  
  // Must have at least 2 decimal numbers (costs)
  const decimals = line.match(/\d+\.\d+/g) || [];
  return decimals.length >= 2;
}
```

### Lines to IGNORE
```javascript
const ignorePatterns = [
  /^RUN DATE/i, /^RUN TIME/i, /^INVORD/i,
  /^Arrival date/i, /^BH\/Ship date/i,
  /^Phone\s*:/i, /^Buyer\s*:/i, /^Freight:/i, /^FDA/i,
  /^TiHi:/i, /^Cube:/i,
  /^Prod#\s+Unt/i,           // Header
  /^=+$/, /^-+$/,            // Separators
  /^\*\s*\*\s*\*/,           // Sales header
  /^Vnd\s+\d+\s+SubTot/i,
  /^Cases\s*:/i, /^Dollars:/i, /^Ave\s+/i,
  /^Open P\.O\./i, /^P\.O\.\s+Due/i,
  /^Special Order summary/i,
];
```

### Parse Items RIGHT-TO-LEFT (Most Important)
The last 4 tokens are ALWAYS reliable:
```
[...variable...] [LndCst] [MrkCst] [Slot] [IP]
```

```javascript
function parseItemLine(line: string, vendor: Vendor): ParsedItem {
  const tokens = line.trim().split(/\s+/);
  const n = tokens.length;
  
  // STEP 1: Parse guaranteed tail (right to left)
  const ip = parseFloat(tokens[n-1].replace(/-$/, ''));
  const slot = tokens[n-2];
  const mrkCst = parseFloat(tokens[n-3]);
  const lndCst = parseFloat(tokens[n-4]);
  
  // STEP 2: Count numeric columns before LndCst
  let numericCols: number[] = [];
  for (let i = n - 5; i >= 0; i--) {
    const t = tokens[i].replace(/-$/, '');
    if (/^-?\d+$/.test(t)) {
      numericCols.unshift(parseInt(t));
    } else {
      break;
    }
  }
  
  // STEP 3: Determine confidence
  const colCount = numericCols.length;
  let confidence: 'high' | 'medium' | 'low';
  if (colCount >= 7) confidence = 'high';
  else if (colCount >= 5) confidence = 'medium';
  else confidence = 'low';
  
  // STEP 4: Extract Days Supply (ALWAYS last numeric before costs)
  const daysSply = colCount >= 1 ? numericCols[numericCols.length - 1] : null;
  
  // STEP 5: Extract Avail and OnOrder based on column count
  let avail: number | null = null;
  let onOrder: number | null = null;
  
  if (colCount >= 9) {
    // Full: Y-T-D Wk3 Wk2 Wk1 Curr Avg Avail Ordr Sply
    onOrder = numericCols[numericCols.length - 2];
    avail = numericCols[numericCols.length - 3];
  } else if (colCount >= 7) {
    // Partial: may have Avail but not Ordr
    avail = numericCols[numericCols.length - 2];
  }
  
  // STEP 6: Parse front (product info)
  const prodNo = tokens[0];
  const isSpecialOrder = tokens[1] === 'S/O';
  // ... parse unit, size, brand, description
  
  return {
    prodNo, vendorId: vendor.vendorId, vendorName: vendor.vendorName,
    specialOrder: isSpecialOrder,
    daysSply, avail, onOrder, lndCst, mrkCst, slot, ip,
    confidence, numericColumns: colCount,
    // ... other fields
  };
}
```

### Confidence Rules
| Numeric Columns | Confidence | Action |
|-----------------|------------|--------|
| 7+ | HIGH | Show in Attention/Critical |
| 5-6 | MEDIUM | Show in Watch List |
| 0-4 | LOW | Show in Needs Review |

---

## PURCHASE ORDER PARSING

### Detect PO Sections
```javascript
function isPOHeader(line: string): boolean {
  return line.includes('Open P.O. Summary for Vendor');
}

function isSpecialOrderHeader(line: string): boolean {
  return line.includes('Special Order summary for this vendor');
}
```

### Parse PO Lines
```javascript
// Pattern: "60649 01/02/26 955 Conf:EDI Costs 01/02/26 06:00 12/23/25"
function parsePOLine(line: string, vendor: Vendor): PurchaseOrder | null {
  const match = line.match(/^(\d{5})\s+(\d{2}\/\d{2}\/\d{2})\s+(\d+)\s+(.+)$/);
  if (!match) return null;
  
  const [_, poNumber, dueDate, cases, rest] = match;
  const statusMatch = rest.match(/^(Conf:[^\s]+)/);
  const dates = rest.match(/\d{2}\/\d{2}\/\d{2}/g) || [];
  const times = rest.match(/\d{2}:\d{2}/g) || [];
  
  return {
    poNumber,
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    dueDate,
    totalCases: parseInt(cases),
    status: statusMatch ? statusMatch[1] : rest.substring(0, 25),
    edi: rest.includes('Yes') ? true : rest.includes('No') ? false : null,
    appointment: dates[0] && times[0] ? `${dates[0]} ${times[0]}` : null,
    entered: dates[dates.length - 1] || null
  };
}
```

### Parse Special Order Lines
```javascript
// Pattern: "TF164 CHIP POTATO JALAPENO 1415 BILL & CAROL'S 12/11/25 12/22/25 01/06/26 60468 1 0 *DOQ* Bill H"
function parseSpecialOrderLine(line: string, vendor: Vendor): SpecialOrder | null {
  const tokens = line.split(/\s+/);
  if (!/^[A-Z0-9]{2,8}$/.test(tokens[0])) return null;
  
  const dates = line.match(/\d{2}\/\d{2}\/\d{2}/g) || [];
  if (dates.length === 0) return null;
  
  const poMatch = line.match(/\b(\d{5})\b/);
  const status = line.includes('*DOQ*') ? '*DOQ*' : 
                 line.includes('Ready') ? 'Ready' : 'Order';
  
  return {
    prodNo: tokens[0],
    // ... extract other fields
    status,
    poNumber: poMatch ? poMatch[1] : null,
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName
  };
}
```

---

## FRONTEND UI

### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│  📁 Upload PDF                                    [Export ▼] [Print]│
├─────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 🚨 ACTION REQUIRED: 25 POs Need Attention                     │  │
│  │    14,631 cases at risk • 2 OVERDUE • 4 due TODAY            │  │
│  │    Missing EDI confirmation or appointment - call vendors now │  │
│  │                                          [View & Call List]   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  TOTAL   │ │ ATTENTION│ │ CRITICAL │ │  WATCH   │ │  REVIEW  │  │
│  │  1,478   │ │   125    │ │    42    │ │    40    │ │   564    │  │
│  │  items   │ │  ≤5 days │ │  ≤2 days │ │  medium  │ │   low    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 🚚 PURCHASE ORDERS: 89 Open | 50,857 Cases | 44 This Week   │  │
│  │    Ready: 146 | On Order: 267 | Pending: 1                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│ [Attention] [Critical] [Watch List] [Needs Review] [Purchase Orders]│
│ [🚨 Call List]                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  🔍 Search: [________________]  Group by: [Vendor ▼]               │
├─────────────────────────────────────────────────────────────────────┤
│  ▼ FRITO LAY (00001740) - 12 items                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Prod#  │ Brand  │ Description      │ Avail │ Sply │ Status │   │
│  │ 26228  │ FRITO  │ CHIP CORN REG    │   12  │  1   │ 🔴 CRIT│   │
│  │ 73266  │ MSVICK │ CHIP PTO KTL     │   19  │  1   │ 🔴 CRIT│   │
│  │ J1836  │ LAYS   │ CHIP S/CRM ONN   │    2  │  2   │ 🔴 CRIT│   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ▶ SHEARER'S FOODS (00001145) - 8 items                            │
│  ▶ SAPUTO DAIRY (00001480) - 6 items                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Summary Cards Component
```jsx
function SummaryCards({ stats, poStats }) {
  return (
    <div className="grid grid-cols-5 gap-4 mb-4">
      <Card title="Total Items" value={stats.totalItems} color="gray" />
      <Card title="Attention" value={stats.attentionCount} color="yellow" subtitle="≤5 days" />
      <Card title="Critical" value={stats.criticalCount} color="red" subtitle="≤2 days" />
      <Card title="Watch List" value={stats.watchListCount} color="orange" subtitle="medium conf" />
      <Card title="Needs Review" value={stats.lowConfidenceCount} color="gray" subtitle="verify" />
    </div>
  );
}
```

### PO Summary Banner
```jsx
function POSummaryBanner({ poStats, onClick }) {
  return (
    <div 
      onClick={onClick}
      className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 cursor-pointer hover:bg-blue-100"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <TruckIcon className="w-6 h-6 text-blue-600" />
            <span className="font-semibold text-blue-800">Purchase Orders</span>
          </div>
          <div className="flex gap-6 text-sm">
            <span><strong>{poStats.totalPOs}</strong> Open POs</span>
            <span><strong>{poStats.totalCases.toLocaleString()}</strong> Cases</span>
            <span><strong>{poStats.thisWeekArrivals}</strong> This Week</span>
          </div>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-green-600">✓ Ready: {poStats.readyCount}</span>
          <span className="text-yellow-600">⏳ On Order: {poStats.doqCount}</span>
        </div>
      </div>
    </div>
  );
}
```

### 🚨 ACTION REQUIRED Banner (CRITICAL - Show at top when urgent POs exist)
```jsx
function ActionRequiredBanner({ urgentPOs, onViewDetails }) {
  if (urgentPOs.length === 0) return null;
  
  const totalCases = urgentPOs.reduce((sum, po) => sum + po.totalCases, 0);
  const overdue = urgentPOs.filter(po => po.daysUntilDue < 0);
  const today = urgentPOs.filter(po => po.daysUntilDue === 0);
  
  return (
    <div className="bg-red-50 border-2 border-red-400 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-red-500 text-white p-2 rounded-full">
            <PhoneIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-red-800 text-lg">
              🚨 ACTION REQUIRED: {urgentPOs.length} POs Need Attention
            </h3>
            <p className="text-red-600 text-sm">
              {totalCases.toLocaleString()} cases at risk • 
              {overdue.length > 0 && ` ${overdue.length} OVERDUE •`}
              {today.length > 0 && ` ${today.length} due TODAY •`}
              {' '}Missing EDI confirmation or appointment - call vendors now
            </p>
          </div>
        </div>
        <button 
          onClick={onViewDetails}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 font-semibold"
        >
          View & Call List
        </button>
      </div>
    </div>
  );
}
```

### Urgent PO Call List (Expandable section or modal)
```jsx
function UrgentPOCallList({ urgentPOs }) {
  // Sort: overdue first, then by days until due
  const sorted = [...urgentPOs].sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  
  // Group by vendor for efficient calling
  const byVendor = groupBy(sorted, 'vendorName');
  
  return (
    <div className="bg-white border rounded-lg shadow-lg p-4">
      <h2 className="text-xl font-bold text-red-800 mb-4 flex items-center gap-2">
        <PhoneIcon className="w-6 h-6" />
        Call List - Vendors to Contact
      </h2>
      
      {Object.entries(byVendor).map(([vendor, pos]) => {
        const totalCases = pos.reduce((s, p) => s + p.totalCases, 0);
        const mostUrgent = pos[0];  // Already sorted
        
        return (
          <div key={vendor} className="mb-4 border-b pb-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">{vendor}</h3>
                <p className="text-sm text-gray-600">Vendor ID: {pos[0].vendorId}</p>
              </div>
              <div className="text-right">
                <span className={`px-2 py-1 rounded text-sm font-semibold ${
                  mostUrgent.daysUntilDue < 0 ? 'bg-red-600 text-white' :
                  mostUrgent.daysUntilDue === 0 ? 'bg-orange-500 text-white' :
                  'bg-yellow-400 text-yellow-900'
                }`}>
                  {mostUrgent.daysUntilDue < 0 ? `${Math.abs(mostUrgent.daysUntilDue)} DAYS OVERDUE` :
                   mostUrgent.daysUntilDue === 0 ? 'DUE TODAY' :
                   `Due in ${mostUrgent.daysUntilDue} days`}
                </span>
              </div>
            </div>
            
            <table className="w-full mt-2 text-sm">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left">PO#</th>
                  <th className="text-left">Due Date</th>
                  <th className="text-right">Cases</th>
                  <th className="text-left">Issues</th>
                </tr>
              </thead>
              <tbody>
                {pos.map(po => (
                  <tr key={po.poNumber} className="border-t">
                    <td className="font-mono py-1">{po.poNumber}</td>
                    <td>{po.dueDate}</td>
                    <td className="text-right">{po.totalCases.toLocaleString()}</td>
                    <td>
                      {po.urgentReasons.map(reason => (
                        <span key={reason} className="inline-block bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs mr-1">
                          {reason}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="mt-2 text-sm text-gray-600">
              <strong>Total:</strong> {pos.length} PO(s), {totalCases.toLocaleString()} cases
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### Row Styling
```jsx
function getRowStyle(item: ParsedItem) {
  if (item.confidence === 'low') {
    return 'bg-gray-100 text-gray-600';
  }
  if (item.daysSply !== null && item.daysSply <= 2) {
    return 'bg-red-100 text-red-900 font-semibold';
  }
  if (item.daysSply !== null && item.daysSply <= 5) {
    return 'bg-yellow-50';
  }
  return '';
}

function StatusBadge({ item }: { item: ParsedItem }) {
  if (item.confidence === 'low') {
    return <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs">Review</span>;
  }
  if (item.daysSply !== null && item.daysSply <= 2) {
    return <span className="px-2 py-1 bg-red-500 text-white rounded text-xs">CRITICAL</span>;
  }
  if (item.daysSply !== null && item.daysSply <= 5) {
    return <span className="px-2 py-1 bg-yellow-400 text-yellow-900 rounded text-xs">Low Stock</span>;
  }
  return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">OK</span>;
}
```

### Purchase Orders Tab
```jsx
function PurchaseOrdersTab({ purchaseOrders, specialOrders }) {
  const [view, setView] = useState<'pos' | 'special'>('pos');
  
  // Group POs by due date
  const posByDate = groupBy(purchaseOrders, 'dueDate');
  
  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setView('pos')} 
          className={view === 'pos' ? 'bg-blue-600 text-white' : 'bg-gray-200'}>
          Open POs ({purchaseOrders.length})
        </button>
        <button onClick={() => setView('special')}
          className={view === 'special' ? 'bg-blue-600 text-white' : 'bg-gray-200'}>
          Special Orders ({specialOrders.length})
        </button>
      </div>
      
      {view === 'pos' ? (
        <div>
          {Object.entries(posByDate).map(([date, pos]) => (
            <div key={date} className="mb-4">
              <h3 className="font-semibold bg-gray-100 p-2">
                📅 Due: {date} ({pos.length} POs, {sum(pos, 'totalCases').toLocaleString()} cases)
              </h3>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-600">
                    <th>PO#</th><th>Vendor</th><th>Cases</th><th>Status</th><th>Appointment</th>
                  </tr>
                </thead>
                <tbody>
                  {pos.map(po => (
                    <tr key={po.poNumber} className="border-b">
                      <td className="font-mono">{po.poNumber}</td>
                      <td>{po.vendorName}</td>
                      <td className="text-right">{po.totalCases.toLocaleString()}</td>
                      <td>{po.status}</td>
                      <td>{po.appointment || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <SpecialOrdersTable orders={specialOrders} />
      )}
    </div>
  );
}
```

### Special Orders Table
```jsx
function SpecialOrdersTable({ orders }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="text-left text-sm text-gray-600 bg-gray-50">
          <th>Prod#</th><th>Description</th><th>Customer</th>
          <th>Qty</th><th>On Hand</th><th>Status</th><th>PO#</th><th>Due</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((so, i) => (
          <tr key={i} className="border-b">
            <td className="font-mono">{so.prodNo}</td>
            <td>{so.description}</td>
            <td className="text-sm">{so.customerName}</td>
            <td className="text-right">{so.qtyOrdered}</td>
            <td className="text-right">{so.onHand}</td>
            <td>
              <span className={
                so.status === 'Ready' ? 'text-green-600' :
                so.status === '*DOQ*' ? 'text-yellow-600' : 'text-gray-500'
              }>
                {so.status === '*DOQ*' ? 'On Order' : so.status}
              </span>
            </td>
            <td className="font-mono text-sm">{so.poNumber || '-'}</td>
            <td>{so.dateDue || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## EXPORTS

### Excel Export (6 sheets)
```javascript
function exportToExcel(data: ParseResponse) {
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: 🚨 URGENT POs - CALL LIST (First sheet - most important!)
  const urgentPOs = data.purchaseOrders
    .filter(po => po.isUrgent)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    .map(po => ({
      'Vendor': po.vendorName,
      'Vendor ID': po.vendorId,
      'PO#': po.poNumber,
      'Due Date': po.dueDate,
      'Days Until Due': po.daysUntilDue,
      'Cases': po.totalCases,
      'EDI Confirmed': po.edi ? 'Yes' : 'NO',
      'Appointment': po.appointment || 'NONE',
      'Issues': po.urgentReasons.join(', '),
      'Status': po.status
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(urgentPOs), '🚨 CALL LIST');
  
  // Sheet 2: Attention Items (HIGH confidence, Sply ≤ 5)
  const attention = data.items.filter(i => 
    i.confidence === 'high' && i.daysSply !== null && i.daysSply <= 5
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attention), 'Attention');
  
  // Sheet 3: Critical Items (HIGH confidence, Sply ≤ 2)
  const critical = attention.filter(i => i.daysSply <= 2);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(critical), 'Critical');
  
  // Sheet 4: Watch List (MEDIUM confidence, Sply ≤ 5)
  const watchList = data.items.filter(i => 
    i.confidence === 'medium' && i.daysSply !== null && i.daysSply <= 5
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(watchList), 'Watch List');
  
  // Sheet 5: All Purchase Orders
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.purchaseOrders), 'All POs');
  
  // Sheet 6: Special Orders
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.specialOrders), 'Special Orders');
  
  XLSX.writeFile(wb, `sues-buying-guide-${formatDate(new Date())}.xlsx`);
}
```

### Email Summary
```javascript
function generateEmailSummary(data: ParseResponse): string {
  const { stats, poStats, items, purchaseOrders } = data;
  
  const critical = items.filter(i => 
    i.confidence === 'high' && i.daysSply !== null && i.daysSply <= 2
  );
  
  const urgentPOs = purchaseOrders.filter(po => po.isUrgent);
  const urgentByVendor = groupBy(urgentPOs, 'vendorName');
  
  // Group critical by vendor
  const byVendor = groupBy(critical, 'vendorName');
  
  // Group POs by due date
  const nextPOs = purchaseOrders
    .filter(po => !po.isUrgent)  // Non-urgent POs
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 10);
  
  return `
SUE'S BUYING GUIDE - DAILY REPORT
Generated: ${new Date().toLocaleString()}

${urgentPOs.length > 0 ? `
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
ACTION REQUIRED - CALL THESE VENDORS NOW
${urgentPOs.length} POs missing EDI confirmation or appointment
${urgentPOs.reduce((s, p) => s + p.totalCases, 0).toLocaleString()} cases at risk
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨

${Object.entries(urgentByVendor).map(([vendor, pos]) => `
📞 ${vendor} (${pos[0].vendorId})
${pos.map(po => {
  const urgency = po.daysUntilDue < 0 ? '⛔ OVERDUE' : 
                  po.daysUntilDue === 0 ? '🔴 TODAY' : 
                  `⚠️ ${po.daysUntilDue} days`;
  return `   PO# ${po.poNumber} | Due: ${po.dueDate} ${urgency} | ${po.totalCases.toLocaleString()} cases
   Issues: ${po.urgentReasons.join(', ')}`;
}).join('\n')}
`).join('')}
` : '✅ No urgent POs requiring immediate attention\n'}
═══════════════════════════════════════════════════════════════
INVENTORY SUMMARY
───────────────────────────────────────────────────────────────
  🔴 CRITICAL (≤2 days):     ${stats.criticalCount} items
  🟡 ATTENTION (≤5 days):    ${stats.attentionCount} items
  🟠 WATCH LIST (medium):    ${stats.watchListCount} items
  ⚪ NEEDS REVIEW:           ${stats.lowConfidenceCount} items

═══════════════════════════════════════════════════════════════
PURCHASE ORDERS
───────────────────────────────────────────────────────────────
  📦 Open POs:        ${poStats.totalPOs}
  📦 Total Cases:     ${poStats.totalCases.toLocaleString()}
  📦 This Week:       ${poStats.thisWeekArrivals} arrivals
  🚨 Urgent (call):   ${poStats.urgentPOCount}

  Special Orders:
    ✅ Ready:         ${poStats.readyCount}
    ⏳ On Order:      ${poStats.doqCount}
    📝 Pending:       ${poStats.pendingCount}

═══════════════════════════════════════════════════════════════
CRITICAL ITEMS BY VENDOR
───────────────────────────────────────────────────────────────
${Object.entries(byVendor).map(([vendor, vendorItems]) => `
${vendor}
${vendorItems.map(item => `  • ${item.prodNo} - ${item.description}
    Avail: ${item.avail ?? '?'} | On Order: ${item.onOrder ?? '-'} | Days: ${item.daysSply} ⚠️`).join('\n')}
`).join('')}

═══════════════════════════════════════════════════════════════
CONFIRMED ARRIVALS (next 10)
───────────────────────────────────────────────────────────────
${nextPOs.map(po => `  ${po.dueDate}: PO# ${po.poNumber} - ${po.vendorName} (${po.totalCases.toLocaleString()} cases)`).join('\n')}
`.trim();
}
```

---

## FILE STRUCTURE

```
/sues-buying-guide
├── package.json
├── /server
│   ├── package.json
│   ├── tsconfig.json
│   └── /src
│       ├── index.ts              # Express server
│       ├── /routes
│       │   └── parse.ts          # POST /api/parse
│       ├── /services
│       │   ├── pdfParser.ts      # Main parser
│       │   ├── itemParser.ts     # Item line parsing
│       │   └── poParser.ts       # PO parsing
│       └── /types
│           └── index.ts
├── /client
│   ├── package.json
│   ├── vite.config.ts
│   └── /src
│       ├── App.tsx
│       ├── /components
│       │   ├── FileUpload.tsx
│       │   ├── SummaryCards.tsx
│       │   ├── POSummaryBanner.tsx
│       │   ├── ItemTable.tsx
│       │   ├── VendorGroup.tsx
│       │   ├── PurchaseOrdersTab.tsx
│       │   ├── SpecialOrdersTable.tsx
│       │   └── ExportButtons.tsx
│       ├── /hooks
│       │   └── useParseResults.ts
│       ├── /utils
│       │   ├── exportUtils.ts
│       │   └── emailSummary.ts
│       └── /types
│           └── index.ts
└── README.md
```

---

## BACKEND API

### POST /api/parse
```typescript
// Request: multipart/form-data with "file" field
// Response: ParseResponse

router.post('/parse', upload.single('file'), async (req, res) => {
  try {
    const buffer = req.file.buffer;
    
    // Extract text (try pdf-parse, fallback to pdfjs-dist)
    let text = await extractText(buffer);
    
    // Validate
    if (!text.includes('Inventory Order Report')) {
      return res.status(400).json({ error: 'Invalid PDF format' });
    }
    
    // Parse everything
    const { items, purchaseOrders, specialOrders } = parseAll(text);
    
    // Calculate stats
    const stats = calculateStats(items);
    const poStats = calculatePOStats(purchaseOrders, specialOrders);
    
    res.json({ items, purchaseOrders, specialOrders, stats, poStats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## KEY GUARDRAILS (NEVER VIOLATE)

1. **Days Supply = last numeric before LndCst** - This is 99% accurate, verified against real data
2. **Parse RIGHT-TO-LEFT** - The tail (IP, Slot, MrkCst, LndCst) is always reliable
3. **7+ columns = HIGH confidence** - Don't be overly conservative
4. **5-6 columns = MEDIUM confidence** - Show in Watch List, not Needs Review
5. **S/O items with 7+ columns ARE actionable** - Don't blanket-reject them
6. **Always show PO data** - Buyers need to see what's coming in
7. **Group by vendor** - This is how buyers think
8. **Color-code by urgency** - Red=critical, Yellow=attention, Orange=watch, Gray=review

### URGENT PO RULES (Critical for Sue)
9. **Urgent PO = due within 5 days AND (no EDI OR no appointment)**
10. **Show ACTION REQUIRED banner at TOP when urgent POs exist** - This is the first thing Sue needs to see
11. **Sort urgent POs by days until due** - Overdue first, then today, then upcoming
12. **Group urgent POs by vendor** - So Sue can make one call per vendor
13. **Call List is the FIRST Excel sheet** - Most important data first
14. **Include vendor ID** - Sue needs this to look up phone numbers
15. **Show exactly what's missing** - "No EDI confirmation" or "No appointment" or both
