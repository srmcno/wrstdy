import { Component } from 'react';

// Catches render errors anywhere in the tree. Without this, any thrown error
// during render unmounts the whole React root and leaves the user staring at
// the bare body gradient ("blank gray screen") with no way to recover except
// a browser refresh.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('App crashed:', error, info);
  }
  reset = () => this.setState({ error: null, info: null });
  reload = () => window.location.reload();
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: '40px 24px', maxWidth: 720, margin: '0 auto', fontFamily: 'var(--font, sans-serif)' }}>
        <h2 style={{ color: 'var(--teal, #1E3D3B)', fontSize: 18, marginBottom: 8 }}>Something went wrong</h2>
        <p style={{ color: 'var(--mid, #475569)', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
          The app hit an unexpected error and stopped rendering. Your data is still
          saved in this browser — reloading the page is safe.
        </p>
        <details style={{ marginBottom: 14, fontSize: 12, color: 'var(--mid, #475569)' }}>
          <summary style={{ cursor: 'pointer', marginBottom: 6 }}>Show technical details</summary>
          <pre style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, overflow: 'auto', fontSize: 11, lineHeight: 1.5 }}>
            {String(this.state.error?.stack || this.state.error || 'Unknown error')}
            {this.state.info?.componentStack ? '\n\nComponent stack:' + this.state.info.componentStack : ''}
          </pre>
        </details>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={this.reset}
            style={{ padding: '8px 16px', background: '#fff', color: 'var(--teal, #1E3D3B)', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
          >
            Try again
          </button>
          <button
            onClick={this.reload}
            style={{ padding: '8px 16px', background: 'var(--lime, #76B900)', color: '#0a1f00', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
