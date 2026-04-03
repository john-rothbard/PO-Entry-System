import { useState, useEffect, useCallback } from 'react';
import { api, isConfigured, loadConfig, saveConfig as persistConfig, exportConfigFile, importConfigFile } from './api';
import { initGoogleAuth, signIn, signOut, isSignedIn, getUser, tryRestoreSession, scheduleTokenRefresh } from './auth';
import { DEFAULT_CONFIG } from './config';
import { globalCSS, Icons, Badge, Button, Card, Toast } from './components';
import AdminPanel from './AdminPanel';
import POForm from './POForm';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function App() {
  const [config, setConfig] = useState(() => loadConfig() || DEFAULT_CONFIG);
  const configured = isConfigured();
  const [signedIn, setSignedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [toast, setToast] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('po_theme') || 'dark');
  const [sessionWarning, setSessionWarning] = useState(false);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
  }, []);

  // Persist config on change
  useEffect(() => { persistConfig(config); }, [config]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('po_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => t === 'dark' ? 'light' : 'dark');

  const startRefreshSchedule = () => {
    scheduleTokenRefresh(CLIENT_ID, {
      onExpiringSoon: () => setSessionWarning(true),
      onRefreshed: (u) => { setUser(u); setSessionWarning(false); },
      onExpired: () => {
        setSessionWarning(false);
        showToast('Session expired. Please sign in again.', 'warning');
        signOut();
        setSignedIn(false);
        setUser(null);
      },
    });
  };

  // Initialize Google auth on mount + restore session
  useEffect(() => {
    if (!configured) return;
    initGoogleAuth(CLIENT_ID).then(() => {
      if (tryRestoreSession()) {
        setSignedIn(true);
        setUser(getUser());
        startRefreshSchedule();
      }
    }).catch(() => {});
  }, [configured]);

  const handleSignIn = async () => {
    setAuthLoading(true);
    try {
      await signIn(CLIENT_ID);
      setSignedIn(true);
      setUser(getUser());
      setSessionWarning(false);
      startRefreshSchedule();
    } catch (err) {
      if (err.message === 'SHOW_BUTTON') {
        // One-tap was suppressed — show a message to use the button
        showToast('Click the Google Sign-In button to continue.', 'warning');
      } else {
        showToast('Sign-in failed: ' + err.message, 'error');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = () => {
    signOut();
    setSignedIn(false);
    setUser(null);
  };

  const handleSetConfig = (updater) => {
    setConfig((prev) => typeof updater === 'function' ? updater(prev) : updater);
  };

  const handleSubmitOrder = async (payload, retailer) => {
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
      const stores = Array.isArray(data.stores) ? data.stores : [];
      showToast(`Found ${stores.length} stores. Check browser console (F12) for details.`);
      console.log('=== ShipStation Stores ===');
      console.table(stores.map((s) => ({ storeId: s.storeId, name: s.storeName, marketplace: s.marketplaceName })));
    } catch (err) {
      showToast(`Could not fetch stores: ${err.message}`, "error");
    }
  };

  const handleTestConnection = async () => {
    try {
      const res = await api.testConnection();
      showToast(res.message || 'Connected!');
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

  // ── Not configured ────────────────────────────────────────
  if (!configured) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{globalCSS}</style>
        <Card style={{ maxWidth: 480, width: "100%", margin: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Setup Required</h2>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            The <code style={{ fontFamily: "var(--mono)", background: "var(--bg-input)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>.env</code> file is missing or incomplete.
            Add <code style={{ fontFamily: "var(--mono)", background: "var(--bg-input)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>VITE_GAS_URL</code> and{' '}
            <code style={{ fontFamily: "var(--mono)", background: "var(--bg-input)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>VITE_GOOGLE_CLIENT_ID</code> then restart the dev server.
          </p>
        </Card>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    );
  }

  // ── Sign-in screen ────────────────────────────────────────
  if (!signedIn) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <style>{globalCSS}</style>
        <div style={{ position: "absolute", top: 16, right: 16 }}>
          <Button variant="ghost" size="sm" onClick={toggleTheme}
            icon={theme === 'dark' ? <Icons.sun size={16} /> : <Icons.moon size={16} />}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </Button>
        </div>
        <Card style={{ maxWidth: 400, width: "100%", margin: 24, textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "var(--radius)", background: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 22, color: "#fff", margin: "0 auto 16px",
          }}>PO</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>PO Entry System</h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 28 }}>
            Sign in with your <strong>@honeydewsleep.com</strong> account to continue.
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={handleSignIn}
            disabled={authLoading}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {authLoading ? 'Signing in...' : 'Sign in with Google'}
          </Button>
        </Card>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    );
  }

  // ── Main app ──────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <style>{globalCSS}</style>

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
          <Badge variant="success">Connected</Badge>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button variant="ghost" size="sm" onClick={toggleTheme}
            icon={theme === 'dark' ? <Icons.sun size={16} /> : <Icons.moon size={16} />}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleTestConnection} icon={<Icons.server size={16} />}>
            Test Connection
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport} icon={<Icons.download size={16} />}>Export</Button>
          <Button variant="ghost" size="sm" onClick={handleImport} icon={<Icons.upload size={16} />}>Import</Button>
          <Button variant="secondary" size="sm" onClick={() => setShowAdmin(true)} icon={<Icons.settings size={16} />}>Config</Button>
          <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 4px" }} />
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{user?.name || user?.email}</div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>Sign out</Button>
        </div>
      </header>

      {sessionWarning && (
        <div style={{
          padding: "10px 24px", background: "var(--warning-bg)", borderBottom: "1px solid var(--warning)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          fontSize: 13, fontWeight: 500, color: "var(--warning)",
        }}>
          <Icons.alert size={14} color="var(--warning)" />
          Session expiring soon — refreshing automatically. If sign-in appears, please re-authenticate.
        </div>
      )}

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
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
                    <Badge variant={o.status === "success" ? "success" : "danger"}>
                      {o.status === "success" ? "Sent" : "Error"}
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

        <POForm config={config} onSubmit={handleSubmitOrder} />
      </main>

      {showAdmin && (
        <AdminPanel
          config={config}
          setConfig={handleSetConfig}
          onClose={() => setShowAdmin(false)}
          onFetchStores={handleFetchStores}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
