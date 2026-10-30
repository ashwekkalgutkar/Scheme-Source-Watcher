const { useState, useEffect } = window.React || (typeof React !== 'undefined' ? React : {});
const API_BASE = 'http://localhost:4000/api';

function App() {
  const [sources, setSources] = useState([]);
  const [reviewItems, setReviewItems] = useState([]);
  const [checkLogs, setCheckLogs] = useState([]);
  const [fixturesState, setFixturesState] = useState({ versions: {}, maxVersions: {} });
  const [selectedStatus, setSelectedStatus] = useState('open');
  const [activeTab, setActiveTab] = useState('reviews'); // 'reviews' | 'sources' | 'logs'
  const [modalImage, setModalImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  const loadData = async () => {
    try {
      const [srcRes, revRes, logRes, fixRes] = await Promise.all([
        fetch(`${API_BASE}/sources`).then(r => r.json()),
        fetch(`${API_BASE}/review-items`).then(r => r.json()),
        fetch(`${API_BASE}/check-logs`).then(r => r.json()),
        fetch(`${API_BASE}/fixtures/state`).then(r => r.json()).catch(() => ({ versions: {} }))
      ]);

      if (Array.isArray(srcRes)) setSources(srcRes);
      if (Array.isArray(revRes)) setReviewItems(revRes);
      if (Array.isArray(logRes)) setCheckLogs(logRes);
      if (fixRes && fixRes.versions) setFixturesState(fixRes);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 5000);
    return () => clearInterval(timer);
  }, []);

  const showToast = (msg) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(''), 4000);
  };

  // Trigger immediate check for a source
  const handleCheckSource = async (sourceId, sourceName) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sources/${sourceId}/check`, { method: 'POST' });
      const data = await res.json();
      showToast(`Check completed for ${sourceName}: ${data.classification || data.outcome}`);
      await loadData();
    } catch (err) {
      showToast(`Check failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Accept review item
  const handleAcceptItem = async (itemId) => {
    try {
      await fetch(`${API_BASE}/review-items/${itemId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedBy: 'reviewer' })
      });
      showToast('Review item accepted.');
      await loadData();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  };

  // Dismiss review item
  const handleDismissItem = async (itemId) => {
    const reason = window.prompt('Enter reason for dismissing this alert:', 'Expected editorial update');
    if (!reason) return;

    try {
      await fetch(`${API_BASE}/review-items/${itemId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissReason: reason, resolvedBy: 'reviewer' })
      });
      showToast('Review item dismissed.');
      await loadData();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  };

  // Advance fixture version
  const handleAdvanceFixture = async (slug) => {
    try {
      const res = await fetch(`${API_BASE}/fixtures/advance/${slug}`, { method: 'POST' });
      const data = await res.json();
      showToast(`Advanced ${slug} to version ${data.version}`);
      await loadData();
    } catch (err) {
      showToast(`Could not advance fixture: ${err.message}`);
    }
  };

  // Reset fixtures
  const handleResetFixtures = async () => {
    try {
      await fetch(`${API_BASE}/fixtures/reset`, { method: 'POST' });
      showToast('All fixtures reset to initial baseline (version 0).');
      await loadData();
    } catch (err) {
      showToast(`Reset failed: ${err.message}`);
    }
  };

  const filteredReviews = reviewItems.filter(item => {
    if (selectedStatus === 'all') return true;
    return item.status === selectedStatus;
  });

  const openReviewsCount = reviewItems.filter(r => r.status === 'open').length;

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="header-titles">
          <h1>
            <span style={{ color: 'var(--accent)' }}>●</span> Scheme Source Watcher
          </h1>
          <p>Government Scheme Integrity & Policy Change Verification</p>
        </div>
        <div className="header-stats">
          <div className="stat-pill">
            <strong>{openReviewsCount}</strong>
            <span>Open Alerts</span>
          </div>
          <div className="stat-pill">
            <strong>{sources.length}</strong>
            <span>Monitored</span>
          </div>
        </div>
      </header>

      {actionMessage && (
        <div style={{ background: '#dbeafe', color: '#1e40af', padding: '10px 16px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {actionMessage}
        </div>
      )}

      {/* Fixture Simulation Controller */}
      <section className="card">
        <div className="card-header">
          <h2>Fixture Simulation Runner (Scenarios A through H)</h2>
          <button className="btn btn-outline btn-sm" onClick={handleResetFixtures}>
            Reset All Fixtures (v0)
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Advance fixture versions to simulate real Indian department site updates. Click "Check Now" on a source to run detection.
        </p>

        <div className="fixtures-grid">
          {Object.entries(fixturesState.versions || {}).map(([slug, ver]) => (
            <div key={slug} className="fixture-item">
              <div>
                <h4>{slug}</h4>
                <div className="fixture-status">
                  Version: <strong>v{ver}</strong> / {fixturesState.maxVersions?.[slug] || 1}
                </div>
              </div>
              <div className="fixture-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleAdvanceFixture(slug)}
                  disabled={ver >= (fixturesState.maxVersions?.[slug] || 1)}
                >
                  Advance Version
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${activeTab === 'reviews' ? 'active' : ''}`}
          onClick={() => setActiveTab('reviews')}
        >
          Review Items ({openReviewsCount} Open)
        </button>
        <button
          className={`filter-tab ${activeTab === 'sources' ? 'active' : ''}`}
          onClick={() => setActiveTab('sources')}
        >
          Monitored Sources ({sources.length})
        </button>
        <button
          className={`filter-tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          Check Logs & Audit Trail ({checkLogs.length})
        </button>
      </div>

      {/* TAB 1: REVIEW ITEMS */}
      {activeTab === 'reviews' && (
        <section className="card">
          <div className="card-header">
            <h2>Policy Review Queue</h2>
            <div style={{ display: 'flex', gap: 6 }}>
              {['open', 'accepted', 'dismissed', 'all'].map(status => (
                <button
                  key={status}
                  className={`btn btn-sm ${selectedStatus === status ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setSelectedStatus(status)}
                >
                  {status.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {filteredReviews.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>
              No review items found for status "{selectedStatus}". Reviewers are not flooded!
            </p>
          ) : (
            filteredReviews.map(item => (
              <div key={item._id} className={`review-item priority-${item.priority}`}>
                <div className="review-header">
                  <div>
                    <h3 style={{ fontSize: 15, color: 'var(--primary)', marginBottom: 4 }}>
                      {item.sourceId?.name || 'Government Scheme'}
                    </h3>
                    <div className="review-meta">
                      <span className={`badge badge-${item.priority}`}>{item.priority}</span>
                      <span className="badge badge-open">{item.type.replace('_', ' ')}</span>
                      <span className={`badge badge-${item.status}`}>{item.status}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {item.status === 'open' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-success btn-sm" onClick={() => handleAcceptItem(item._id)}>
                        Accept Change
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDismissItem(item._id)}>
                        Dismiss Alert
                      </button>
                    </div>
                  )}
                </div>

                {item.dismissReason && (
                  <p style={{ fontSize: 12, background: '#fef2f2', padding: '6px 10px', borderRadius: 4, color: '#991b1b', marginBottom: 8 }}>
                    <strong>Dismissed reason:</strong> {item.dismissReason} (by {item.resolvedBy})
                  </p>
                )}

                {/* Changes List */}
                {item.changes && item.changes.length > 0 && (
                  <table className="changes-table">
                    <thead>
                      <tr>
                        <th>Fact Type</th>
                        <th>Fact Key</th>
                        <th>Previous Value</th>
                        <th>New Value</th>
                        <th>Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.changes.map((c, i) => (
                        <tr key={i}>
                          <td><strong>{c.type}</strong></td>
                          <td><code>{c.key}</code></td>
                          <td>
                            {c.before !== null ? (
                              <span className="diff-del">{String(c.before)}</span>
                            ) : <em>(none)</em>}
                            {c.beforeQuote && <div className="quote-box">"{c.beforeQuote}"</div>}
                          </td>
                          <td>
                            {c.after !== null ? (
                              <span className="diff-add">{String(c.after)}</span>
                            ) : <em>(removed)</em>}
                            {c.afterQuote && <div className="quote-box">"{c.afterQuote}"</div>}
                          </td>
                          <td>{c.location || 'General'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Screenshots attached */}
                {item.afterSnapshotId?.screenshotPath && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                      Captured Screenshot:
                    </span>
                    <img
                      src={`http://localhost:4000${item.afterSnapshotId.screenshotPath}`}
                      alt="Scheme Screenshot"
                      className="screenshot-thumb"
                      onClick={() => setModalImage(`http://localhost:4000${item.afterSnapshotId.screenshotPath}`)}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      )}

      {/* TAB 2: MONITORED SOURCES */}
      {activeTab === 'sources' && (
        <section className="card">
          <div className="card-header">
            <h2>Monitored Government Schemes</h2>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Scheme Name</th>
                <th>Status</th>
                <th>Current Monitored URL</th>
                <th>Last Checked</th>
                <th>Last Outcome</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(s => (
                <tr key={s._id}>
                  <td><strong>{s.name}</strong><br /><small style={{ color: 'var(--text-muted)' }}>{s.slug}</small></td>
                  <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                  <td><a href={s.currentUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--primary)' }}>{s.currentUrl}</a></td>
                  <td>{s.lastCheckedAt ? new Date(s.lastCheckedAt).toLocaleTimeString() : 'Never'}</td>
                  <td><code>{s.lastOutcome || '-'}</code></td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleCheckSource(s._id, s.name)}
                      disabled={loading}
                    >
                      Check Now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* TAB 3: CHECK LOGS AUDIT TRAIL */}
      {activeTab === 'logs' && (
        <section className="card">
          <div className="card-header">
            <h2>Check Logs & Audit Trail</h2>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Every check records exact reasoning, including why cosmetic differences (visitor counter, banner notice, date stamps) were ignored.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Scheme</th>
                <th>Outcome</th>
                <th>Classification</th>
                <th>Reasoning / Ignored Rationale</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {checkLogs.map(l => (
                <tr key={l._id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(l.at).toLocaleTimeString()}</td>
                  <td><strong>{l.sourceId?.name || 'Unknown'}</strong></td>
                  <td><code>{l.outcome}</code></td>
                  <td><span className={`badge badge-${l.classification === 'meaningful' ? 'high' : 'low'}`}>{l.classification}</span></td>
                  <td style={{ fontSize: 12 }}>
                    {l.reasons?.map((r, idx) => (
                      <div key={idx}>{r}</div>
                    ))}
                  </td>
                  <td>{l.durationMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Screenshot Modal */}
      {modalImage && (
        <div className="modal-overlay" onClick={() => setModalImage(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3>Playwright Page Capture</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setModalImage(null)}>Close</button>
            </div>
            <img src={modalImage} alt="Full Screenshot" style={{ width: '100%', height: 'auto', border: '1px solid #ccc' }} />
          </div>
        </div>
      )}
    </div>
  );
}

if (typeof ReactDOM !== 'undefined' && document.getElementById('root')) {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(App));
}

export default App;
