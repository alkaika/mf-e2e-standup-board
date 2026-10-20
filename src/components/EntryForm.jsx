import React, { useState } from 'react';

function EntryForm({ entry, dateLabel, saving, error, success, onSubmit, onCancel }) {
  const [yesterday, setYesterday] = useState(entry?.yesterday || '');
  const [today, setToday] = useState(entry?.today || '');
  const [blockers, setBlockers] = useState(entry?.blockers || '');
  const [fieldErrors, setFieldErrors] = useState({});

  function submit(event) {
    event.preventDefault();
    onSubmit({ yesterday, today, blockers }, setFieldErrors);
  }

  const hasExistingEntry = Boolean(entry);

  return (
    <section className="card form-card" id="standup-form" aria-labelledby="form-heading">
      <div className="form-head">
        <div>
          <h3 id="form-heading">{hasExistingEntry ? 'Your standup' : 'Add your standup'}</h3>
          <p>{dateLabel} · Your update is visible to the team.</p>
        </div>
      </div>
      {error && <div className="inline-alert" role="alert">{error}</div>}
      {success && <div className="success-alert" role="status">{success}</div>}
      <form onSubmit={submit} noValidate>
        <div className="form-fields">
          <div>
            <label className="form-label" htmlFor="yesterday">Yesterday <span className="required" aria-label="required">*</span></label>
            <textarea
              id="yesterday"
              className="textarea"
              value={yesterday}
              onChange={(event) => {
                setYesterday(event.target.value);
                setFieldErrors((old) => ({ ...old, yesterday: '' }));
              }}
              placeholder="What did you accomplish?"
              required
              aria-invalid={Boolean(fieldErrors.yesterday)}
              aria-describedby={fieldErrors.yesterday ? 'yesterday-error' : undefined}
            />
            {fieldErrors.yesterday && <div className="field-error" id="yesterday-error">{fieldErrors.yesterday}</div>}
          </div>
          <div>
            <label className="form-label" htmlFor="today">Today <span className="required" aria-label="required">*</span></label>
            <textarea
              id="today"
              className="textarea"
              value={today}
              onChange={(event) => {
                setToday(event.target.value);
                setFieldErrors((old) => ({ ...old, today: '' }));
              }}
              placeholder="What are you focusing on?"
              required
              aria-invalid={Boolean(fieldErrors.today)}
              aria-describedby={fieldErrors.today ? 'today-error' : undefined}
            />
            {fieldErrors.today && <div className="field-error" id="today-error">{fieldErrors.today}</div>}
          </div>
          <div>
            <label className="form-label" htmlFor="blockers">Blockers <span className="muted" style={{ fontWeight: 500 }}>(optional)</span></label>
            <textarea
              id="blockers"
              className="textarea"
              value={blockers}
              onChange={(event) => setBlockers(event.target.value)}
              placeholder="Anything slowing you down?"
              style={{ minHeight: 72 }}
            />
          </div>
        </div>
        <div className="form-actions">
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : hasExistingEntry ? 'Save changes' : 'Submit standup'}
          </button>
          {onCancel && <button className="button button-secondary" type="button" disabled={saving} onClick={onCancel}>Cancel</button>}
        </div>
      </form>
    </section>
  );
}

export default EntryForm;
