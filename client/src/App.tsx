import { useState, useCallback, useMemo } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { Upload } from './components/Upload';
import { Dashboard } from './components/Dashboard';
import { ItemTable } from './components/ItemTable';
import { ExportButtons } from './components/ExportButtons';
import { ActionRequiredBanner } from './components/ActionRequiredBanner';
import { POSummaryBanner } from './components/POSummaryBanner';
import { CallList } from './components/CallList';
import { PurchaseOrdersTab } from './components/PurchaseOrdersTab';
import { ParseResponse, TabType } from './types';

function AppContent() {
  const { user, loading, signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ParseResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('attention');
  const [showCallList, setShowCallList] = useState(false);

  // Calculate urgent POs
  const urgentPOs = useMemo(() => {
    if (!data?.purchaseOrders) return [];
    return data.purchaseOrders.filter(po => po.isUrgent);
  }, [data?.purchaseOrders]);

  // All hooks must be called before any conditional returns
  const handleUpload = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    setData(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to parse PDF');
      }

      const result: ParseResponse = await response.json();
      setData(result);

      // Auto-select appropriate tab based on results
      if (result.stats.criticalCount > 0) {
        setActiveTab('critical');
      } else if (result.stats.attentionCount > 0) {
        setActiveTab('attention');
      } else if (result.stats.needsReviewCount > 0) {
        setActiveTab('review');
      } else {
        setActiveTab('all');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    setData(null);
    setError(null);
    setActiveTab('attention');
    setShowCallList(false);
  }, []);

  const handleViewCallList = useCallback(() => {
    setShowCallList(true);
    setActiveTab('calllist');
  }, []);

  const handleViewPOs = useCallback(() => {
    setActiveTab('pos');
  }, []);

  // Show loading screen while checking auth
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return <Login />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Sue's Buying Guide</h1>
        <p className="subtitle">Inventory Order Report Analyzer</p>
        <div className="user-info">
          <span>{user.email}</span>
          <button type="button" className="btn-signout" onClick={signOut}>
            Sign Out
          </button>
        </div>
        {data && (
          <button type="button" className="btn btn-reset" onClick={handleReset}>
            Upload New Report
          </button>
        )}
      </header>

      <main className="app-main">
        {!data ? (
          <>
            <div className="intro">
              <p>
                Upload your daily Inventory Order Report PDF to identify items that need attention.
              </p>
              <ul className="features">
                <li><strong>Critical items:</strong> 2 days or less supply</li>
                <li><strong>Attention items:</strong> 5 days or less supply</li>
                <li><strong>Review items:</strong> Items that couldn't be parsed with high confidence</li>
              </ul>
            </div>
            <Upload onUpload={handleUpload} isLoading={isLoading} />
            {error && (
              <div className="error-message">
                <strong>Error:</strong> {error}
                <button type="button" className="btn-dismiss" onClick={() => setError(null)}>×</button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Action Required Banner - Show at TOP when urgent POs exist */}
            {urgentPOs.length > 0 && (
              <ActionRequiredBanner
                urgentPOs={urgentPOs}
                onViewDetails={handleViewCallList}
              />
            )}

            {/* PO Summary Banner */}
            {data.poStats && data.poStats.totalPOs > 0 && (
              <POSummaryBanner
                poStats={data.poStats}
                onClick={handleViewPOs}
              />
            )}

            <Dashboard
              stats={data.stats}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />

            {data.parseErrors.length > 0 && (
              <div className="parse-warnings">
                <details>
                  <summary>
                    Parse Warnings ({data.parseErrors.length})
                  </summary>
                  <ul>
                    {data.parseErrors.slice(0, 20).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {data.parseErrors.length > 20 && (
                      <li>...and {data.parseErrors.length - 20} more</li>
                    )}
                  </ul>
                </details>
              </div>
            )}

            <ExportButtons
              items={data.items}
              activeTab={activeTab}
              purchaseOrders={data.purchaseOrders}
              specialOrders={data.specialOrders}
              poStats={data.poStats}
            />

            {/* Render content based on active tab */}
            {activeTab === 'calllist' && showCallList && (
              <CallList
                urgentPOs={urgentPOs}
                onClose={() => {
                  setShowCallList(false);
                  setActiveTab('attention');
                }}
              />
            )}
            {activeTab === 'pos' && (
              <PurchaseOrdersTab
                purchaseOrders={data.purchaseOrders || []}
                specialOrders={data.specialOrders || []}
              />
            )}
            {activeTab !== 'calllist' && activeTab !== 'pos' && (
              <ItemTable items={data.items} activeTab={activeTab} />
            )}
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>
          Performance Foodservice Shawano | Built for Sue's Daily Buying Operations
        </p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
