import React, { useState, useMemo } from 'react';
import { PurchaseOrder, SpecialOrder } from '../types';

interface PurchaseOrdersTabProps {
  purchaseOrders: PurchaseOrder[];
  specialOrders: SpecialOrder[];
}

type ViewType = 'pos' | 'special';

// Group POs by due date
function groupByDueDate(pos: PurchaseOrder[]): Record<string, PurchaseOrder[]> {
  return pos.reduce(
    (acc, po) => {
      const key = po.dueDate;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(po);
      return acc;
    },
    {} as Record<string, PurchaseOrder[]>
  );
}

// Sort due dates chronologically
function sortDueDates(dates: string[]): string[] {
  return dates.sort((a, b) => {
    // Parse MM/DD/YY format
    const parseDate = (d: string) => {
      const [month, day, year] = d.split('/').map(Number);
      return new Date(2000 + year, month - 1, day).getTime();
    };
    return parseDate(a) - parseDate(b);
  });
}

export const PurchaseOrdersTab: React.FC<PurchaseOrdersTabProps> = ({
  purchaseOrders,
  specialOrders,
}) => {
  const [view, setView] = useState<ViewType>('pos');

  const posByDate = useMemo(() => groupByDueDate(purchaseOrders), [purchaseOrders]);
  const sortedDates = useMemo(() => sortDueDates(Object.keys(posByDate)), [posByDate]);

  return (
    <div className="purchase-orders-tab">
      <div className="view-toggle">
        <button
          className={`toggle-btn ${view === 'pos' ? 'active' : ''}`}
          onClick={() => setView('pos')}
        >
          Open POs ({purchaseOrders.length})
        </button>
        <button
          className={`toggle-btn ${view === 'special' ? 'active' : ''}`}
          onClick={() => setView('special')}
        >
          Special Orders ({specialOrders.length})
        </button>
      </div>

      {view === 'pos' ? (
        <div className="pos-view">
          {sortedDates.length === 0 ? (
            <p className="empty-message">No open purchase orders.</p>
          ) : (
            sortedDates.map((date) => {
              const pos = posByDate[date];
              const totalCases = pos.reduce((sum, po) => sum + po.totalCases, 0);

              return (
                <div key={date} className="date-group">
                  <div className="date-header">
                    <span className="date-icon">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </span>
                    Due: {date} ({pos.length} PO{pos.length !== 1 ? 's' : ''},{' '}
                    {totalCases.toLocaleString()} cases)
                  </div>
                  <table className="po-table">
                    <thead>
                      <tr>
                        <th>PO#</th>
                        <th>Vendor</th>
                        <th className="text-right">Cases</th>
                        <th>Status</th>
                        <th>EDI</th>
                        <th>Appointment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pos.map((po) => (
                        <tr key={po.poNumber} className={po.isUrgent ? 'urgent-row' : ''}>
                          <td className="po-number">{po.poNumber}</td>
                          <td className="vendor-name">{po.vendorName}</td>
                          <td className="text-right">{po.totalCases.toLocaleString()}</td>
                          <td className="status">{po.status}</td>
                          <td className={`edi ${po.edi ? 'confirmed' : 'missing'}`}>
                            {po.edi ? 'Yes' : po.edi === false ? 'No' : '-'}
                          </td>
                          <td className={`appointment ${po.appointment ? '' : 'missing'}`}>
                            {po.appointment || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="special-orders-view">
          {specialOrders.length === 0 ? (
            <p className="empty-message">No special orders.</p>
          ) : (
            <table className="special-orders-table">
              <thead>
                <tr>
                  <th>Prod#</th>
                  <th>Description</th>
                  <th>Customer</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">On Hand</th>
                  <th>Status</th>
                  <th>PO#</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {specialOrders.map((so, idx) => (
                  <tr key={`${so.prodNo}-${idx}`}>
                    <td className="prod-no">{so.prodNo}</td>
                    <td className="description">{so.description}</td>
                    <td className="customer">{so.customerName || so.custNo}</td>
                    <td className="text-right">{so.qtyOrdered}</td>
                    <td className="text-right">{so.onHand}</td>
                    <td>
                      <span
                        className={`status-badge ${
                          so.status === 'Ready'
                            ? 'ready'
                            : so.status === '*DOQ*'
                              ? 'doq'
                              : 'pending'
                        }`}
                      >
                        {so.status === '*DOQ*' ? 'On Order' : so.status}
                      </span>
                    </td>
                    <td className="po-number">{so.poNumber || '-'}</td>
                    <td>{so.dateDue || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
