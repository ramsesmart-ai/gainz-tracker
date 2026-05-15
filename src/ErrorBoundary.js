import React from 'react';

export default class ErrorBoundary extends React.Component {
  state = { error: null, stack: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ stack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="tab-pane" style={{
          display: 'flex', flexDirection: 'column',
          gap: 12, padding: 24,
        }}>
          <div style={{
            background: '#7f1d1d', color: '#fca5a5', border: '1px solid #dc2626',
            borderRadius: 8, padding: '12px 14px', fontSize: 13, fontFamily: 'monospace',
            wordBreak: 'break-all', whiteSpace: 'pre-wrap',
          }}>
            <strong style={{ display: 'block', marginBottom: 6 }}>
              {this.state.error.message || String(this.state.error)}
            </strong>
            {this.state.stack && (
              <span style={{ opacity: 0.7, fontSize: 11 }}>{this.state.stack.trim()}</span>
            )}
          </div>
          <button className="btn-primary" onClick={() => this.setState({ error: null, stack: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
