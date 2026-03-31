import { useState, useEffect, useCallback } from 'react';
import { api, isConfigured, loadConfig, saveConfig as persistConfig, exportConfigFile, importConfigFile } from './api';
import { DEFAULT_CONFIG } from './config';
import { globalCSS, Icons, Badge, Button, Card, Toast } from './components';
import AdminPanel from './AdminPanel';
import POForm from './POForm';

export default function App() {
  const [config, setConfig] = useState(() => loadConfig() || DEFAULT_CONFIG);
  const [connected, setConnected] = useState(isConfigured());
  const [showAdmin, setShowAdmin] = useState(false);
  const [toast, setToast] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [connectionTested, setConnectionTested] = useState(false);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
  }, []);

  // Persist config on change
  useEffect(() => { persistConfig(config); }, [config]);

  // Test connection on mount if configured
  useEffect(() => {
    if (connected && !connectionTested) {
      api.testConnection()
        .then((res) => {
          setConnectionTested(true);
          console.log('ShipStation connection verified:', res.message);
        })
        .catch((err) => {
          console.warn('ShipStation connection test failed:', err.message);
          setConnectionTested(true);
        });
    }
  }, [connected, connectionTested]);

  const handleSetConfig = (updater) => {
    setConfig((prev) => typeof updater === 'function' ? updater(prev) : updater);
  };

  // ── Submit order ──────────────────────────────────────────
  const handleSubmitOrder = async (payload, retailer) => {
    if (!connected) {
      setRecentOrders((prev) => [...prev, {
        retailer: retailer?.name, poNumber: payload.orderNumber,
        status: "demo", timestamp: new Date().toLocaleTimeString(),
      }]);
      showToast(`Demo: Order ${payload.orderNumber} validated. Configure .env to send to ShipStation.`, "warning");
      return;
    }

    try {
      const result = await api.createOrder(payload);
      setRecentOrders((prev) => [...prev, {
        retailer: retailer?.name, poNumber: payload.orderNumber,
        status: "success", timestamp: new Date().toLocaleTimeString(),
        shipStationOrderId: result.orderId,
      }]);
      showToast(`Order ${payload.orderNumber} submitted! (ShipStation ID: ${result.orderId})`);
    } catch (err) {
      setRecentOrders((prev) => [...prev, {
        retailer: retailer?.name, poNumber: payload.orderNumber,
        status: "error", timestamp: new Date().toLocaleTimeString(), error: err.message,
      }]);
      showToast(`Error: ${err.message}`, "error");
      throw err;
    }
  };

  const handleFetchStores = async () => {
    try {
      const data = await api.getStores();
      const stores = data.stores || [];
      const list = Array.isArray(stores) ? stores : [];
      showToast(`Found ${list.length} stores. Check browser console (F12) for details.`);
      console.log('=== ShipStation Stores ===');
      console.table(list.map((s) => ({ storeId: s.storeId, name: s.storeName, marketplace: s.marketplaceName })));
    } catch (err) {
      showToast(`Could not fetch stores: ${err.message}`, "error");
    }
  };

  const handleTestConnection = async () => {
    try {
      const res = await api.testConnection();
      showToast(res.message || 'Connected!');
      setConnectionTested(true);
    } catch (err) {
      showToast(`Connection failed: ${err.message}`, "error");
    }
  };

  const handleExport = () => { exportConfigFile(config); showToast("Config exported!"); };
  const handleImport = async () => {
    try {
      const imported = await importConfigFile();
      setConfig(imported);
      showToast("Config imported!");
    } catch (err) { showToast(err.message, "error"); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <style>{globalCSS}</style>

      {/* HEADER */}
      <header style={{
        padding: "14px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg-card)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "var(--radius)", background: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: "#fff",
          }}>PO</div>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>PO Entry System</h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>ShipStation via Google Apps Script</p>
          </div>
          <Badge variant={connected ? "success" : "warning"}>
            {connected ? "Connected" : "Demo Mode"}
          </Badge>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {connected && (
            <Button variant="ghost" size="sm" onClick={handleTestConnection} icon={<Icons.server size={16} />}>
              Test Connection
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleExport} icon={<Icons.download size={16} />}>Export</Button>
          <Button variant="ghost" size="sm" onClick={handleImport} icon={<Icons.upload size={16} />}>Import</Button>
          <Button variant="secondary" size="sm" onClick={() => setShowAdmin(true)} icon={<Icons.settings size={16} />}>Config</Button>
        </div>
      </header>

      {/* SETUP BANNER */}
      {!connected && (
        <div style={{
          maxWidth: 1200, margin: "20px auto 0", padding: "0 24px",
        }}>
          <Card style={{ background: "linear-gradient(135deg, #1a1f2e, var(--bg-card))", border: "1px solid var(--accent)", borderColor: "rgba(79,124,255,0.3)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <Icons.alert color="var(--warning)" /> Setup Required
            </h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
              To send orders to ShipStation, you need to set up the Google Apps Script middleware and configure your <code style={{ fontFamily: "var(--mono)", background: "var(--bg-input)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>.env</code> file.
              See the <strong>SETUP-GUIDE.md</strong> included in this project for step-by-step instructions.
              Until then, the form works in demo mode — everything validates but nothing sends.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
              <div style={{ padding: "6px 12px", background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text-muted)" }}>Step 1:</span> Create Google Sheet + Apps Script
              </div>
              <div style={{ padding: "6px 12px", background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text-muted)" }}>Step 2:</span> Deploy Apps Script as web app
              </div>
              <div style={{ padding: "6px 12px", background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text-muted)" }}>Step 3:</span> Add URL + secret to .env
              </div>
              <div style={{ padding: "6px 12px", background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text-muted)" }}>Step 4:</span> Restart <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>npm run dev</code>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* MAIN */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        {/* Recent Orders */}
        {recentOrders.length > 0 && (
          <Card style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <Icons.clipboard /> Recent Submissions <Badge>{recentOrders.length}</Badge>
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {recentOrders.slice(-8).reverse().map((o, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", borderRadius: "var(--radius)", background: "var(--bg)",
                  border: "1px solid var(--border)", fontSize: 13,
                }}>
                  <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <Badge variant={o.status === "success" ? "success" : o.status === "demo" ? "warning" : "danger"}>
                      {o.status === "success" ? "Sent" : o.status === "demo" ? "Demo" : "Error"}
                    </Badge>
                    <span style={{ fontWeight: 600 }}>{o.retailer}</span>
                    <span style={{ fontFamily: "var(--mono)", color: "var(--text-secondary)" }}>PO# {o.poNumber}</span>
                    {o.shipStationOrderId && (
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)" }}>SS#{o.shipStationOrderId}</span>
                    )}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>{o.timestamp}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <POForm config={config} connected={connected} onSubmit={handleSubmitOrder} />
      </main>

      {/* Admin Modal */}
      {showAdmin && (
        <AdminPanel
          config={config}
          setConfig={handleSetConfig}
          onClose={() => setShowAdmin(false)}
          onFetchStores={connected ? handleFetchStores : null}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
