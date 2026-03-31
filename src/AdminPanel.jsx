import { useState } from 'react';
import { Icons, Badge, Input, Button, Divider } from './components';

export default function AdminPanel({ config, setConfig, onClose, onFetchStores, onFetchProducts }) {
  const [tab, setTab] = useState("retailers");
  const [editingAlias, setEditingAlias] = useState(null);
  const [newRetailer, setNewRetailer] = useState({ name: "", shipStationStoreId: "", salesChannel: "" });
  const [newSku, setNewSku] = useState({ sku: "", name: "", category: "" });
  const [searchTerm, setSearchTerm] = useState("");

  const addRetailer = () => {
    if (!newRetailer.name || !newRetailer.shipStationStoreId) return;
    const id = "ret_" + Date.now();
    setConfig((c) => ({
      ...c,
      retailers: [...c.retailers, { id, ...newRetailer, shipStationStoreId: Number(newRetailer.shipStationStoreId) }],
      retailerAliases: { ...c.retailerAliases, [id]: {} },
    }));
    setNewRetailer({ name: "", shipStationStoreId: "", salesChannel: "" });
  };

  const removeRetailer = (id) => {
    setConfig((c) => ({
      ...c,
      retailers: c.retailers.filter((r) => r.id !== id),
      retailerAliases: Object.fromEntries(Object.entries(c.retailerAliases).filter(([k]) => k !== id)),
    }));
  };

  const addSku = () => {
    if (!newSku.sku || !newSku.name) return;
    setConfig((c) => ({ ...c, masterSkus: [...c.masterSkus, { ...newSku }] }));
    setNewSku({ sku: "", name: "", category: "" });
  };

  const removeSku = (sku) => {
    setConfig((c) => ({
      ...c,
      masterSkus: c.masterSkus.filter((s) => s.sku !== sku),
      retailerAliases: Object.fromEntries(
        Object.entries(c.retailerAliases).map(([rId, aliases]) => [
          rId, Object.fromEntries(Object.entries(aliases).filter(([k]) => k !== sku)),
        ])
      ),
    }));
  };

  const setAlias = (retailerId, sku, alias) => {
    setConfig((c) => ({
      ...c,
      retailerAliases: {
        ...c.retailerAliases,
        [retailerId]: { ...(c.retailerAliases[retailerId] || {}), [sku]: alias },
      },
    }));
  };

  const removeAlias = (retailerId, sku) => {
    setConfig((c) => ({
      ...c,
      retailerAliases: {
        ...c.retailerAliases,
        [retailerId]: Object.fromEntries(
          Object.entries(c.retailerAliases[retailerId] || {}).filter(([k]) => k !== sku)
        ),
      },
    }));
  };

  const filteredSkus = config.masterSkus.filter(
    (s) => s.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tabs = [
    { id: "retailers", label: "Retailers", count: config.retailers.length },
    { id: "skus", label: "Master SKUs", count: config.masterSkus.length },
    { id: "aliases", label: "SKU Aliases", count: Object.values(config.retailerAliases).reduce((a, b) => a + Object.keys(b).length, 0) },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)",
        width: "100%", maxWidth: 900, maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <Icons.settings /> Configuration
          </h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {onFetchStores && (
              <Button variant="ghost" size="sm" onClick={onFetchStores} icon={<Icons.server size={14} />}>
                Fetch Stores from ShipStation
              </Button>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 4 }}>
              <Icons.x size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", padding: "0 24px" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "12px 20px", background: "none", border: "none", cursor: "pointer",
              color: tab === t.id ? "var(--accent)" : "var(--text-secondary)",
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              fontWeight: 500, fontSize: 14, fontFamily: "var(--font)", transition: "all 0.15s",
            }}>
              {t.label}
              <Badge style={{ marginLeft: 8, opacity: tab === t.id ? 1 : 0.5 }}>{t.count}</Badge>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {tab === "retailers" && (
            <div>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, marginBottom: 16,
                padding: 16, background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--border)",
              }}>
                <Input placeholder="Retailer Name" value={newRetailer.name}
                  onChange={(e) => setNewRetailer({ ...newRetailer, name: e.target.value })} />
                <Input placeholder="ShipStation Store ID" type="number" value={newRetailer.shipStationStoreId}
                  onChange={(e) => setNewRetailer({ ...newRetailer, shipStationStoreId: e.target.value })} />
                <Input placeholder="Sales Channel Name" value={newRetailer.salesChannel}
                  onChange={(e) => setNewRetailer({ ...newRetailer, salesChannel: e.target.value })} />
                <Button onClick={addRetailer} icon={<Icons.plus size={16} />} size="sm">Add</Button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {config.retailers.map((r) => (
                  <div key={r.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto",
                    gap: 12, padding: "10px 14px", alignItems: "center",
                    borderRadius: "var(--radius)", background: "var(--bg)", border: "1px solid var(--border)",
                  }}>
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text-secondary)" }}>Store #{r.shipStationStoreId}</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{r.salesChannel}</span>
                    <Button variant="danger" size="sm" onClick={() => removeRetailer(r.id)} icon={<Icons.trash size={14} />} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "skus" && (
            <div>
              <div style={{
                display: "grid", gridTemplateColumns: "150px 1fr 150px auto", gap: 8, marginBottom: 16,
                padding: 16, background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--border)",
              }}>
                <Input placeholder="SKU Code" value={newSku.sku} onChange={(e) => setNewSku({ ...newSku, sku: e.target.value })} />
                <Input placeholder="Product Name" value={newSku.name} onChange={(e) => setNewSku({ ...newSku, name: e.target.value })} />
                <Input placeholder="Category" value={newSku.category} onChange={(e) => setNewSku({ ...newSku, category: e.target.value })} />
                <Button onClick={addSku} icon={<Icons.plus size={16} />} size="sm">Add</Button>
              </div>
              <div style={{ marginBottom: 12, position: "relative" }}>
                <Icons.search size={16} color="var(--text-muted)" style={{ position: "absolute", left: 12, top: 10 }} />
                <input placeholder="Search SKUs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: "100%", padding: "9px 12px 9px 36px", background: "var(--bg-input)",
                    border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)",
                    fontSize: 14, fontFamily: "var(--font)", outline: "none",
                  }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {filteredSkus.map((s) => (
                  <div key={s.sku} style={{
                    display: "grid", gridTemplateColumns: "150px 1fr 150px auto",
                    gap: 12, padding: "10px 14px", alignItems: "center",
                    borderRadius: "var(--radius)", background: "var(--bg)", border: "1px solid var(--border)",
                  }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{s.sku}</span>
                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                    <Badge>{s.category}</Badge>
                    <Button variant="danger" size="sm" onClick={() => removeSku(s.sku)} icon={<Icons.trash size={14} />} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "aliases" && (
            <div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                Map how each retailer names your products. When a retailer is selected in the PO form, only their aliased products appear in the dropdown.
              </p>
              {config.retailers.map((r) => {
                const aliases = config.retailerAliases[r.id] || {};
                const isOpen = editingAlias === r.id;
                return (
                  <div key={r.id} style={{
                    marginBottom: 8, borderRadius: "var(--radius)", border: "1px solid var(--border)",
                    background: "var(--bg)", overflow: "hidden",
                  }}>
                    <button onClick={() => setEditingAlias(isOpen ? null : r.id)} style={{
                      width: "100%", padding: "12px 16px", background: "none", border: "none",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      cursor: "pointer", color: "var(--text)", fontFamily: "var(--font)", fontSize: 14,
                    }}>
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge>{Object.keys(aliases).length} mapped</Badge>
                        <span style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "0.2s" }}>
                          <Icons.chevDown size={16} />
                        </span>
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: "0 16px 16px" }}>
                        <Divider />
                        {config.masterSkus.map((s) => (
                          <div key={s.sku} style={{
                            display: "grid", gridTemplateColumns: "140px 1fr 1fr auto",
                            gap: 8, padding: "6px 0", alignItems: "center",
                          }}>
                            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)" }}>{s.sku}</span>
                            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{s.name}</span>
                            <input
                              placeholder="Retailer's name for this..."
                              value={aliases[s.sku] || ""}
                              onChange={(e) => e.target.value ? setAlias(r.id, s.sku, e.target.value) : removeAlias(r.id, s.sku)}
                              style={{
                                padding: "6px 10px", background: "var(--bg-input)",
                                border: `1px solid ${aliases[s.sku] ? "var(--success)" : "var(--border)"}`,
                                borderRadius: "var(--radius)", color: "var(--text)", fontSize: 13,
                                fontFamily: "var(--font)", outline: "none",
                              }}
                            />
                            {aliases[s.sku] && (
                              <button onClick={() => removeAlias(r.id, s.sku)} style={{
                                background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
                              }}>
                                <Icons.x size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
