import { useId, cloneElement, isValidElement } from 'react';

// Field wrapper. Generates a unique id and associates the label with the
// child input so screen readers and click-on-label both work. The child can
// be any single form control (input/select/textarea or our $I component).
export const F = ({ label, hint, required, children }) => {
  const id = useId();
  const child = isValidElement(children) ? cloneElement(children, { id, ...(required ? { required: true, 'aria-required': 'true' } : {}) }) : children;
  return (
    <div className="fld">
      <label className={'flb' + (required ? ' req' : '')} htmlFor={id}>{label}</label>
      {child}
      {hint && <span className="fhn">{hint}</span>}
    </div>
  );
};

export const $I = ({ value, onChange, placeholder = '0.00', id, required }) => (
  <div className="cw">
    <span className="cs" aria-hidden="true">$</span>
    <input
      id={id}
      className="inp ci"
      type="number"
      min="0"
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
    />
  </div>
);

export const Hr = () => <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />;
