import { useState, useMemo, useRef } from 'react';
import { Icons, Badge, Input, Select, Combobox, Button, Card, Divider } from './components';
import { US_STATES, EDI_SHEET_DEFAULTS } from './config';
import { downloadPackingListPdf, getPackingListPdfBase64 } from './packingList';

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

const newSessionId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : "sess_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);

export default function POForm({ config, onSubmit, onSendPackingListToAsana, onLogPackingList }) {
  const emptyForm = {
    retailerId: "", poNumber: "",
    orderDate: "",
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
  const [sendingToAsana, setSendingToAsana] = useState(false);
  const [downloadingPL, setDownloadingPL] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const [showAttachPrompt, setShowAttachPrompt] = useState(false);
  const fileInputRef = useRef(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [newItem, setNewItem] = useState({ sku: "", quantity: "", unitPrice: "" });
  const [itemErrors, setItemErrors] = useState({ sku: false, quantity: false, unitPrice: false });

  const [sessionId, setSessionId] = useState(() => newSessionId());
  const [submittedToShipStation, setSubmittedToShipStation] = useState(null);
  const [sentToAsana, setSentToAsana] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const resetSession = () => {
    setSessionId(newSessionId());
    setSubmittedToShipStation(null);
    setSentToAsana(null);
  };

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
    if (!form.orderDate) errs.orderDate = "Required";
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
    if (!form.orderDate) missing.push("Ship by Date");
    if (!form.shipTo.name.trim()) missing.push("Name");
    if (!form.shipTo.address1.trim()) missing.push("Address");
    if (!form.shipTo.city.trim()) missing.push("City");
    if (!form.shipTo.state) missing.push("State");
    if (!form.shipTo.zip.trim()) missing.push("Zip");
    if (form.lineItems.length === 0) missing.push("a Product");
    return missing;
  };

  const packingListInput = () => ({
    poNumber: form.poNumber,
    orderDate: new Date().toISOString().split("T")[0],
    shipDate: form.orderDate,
    lineItems: form.lineItems,
    shipTo: form.shipTo,
    notes: form.notes,
  });

  const handleDownloadPackingList = async () => {
    if (!form.poNumber.trim() || form.lineItems.length === 0) {
      setSubmitAttempted(true);
      validate();
      return;
    }
    setDownloadingPL(true);
    try {
      await downloadPackingListPdf(packingListInput());
      if (onLogPackingList) {
        try {
          await onLogPackingList(buildLogPayload(), retailer);
        } catch (_) { /* logging failure shouldn't block download */ }
      }
    } finally { setDownloadingPL(false); }
  };

  const buildLogPayload = () => {
    const billTo = form.billToSameAsShip ? form.shipTo : form.billTo;
    return {
      sessionId,
      orderNumber: form.poNumber,
      orderDate: form.orderDate,
      retailer: retailer?.name,
      retailerId: form.retailerId,
      shipTo: {
        name: form.shipTo.name, company: form.shipTo.company || undefined,
        street1: form.shipTo.address1, street2: form.shipTo.address2 || undefined,
        city: form.shipTo.city, state: form.shipTo.state, postalCode: form.shipTo.zip,
      },
      billTo: {
        name: billTo.name, company: billTo.company || undefined,
        street1: billTo.address1, street2: billTo.address2 || undefined,
        city: billTo.city, state: billTo.state, postalCode: billTo.zip,
      },
      items: form.lineItems.map((item) => ({
        sku: item.sku, name: item.name, quantity: item.quantity, unitPrice: item.unitPrice,
      })),
      shippingAmount: Number(form.shippingPaid) || 0,
      taxAmount: Number(form.taxPaid) || 0,
      notes: form.notes || undefined,
    };
  };

  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const openAttachPicker = () => {
    fileInputRef.current?.click();
  };

  const onFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      alert('File too large. Max 25 MB.');
      e.target.value = '';
      return;
    }
    setAttachedFile(file);
    e.target.value = '';
  };

  const sendToAsanaCore = async () => {
    setSendingToAsana(true);
    try {
      const pdfBase64 = await getPackingListPdfBase64(packingListInput());
      let attachmentBase64;
      let attachmentFilename;
      if (attachedFile) {
        attachmentBase64 = await readFileAsBase64(attachedFile);
        attachmentFilename = attachedFile.name;
      }
      const result = await onSendPackingListToAsana({
        ...buildLogPayload(),
        asanaSectionGid: retailer?.asanaSectionGid,
        pdfBase64,
        pdfFilename: `Packing-List-${form.poNumber}.pdf`,
        attachmentBase64,
        attachmentFilename,
      });
      setSentToAsana({
        taskId: result?.taskId,
        taskUrl: result?.taskUrl,
        at: new Date().toISOString(),
      });
      setAttachedFile(null);
    } catch (err) { /* handled in parent */ }
    finally { setSendingToAsana(false); }
  };

  const handleSendPackingListToAsana = async () => {
    if (sentToAsana) {
      setConfirmAction("asana");
      return;
    }
    setSubmitAttempted(true);
    if (!validate()) return;
    if (!attachedFile) {
      setShowAttachPrompt(true);
      return;
    }
    await sendToAsanaCore();
  };

  const handleSubmit = async () => {
    if (submittedToShipStation) {
      setConfirmAction("submit");
      return;
    }
    await submitToShipStationCore();
  };

  const submitToShipStationCore = async () => {
    setSubmitAttempted(true);
    if (!validate()) return;
    setSubmitting(true);
    const billTo = form.billToSameAsShip ? form.shipTo : form.billTo;
    const ediSheetId = retailer?.ediSheetId || EDI_SHEET_DEFAULTS[retailer?.id];
    const payload = {
      sessionId,
      orderNumber: form.poNumber,
      retailer: retailer?.name,
      ediSheetId,
      notes: form.notes || undefined,
      orderDate: new Date().toISOString(),
      shipByDate: new Date(form.orderDate + "T12:00:00").toISOString(),
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
        customField3: "sent via PO automation form",
      },
      internalNotes: form.notes || undefined,
    };
    try {
      const result = await onSubmit(payload, retailer);
      setSubmittedToShipStation({
        orderId: result?.orderId,
        orderKey: result?.orderKey,
        at: new Date().toISOString(),
      });
    } catch (err) { /* handled in parent */ }
    finally { setSubmitting(false); }
  };

  const handleClearForm = () => {
    setForm(emptyForm);
    setErrors({});
    setSubmitAttempted(false);
    setAttachedFile(null);
    setNewItem({ sku: "", quantity: "", unitPrice: "" });
    setItemErrors({ sku: false, quantity: false, unitPrice: false });
    setAddingProduct(false);
    resetSession();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>
      {/* LEFT COLUMN */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Card>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Order Info</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Combobox label="Retailer" required value={form.retailerId} error={errors.retailerId}
              onChange={(val) => { updateField("retailerId", val); setForm((f) => ({ ...f, lineItems: [] })); }}
              placeholder="Search or select retailer..." options={config.retailers.map((r) => ({ value: r.id, label: r.name }))} />
            <Input label="PO Number" required value={form.poNumber} error={errors.poNumber}
              onChange={(e) => {
                updateField("poNumber", e.target.value);
                if (submittedToShipStation || sentToAsana) resetSession();
              }} placeholder="Enter PO #" />
            <Input label="Ship by Date" required type="date" value={form.orderDate}
              error={errors.orderDate}
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
            <form onSubmit={(e) => { e.preventDefault(); addLineItem(); }}
              style={{ padding: 14, background: "var(--bg)", borderRadius: "var(--radius)", border: "1px dashed var(--border-focus)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px", gap: 10, marginBottom: 10 }}>
                <Combobox label="Product" value={newItem.sku}
                  error={itemErrors.sku}
                  onChange={(val) => { setNewItem({ ...newItem, sku: val }); setItemErrors((er) => ({ ...er, sku: false })); }}
                  placeholder="Search or select product..."
                  options={availableProducts.map((p) => {
                    const name = p.retailerName.length > 40 ? p.retailerName.slice(0, 40) + '...' : p.retailerName;
                    return { value: p.sku, label: `${name} → ${p.sku}`, keywords: `${p.sku} ${p.name} ${p.retailerName}` };
                  })} />
                <Input label="Quantity" type="number" min="1" value={newItem.quantity}
                  error={itemErrors.quantity}
                  onChange={(e) => { setNewItem({ ...newItem, quantity: e.target.value }); setItemErrors((er) => ({ ...er, quantity: false })); }} placeholder="Qty" />
                <Input label="Unit Price ($)" type="number" step="0.01" min="0.01" value={newItem.unitPrice}
                  error={itemErrors.unitPrice}
                  onChange={(e) => { setNewItem({ ...newItem, unitPrice: e.target.value }); setItemErrors((er) => ({ ...er, unitPrice: false })); }} placeholder="0.00" />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button type="submit" size="sm" icon={<Icons.plus size={14} />}>Add Product</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setAddingProduct(false); setNewItem({ sku: "", quantity: "", unitPrice: "" }); setItemErrors({ sku: false, quantity: false, unitPrice: false }); }}>Cancel</Button>
              </div>
            </form>
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
          <Button
            variant={submittedToShipStation ? "secondary" : "success"}
            size="lg" onClick={handleSubmit} disabled={submitting}
            icon={submitting ? null : (submittedToShipStation ? <Icons.check size={16} color="var(--success)" /> : <Icons.send size={16} />)}
            style={{
              width: "100%", justifyContent: "center", marginTop: 20,
              ...(submittedToShipStation ? {
                background: "var(--success-bg)", color: "var(--success)",
                border: "1px solid var(--success)",
              } : {}),
            }}>
            {submitting ? "Submitting..." : submittedToShipStation
              ? `Submitted to ShipStation${submittedToShipStation.orderId ? ` (SS#${submittedToShipStation.orderId})` : ""}`
              : "Submit Order to ShipStation"}
          </Button>
          <Button
            variant="secondary" size="md" onClick={handleSendPackingListToAsana}
            disabled={sendingToAsana}
            icon={sentToAsana ? <Icons.check size={14} color="var(--success)" /> : null}
            style={{
              width: "100%", justifyContent: "center", marginTop: 8,
              ...(sentToAsana ? {
                background: "var(--success-bg)", color: "var(--success)",
                border: "1px solid var(--success)",
              } : {}),
            }}>
            {sendingToAsana ? "Sending..." : sentToAsana ? "Sent to Asana" : "Send PL to Asana"}
          </Button>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <Button variant="secondary" size="sm" onClick={handleDownloadPackingList}
              disabled={downloadingPL}
              style={{ justifyContent: "center" }}>
              {downloadingPL ? "Downloading..." : "Download PL"}
            </Button>
            <Button variant="secondary" size="sm" onClick={openAttachPicker}
              style={{ justifyContent: "center" }}>
              {attachedFile ? "Replace File" : "Attach File for Asana"}
            </Button>
          </div>
          {attachedFile && (
            <div style={{
              marginTop: 8, fontSize: 12, color: "var(--text-secondary)",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Attached: {attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)
              </span>
              <button onClick={() => setAttachedFile(null)} style={{
                background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0,
              }}>
                <Icons.x size={14} />
              </button>
            </div>
          )}
          <input ref={fileInputRef} type="file" onChange={onFileSelected} style={{ display: "none" }} />
          <Button variant="ghost" size="sm" onClick={() => setConfirmAction("clear")}
            style={{ width: "100%", justifyContent: "center", marginTop: 12, color: "var(--text-muted)" }}>
            Clear Form
          </Button>
          {submitAttempted && getMissingFields().length > 0 && (
            <p style={{
              marginTop: 12, fontSize: 13, color: "var(--danger)", textAlign: "center", lineHeight: 1.5,
            }}>
              Need {getMissingFields().join(", ")} to submit!
            </p>
          )}
        </Card>

        {showAttachPrompt && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}>
            <div style={{
              background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)",
              maxWidth: 420, width: "100%", padding: 24, boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>No file attached</h3>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
                Most Asana entries include the original PO order from the retailer. You can attach one now, or send without it.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="ghost" size="sm" onClick={() => setShowAttachPrompt(false)}>
                  Cancel
                </Button>
                <Button variant="secondary" size="sm" onClick={() => {
                  setShowAttachPrompt(false);
                  openAttachPicker();
                }}>
                  Attach File
                </Button>
                <Button variant="success" size="sm" onClick={async () => {
                  setShowAttachPrompt(false);
                  await sendToAsanaCore();
                }}>
                  Send Without
                </Button>
              </div>
            </div>
          </div>
        )}

        {confirmAction && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}>
            <div style={{
              background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)",
              maxWidth: 420, width: "100%", padding: 24, boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                {confirmAction === "submit" && "Re-submit to ShipStation?"}
                {confirmAction === "asana" && "Re-send to Asana?"}
                {confirmAction === "clear" && "Clear the form?"}
              </h3>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
                {confirmAction === "submit" && `This PO was already submitted${submittedToShipStation?.orderId ? ` (SS#${submittedToShipStation.orderId})` : ""}. Submitting again will create a duplicate order in ShipStation.`}
                {confirmAction === "asana" && "An Asana task was already created for this PO. Sending again will create a second task."}
                {confirmAction === "clear" && "This will wipe all fields and reset submission status."}
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)}>Cancel</Button>
                <Button variant={confirmAction === "clear" ? "danger" : "primary"} size="sm"
                  onClick={async () => {
                    const action = confirmAction;
                    setConfirmAction(null);
                    if (action === "submit") {
                      setSubmittedToShipStation(null);
                      await submitToShipStationCore();
                    } else if (action === "asana") {
                      setSentToAsana(null);
                      if (!attachedFile) { setShowAttachPrompt(true); return; }
                      await sendToAsanaCore();
                    } else if (action === "clear") {
                      handleClearForm();
                    }
                  }}>
                  {confirmAction === "submit" && "Yes, submit again"}
                  {confirmAction === "asana" && "Yes, send again"}
                  {confirmAction === "clear" && "Yes, clear"}
                </Button>
              </div>
            </div>
          </div>
        )}

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
