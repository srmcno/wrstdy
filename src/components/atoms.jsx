export const F = ({ label, hint, children }) => (
  <div className="fld">
    <label className="flb">{label}</label>
    {children}
    {hint && <span className="fhn">{hint}</span>}
  </div>
);

export const $I = ({ value, onChange, placeholder = '0.00' }) => (
  <div className="cw">
    <span className="cs">$</span>
    <input
      className="inp ci"
      type="number"
      min="0"
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </div>
);

export const Hr = () => <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />;
