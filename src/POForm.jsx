import { useState, useMemo } from 'react';
import { Icons, Badge, Input, Select, Button, Card, Divider } from './components';
import { US_STATES } from './config';

function AddressFields({ prefix, data, errors, updateField }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Input label="Name" required value={data.name} error={errors[`${prefix}.name`]}
          onChange={(e) => updateField(`${prefix}.name`, e.target.value)} placeholder="Recipient name" />
        <Input label="Company" value={data.company}
          onChange={(e) => updateField(`${prefix}.company`, e.target.value)} placeholder="Company name" />
      </div>
      <Input label="Address Line 1" required value={data.address1} error={errors[`${prefix}.address1`]}
        onChange={(e) => updateField(`${prefix}.address1`, e.target.value)} placeholder="Street address" />
      <Input label="Address Line 2" value={data.address2}
        onChange={(e) => updateField(`${prefix}.address2`, e.target.value)} placeholder="Apt, suite, etc." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px", gap: 10 }}>
        <Input label="City" required value={data.city} error={errors[`${prefix}.city`]}
          onChange={(e) => updateField(`${prefix}.city`, e.target.value)} placeholder="City" />
        <Select label="State" required value={data.state} error={errors[`${prefix}.state`]}
          onChange={(e) => updateField(`${prefix}.state`, e.target.value)} placeholder="State"
          options={US_STATES.map((s) => ({ value: s, label: s }))} />
        <Input label="Zip" required value={data.zip} error={errors[`${prefix}.zip`]}
          onChange={(e) => updateField(`${prefix}.zip`, e.target.value)} placeholder="Zip" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Input label="Phone" value={data.phone}
          onChange={(e) => updateField(`${prefix}.phone`, e.target.value)} placeholder="Phone" />
        <Input label="Email" value={data.email}
          onChange={(e) => updateField(`${prefix}.email`, e.target.value)} placeholder="Email" />
      </div>
    </div>
  );
}

export default function POForm({ config, onSubmit }) {
  const emptyForm = {
    retailerId: "", poNumber: "",
    orderDate: new Date().toISOString().split("T")[0],
    shipTo: { name: "", company: "", address1: "", address2: "", city: "", state: "", zip: "", phone: "", email: "" },
    billTo: { name: "", company: "", address1: "", address2: "", city: "", state: "", zip: "", phone: "", email: "" },
    billToSameAsShip: true,
    lineItems: [],
    shippingPaid: "", taxPaid: "", notes: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [newItem, setNewItem] = useState({ sku: "", quantity: "", unitPrice: "" });
  const [itemErrors, setItemErrors] = useState({ sku: false, quantity: false, unitPrice: false });

  const retailer = config.retailers.find((r) => r.id === form.retailerId);
  const retailerAliases = config.retailerAliases[form.retailerId] || {};

  const availableProducts = useMemo(() => {
    if (!form.retailerId) return [];
    return config.masterSkus
      .map((s) => ({ ...s, retailerName: retailerAliases[s.sku] || s.name }));
  }, [form.retailerId, config.masterSkus, retailerAliases]);

  const updateField = (path, value) => {
    setForm((f) => {
      const parts = path.split(".");
      const newForm = { ...f };
      let current = newForm;
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = { ...current[parts[i]] };
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return newForm;
    });
    setErrors((e) => ({ ...e, [path]: undefined }));
  };

  const addLineItem = () => {
    const errs = {
      sku: !newItem.sku,
      quantity: !newItem.quantity,
      unitPrice: !newItem.unitPrice || Number(newItem.unitPrice) <= 0,
    };
    if (errs.sku || errs.quantity || errs.unitPrice) {
      setItemErrors(errs);
      return;
    }
    const master = config.masterSkus.find((s) => s.sku === newItem.sku);
    const item = {
      sku: newItem.sku, name: master?.name || newItem.sku,
      retailerName: retailerAliases[newItem.sku] || master?.name,
      quantity: Number(newItem.quantity), unitPrice: Number(newItem.unitPrice),
    };
    setForm((f) => ({ ...f, lineItems: [...f.lineItems, item] }));
    setNewItem({ sku: "", quantity: "", unitPrice: "" });
    setItemErrors({ sku: false, quantity: false, unitPrice: false });
    setAddingProduct(false);
  };

  const removeLineItem = (idx) => {
    setForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, i) => i !== idx) }));
  };

  const totalProducts = form.lineItems.reduce((a, b) => a + b.quantity * b.unitPrice, 0);
  const totalOrder = totalProducts + (Number(form.shippingPaid) || 0) + (Number(form.taxPaid) || 0);

  const validate = () => {
    const errs = {};
    if (!form.retailerId) errs.retailerId = "Required";
    if (!form.poNumber.trim()) errs.poNumber = "Required";
    if (!form.shipTo.name.trim()) errs["shipTo.name"] = "Required";
    if (!form.shipTo.address1.trim()) errs["shipTo.address1"] = "Required";
    if (!form.shipTo.city.trim()) errs["shipTo.city"] = "Required";
    if (!form.shipTo.state) errs["shipTo.state"] = "Required";
    if (!form.shipTo.zip.trim()) errs["shipTo.zip"] = "Required";
    if (form.lineItems.length === 0) errs.lineItems = "Add at least one product";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const getMissingFields = () => {
    const missing = [];
    if (!form.retailerId) missing.push("Retailer");
    if (!form.poNumber.trim()) missing.push("PO Number");
    if (!form.shipTo.name.trim()) missing.push("Name");
    if (!form.shipTo.address1.trim()) missing.push("Address");
    if (!form.shipTo.city.trim()) missing.push("City");
    if (!form.shipTo.state) missing.push("State");
    if (!form.shipTo.zip.trim()) missing.push("Zip");
    if (form.lineItems.length === 0) missing.push("a Product");
    return missing;
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (!validate()) return;
    setSubmitting(true);
    const billTo = form.billToSameAsShip ? form.shipTo : form.billTo;
    const payload = {
      orderNumber: form.poNumber,
      orderDate: form.orderDate === new Date().toISOString().split("T")[0]
        ? new Date().toISOString()
        : new Date(form.orderDate + "T12:00:00").toISOString(),
      paymentDate: new Date().toISOString(),
      orderStatus: "awaiting_shipment",
      customerEmail: form.shipTo.email || undefined,
      billTo: {
        name: billTo.name, company: billTo.company || undefined,
        street1: billTo.address1, street2: billTo.address2 || undefined,
        city: billTo.city, state: billTo.state, postalCode: billTo.zip,
        country: "US", phone: billTo.phone || undefined,
      },
      shipTo: {
        name: form.shipTo.name, company: form.shipTo.company || undefined,
        street1: form.shipTo.address1, street2: form.shipTo.address2 || undefined,
        city: form.shipTo.city, state: form.shipTo.state, postalCode: form.shipTo.zip,
        country: "US", phone: form.shipTo.phone || undefined,
      },
      items: form.lineItems.map((item) => ({
        sku: item.sku, name: item.name, quantity: item.quantity, unitPrice: item.unitPrice,
      })),
      shippingAmount: Number(form.shippingPaid) || 0,
      taxAmount: Number(form.taxPaid) || 0,
      advancedOptions: {
        storeId: retailer?.shipStationStoreId,
      },
      internalNotes: form.notes || undefined,
    };
    try {
      await onSubmit(payload, retailer);
      setForm(emptyForm);
      setSubmitAttempted(false);
    } catch (err) { /* handled in parent */ }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>
      {/* LEFT COLUMN */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Card>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Order Info</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Select label="Retailer" required value={form.retailerId} error={errors.retailerId}
              onChange={(e) => { updateField("retailerId", e.target.value); setForm((f) => ({ ...f, lineItems: [] })); }}
              placeholder="Select retailer..." options={config.retailers.map((r) => ({ value: r.id, label: r.name }))} />
            <Input label="PO Number" required value={form.poNumber} error={errors.poNumber}
              onChange={(e) => updateField("poNumber", e.target.value)} placeholder="Enter PO #" />
            <Input label="Age" type="date" value={form.orderDate}
              onChange={(e) => updateField("orderDate", e.target.value)} />
          </div>
          {retailer && (
            <div style={{
              marginTop: 12, padding: "8px 12px", background: "var(--accent-subtle)",
              borderRadius: "var(--radius)", fontSize: 13, display: "flex", gap: 16,
            }}>
              <span>Routes to: <strong>Store #{retailer.shipStationStoreId}</strong></span>
              <span>Channel: <strong>{retailer.salesChannel}</strong></span>
            </div>
          )}
        </Card>

        <Card>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Ship To Address</h3>
          <AddressFields prefix="shipTo" data={form.shipTo} errors={errors} updateField={updateField} />
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Bill To Address</h3>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={form.billToSameAsShip}
                onChange={(e) => updateField("billToSameAsShip", e.target.checked)} style={{ accentColor: "var(--accent)" }} />
              Same as Ship To
            </label>
          </div>
          {!form.billToSameAsShip ? <AddressFields prefix="billTo" data={form.billTo} errors={errors} updateField={updateField} /> : (
            <p style={{ color: "var(--text-muted)", fontSize: 13, fontStyle: "italic" }}>Bill-to will match ship-to address.</p>
          )}
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              Order Line Items
              {form.lineItems.length > 0 && <Badge variant="success">{form.lineItems.length}</Badge>}
            </h3>
            {!form.retailerId && <span style={{ fontSize: 12, color: "var(--warning)" }}>Select a retailer first</span>}
          </div>

          {errors.lineItems && (
            <div style={{ padding: "8px 12px", background: "var(--danger-bg)", borderRadius: "var(--radius)", fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>
              {errors.lineItems}
            </div>
          )}

          {form.lineItems.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "100px 1fr 80px 100px 100px 40px",
                gap: 8, padding: "8px 12px", fontSize: 11, fontWeight: 600,
                color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                <span>SKU</span><span>Product</span><span>Qty</span><span>Unit Price</span><span>Total</span><span></span>
              </div>
              {form.lineItems.map((item, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "100px 1fr 80px 100px 100px 40px",
                  gap: 8, padding: "10px 12px", alignItems: "center",
                  borderRadius: "var(--radius)", background: "var(--bg)", border: "1px solid var(--border)",
                  marginBottom: 4, fontSize: 14,
                }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)" }}>{item.sku}</span>
                  <span>
                    <div style={{ fontWeight: 500 }}>{item.name}</div>
                    {item.retailerName !== item.name && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Retailer: {item.retailerName}</div>
                    )}
                  </span>
                  <span style={{ fontFamily: "var(--mono)" }}>{item.quantity}</span>
                  <span style={{ fontFamily: "var(--mono)" }}>${item.unitPrice.toFixed(2)}</span>
                  <span style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>${(item.quantity * item.unitPrice).toFixed(2)}</span>
                  <button onClick={() => removeLineItem(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                    <Icons.trash size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingProduct && form.retailerId ? (
            <div style={{ padding: 14, background: "var(--bg)", borderRadius: "var(--radius)", border: "1px dashed var(--border-focus)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px", gap: 10, marginBottom: 10 }}>
                <Select label="Product" value={newItem.sku}
                  error={itemErrors.sku}
                  onChange={(e) => { setNewItem({ ...newItem, sku: e.target.value }); setItemErrors((er) => ({ ...er, sku: false })); }}
                  placeholder="Select product..."
                  options={availableProducts.map((p) => {
                    const name = p.retailerName.length > 40 ? p.retailerName.slice(0, 40) + '...' : p.retailerName;
                    return { value: p.sku, label: `${name} → ${p.sku}` };
                  })} />
                <Input label="Quantity" type="number" min="1" value={newItem.quantity}
                  error={itemErrors.quantity}
                  onChange={(e) => { setNewItem({ ...newItem, quantity: e.target.value }); setItemErrors((er) => ({ ...er, quantity: false })); }} placeholder="Qty" />
                <Input label="Unit Price ($)" type="number" step="0.01" min="0.01" value={newItem.unitPrice}
                  error={itemErrors.unitPrice}
                  onChange={(e) => { setNewItem({ ...newItem, unitPrice: e.target.value }); setItemErrors((er) => ({ ...er, unitPrice: false })); }} placeholder="0.00" />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button size="sm" onClick={addLineItem} icon={<Icons.plus size={14} />}>Add Product</Button>
                <Button variant="ghost" size="sm" onClick={() => { setAddingProduct(false); setNewItem({ sku: "", quantity: "", unitPrice: "" }); setItemErrors({ sku: false, quantity: false, unitPrice: false }); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setAddingProduct(true)}
              disabled={!form.retailerId} icon={<Icons.plus size={16} />}>Add Product</Button>
          )}
        </Card>

        <Card>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Order Notes</h3>
          <textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Special instructions, notes..." rows={3}
            style={{
              width: "100%", padding: "10px 12px", background: "var(--bg-input)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", color: "var(--text)", fontSize: 14, fontFamily: "var(--font)",
              outline: "none", resize: "vertical",
            }} />
        </Card>
      </div>

      {/* RIGHT COLUMN — SUMMARY */}
      <div style={{ position: "sticky", top: 20 }}>
        <Card style={{ background: "var(--bg-card)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Icons.clipboard /> Order Summary
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>Retailer</span>
              <span style={{ fontWeight: 600 }}>{retailer?.name || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>PO #</span>
              <span style={{ fontFamily: "var(--mono)" }}>{form.poNumber || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>Store ID</span>
              <span style={{ fontFamily: "var(--mono)" }}>{retailer?.shipStationStoreId || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>Items</span>
              <span>{form.lineItems.length} products</span>
            </div>
          </div>
          <Divider />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>Products Total</span>
              <span style={{ fontFamily: "var(--mono)" }}>${totalProducts.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <span style={{ color: "var(--text-secondary)" }}>Shipping</span>
              <input type="number" step="0.01" min="0" placeholder="$0.00" value={form.shippingPaid}
                onChange={(e) => updateField("shippingPaid", e.target.value)}
                style={{
                  width: 100, padding: "4px 8px", textAlign: "right", background: "var(--bg-input)",
                  border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)",
                  fontSize: 13, fontFamily: "var(--mono)", outline: "none",
                }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <span style={{ color: "var(--text-secondary)" }}>Tax</span>
              <input type="number" step="0.01" min="0" placeholder="$0.00" value={form.taxPaid}
                onChange={(e) => updateField("taxPaid", e.target.value)}
                style={{
                  width: 100, padding: "4px 8px", textAlign: "right", background: "var(--bg-input)",
                  border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)",
                  fontSize: 13, fontFamily: "var(--mono)", outline: "none",
                }} />
            </div>
          </div>
          <Divider />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700 }}>
            <span>Total</span>
            <span style={{ fontFamily: "var(--mono)", color: "var(--success)" }}>${totalOrder.toFixed(2)}</span>
          </div>
          <Button variant="success" size="lg" onClick={handleSubmit} disabled={submitting}
            icon={submitting ? null : <Icons.send size={16} />}
            style={{ width: "100%", justifyContent: "center", marginTop: 20 }}>
            {submitting ? "Submitting..." : "Submit Order to ShipStation"}
          </Button>
          {submitAttempted && getMissingFields().length > 0 && (
            <p style={{
              marginTop: 12, fontSize: 13, color: "var(--danger)", textAlign: "center", lineHeight: 1.5,
            }}>
              Need {getMissingFields().join(", ")} to submit!
            </p>
          )}
        </Card>

        {form.lineItems.length > 0 && (
          <Card style={{ marginTop: 12 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--text-secondary)" }}>Line Items Breakdown</h4>
            {form.lineItems.map((item, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0",
                borderBottom: i < form.lineItems.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <span style={{ color: "var(--text-secondary)" }}>
                  <span style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>{item.sku}</span> × {item.quantity}
                </span>
                <span style={{ fontFamily: "var(--mono)" }}>${(item.quantity * item.unitPrice).toFixed(2)}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
