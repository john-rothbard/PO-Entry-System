import { useEffect } from 'react';

// ── Styles (injected once) ──────────────────────────────────
export const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root, [data-theme="dark"] {
    --bg: #0F1117; --bg-card: #181B24; --bg-input: #1E2230; --bg-hover: #252938;
    --border: #2A2E3B; --border-focus: #4F7CFF;
    --text: #E8EAF0; --text-secondary: #8B90A0; --text-muted: #5C6070;
    --accent: #4F7CFF; --accent-hover: #6B92FF; --accent-subtle: rgba(79,124,255,0.1);
    --success: #34D399; --success-bg: rgba(52,211,153,0.1);
    --warning: #FBBF24; --warning-bg: rgba(251,191,36,0.1);
    --danger: #F87171; --danger-bg: rgba(248,113,113,0.1);
    --radius: 8px; --radius-lg: 12px;
    --shadow: 0 4px 24px rgba(0,0,0,0.3);
    --font: 'DM Sans', -apple-system, sans-serif;
    --mono: 'JetBrains Mono', monospace;
  }
  [data-theme="light"] {
    --bg: #F5F0E8; --bg-card: #FFFDF7; --bg-input: #EDE8DC; --bg-hover: #E8E2D0;
    --border: #D6CFBD; --border-focus: #39E75F;
    --text: #1A1A2E; --text-secondary: #6B5F8A; --text-muted: #9B93B0;
    --accent: #39E75F; --accent-hover: #2ED650; --accent-subtle: rgba(57,231,95,0.12);
    --success: #22C55E; --success-bg: rgba(34,197,94,0.12);
    --warning: #D97706; --warning-bg: rgba(217,119,6,0.12);
    --danger: #DC2626; --danger-bg: rgba(220,38,38,0.1);
    --shadow: 0 4px 24px rgba(107,95,138,0.1);
  }
  body { font-family: var(--font); background: var(--bg); color: var(--text); line-height: 1.5; }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  ::selection { background: var(--accent); color: #fff; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
`;

// ── Icons ───────────────────────────────────────────────────
const SvgIcon = ({ d, size = 18, color = "currentColor", ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d={d} />
  </svg>
);

export const Icons = {
  plus: (p) => <SvgIcon d="M12 5v14M5 12h14" {...p} />,
  trash: (p) => (
    <svg width={p?.size||18} height={p?.size||18} viewBox="0 0 24 24" fill="none" stroke={p?.color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  ),
  check: (p) => <SvgIcon d="M20 6L9 17l-5-5" {...p} />,
  alert: (p) => (
    <svg width={p?.size||18} height={p?.size||18} viewBox="0 0 24 24" fill="none" stroke={p?.color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  settings: (p) => (
    <svg width={p?.size||18} height={p?.size||18} viewBox="0 0 24 24" fill="none" stroke={p?.color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  clipboard: (p) => (
    <svg width={p?.size||18} height={p?.size||18} viewBox="0 0 24 24" fill="none" stroke={p?.color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    </svg>
  ),
  send: (p) => <SvgIcon d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" {...p} />,
  chevDown: (p) => <SvgIcon d="M6 9l6 6 6-6" {...p} />,
  search: (p) => (
    <svg width={p?.size||18} height={p?.size||18} viewBox="0 0 24 24" fill="none" stroke={p?.color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  x: (p) => <SvgIcon d="M18 6L6 18M6 6l12 12" {...p} />,
  copy: (p) => (
    <svg width={p?.size||18} height={p?.size||18} viewBox="0 0 24 24" fill="none" stroke={p?.color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  download: (p) => <SvgIcon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" {...p} />,
  upload: (p) => <SvgIcon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" {...p} />,
  server: (p) => (
    <svg width={p?.size||18} height={p?.size||18} viewBox="0 0 24 24" fill="none" stroke={p?.color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
    </svg>
  ),
  sun: (p) => (
    <svg width={p?.size||18} height={p?.size||18} viewBox="0 0 24 24" fill="none" stroke={p?.color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
  moon: (p) => <SvgIcon d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" {...p} />,
};

// ── UI Components ───────────────────────────────────────────
export const Badge = ({ children, variant = "default", style = {} }) => {
  const colors = {
    default: { bg: "var(--accent-subtle)", color: "var(--accent)" },
    success: { bg: "var(--success-bg)", color: "var(--success)" },
    warning: { bg: "var(--warning-bg)", color: "var(--warning)" },
    danger: { bg: "var(--danger-bg)", color: "var(--danger)" },
  };
  const c = colors[variant] || colors.default;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 10px",
      borderRadius: 99, fontSize: 12, fontWeight: 600, background: c.bg, color: c.color, ...style,
    }}>{children}</span>
  );
};

export const Input = ({ label, required, error, style = {}, ...props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
    {label && (
      <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
        {label}{required && <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>}
      </label>
    )}
    <input
      {...props}
      style={{
        padding: "9px 12px", background: "var(--bg-input)", border: `1px solid ${error ? "var(--danger)" : "var(--border)"}`,
        borderRadius: "var(--radius)", color: "var(--text)", fontSize: 14,
        fontFamily: "var(--font)", outline: "none", transition: "border-color 0.15s",
        ...(props.style || {}),
      }}
      onFocus={(e) => { e.target.style.borderColor = "var(--border-focus)"; props.onFocus?.(e); }}
      onBlur={(e) => { e.target.style.borderColor = error ? "var(--danger)" : "var(--border)"; props.onBlur?.(e); }}
    />
    {error && <span style={{ fontSize: 12, color: "var(--danger)" }}>{error}</span>}
  </div>
);

export const Select = ({ label, required, error, options = [], placeholder, style = {}, ...props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
    {label && (
      <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
        {label}{required && <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>}
      </label>
    )}
    <select
      {...props}
      style={{
        padding: "9px 12px", background: "var(--bg-input)", border: `1px solid ${error ? "var(--danger)" : "var(--border)"}`,
        borderRadius: "var(--radius)", color: props.value ? "var(--text)" : "var(--text-muted)",
        fontSize: 14, fontFamily: "var(--font)", outline: "none", appearance: "none", cursor: "pointer",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B90A0' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
        ...(props.style || {}),
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {error && <span style={{ fontSize: 12, color: "var(--danger)" }}>{error}</span>}
  </div>
);

export const Button = ({ children, variant = "primary", size = "md", icon, style = {}, ...props }) => {
  const variants = {
    primary: { bg: "var(--accent)", color: "#fff", hoverBg: "var(--accent-hover)" },
    secondary: { bg: "var(--bg-input)", color: "var(--text)", hoverBg: "var(--bg-hover)" },
    danger: { bg: "var(--danger-bg)", color: "var(--danger)", hoverBg: "rgba(248,113,113,0.2)" },
    ghost: { bg: "transparent", color: "var(--text-secondary)", hoverBg: "var(--bg-hover)" },
    success: { bg: "var(--success)", color: "#000", hoverBg: "#4AE0A8" },
  };
  const sizes = { sm: { padding: "6px 12px", fontSize: 13 }, md: { padding: "9px 18px", fontSize: 14 }, lg: { padding: "12px 24px", fontSize: 15 } };
  const v = variants[variant] || variants.primary;
  const s = sizes[size] || sizes.md;
  return (
    <button
      {...props}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid var(--border)",
        borderRadius: "var(--radius)", fontWeight: 500, fontFamily: "var(--font)",
        cursor: props.disabled ? "not-allowed" : "pointer", opacity: props.disabled ? 0.5 : 1,
        background: v.bg, color: v.color, transition: "all 0.15s", ...s, ...style,
      }}
      onMouseEnter={(e) => { if (!props.disabled) e.target.style.background = v.hoverBg; }}
      onMouseLeave={(e) => { e.target.style.background = v.bg; }}
    >{icon}{children}</button>
  );
};

export const Card = ({ children, style = {} }) => (
  <div style={{
    background: "var(--bg-card)", border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)", padding: 24, ...style,
  }}>{children}</div>
);

export const Divider = ({ style = {} }) => (
  <div style={{ height: 1, background: "var(--border)", margin: "16px 0", ...style }} />
);

export const Toast = ({ message, type = "success", onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  const colors = {
    success: { bg: "var(--success-bg)", border: "var(--success)", icon: <Icons.check color="var(--success)" /> },
    error: { bg: "var(--danger-bg)", border: "var(--danger)", icon: <Icons.alert color="var(--danger)" /> },
    warning: { bg: "var(--warning-bg)", border: "var(--warning)", icon: <Icons.alert color="var(--warning)" /> },
  };
  const c = colors[type] || colors.success;
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", alignItems: "center",
      gap: 10, padding: "12px 20px", background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: "var(--radius)", boxShadow: "var(--shadow)", animation: "slideUp 0.3s ease", fontWeight: 500, fontSize: 14,
    }}>
      {c.icon}{message}
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", marginLeft: 8 }}>
        <Icons.x size={14} />
      </button>
    </div>
  );
};
