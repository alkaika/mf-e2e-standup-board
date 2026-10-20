import React from 'react';

function EntryCard({ entry, name, isMine, onEdit, onDelete }) {
  return (
    <article className="card entry-card">
      <div className="entry-top">
        <div className="entry-person">
          <div className="avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</div>
          <div>
            <strong>{name}{isMine && <span className="you-tag">You</span>}</strong>
          </div>
        </div>
        {isMine && (
          <div className="entry-actions" aria-label="Your standup actions">
            <button type="button" onClick={onEdit}>Edit</button>
            <button className="delete-link" type="button" onClick={onDelete}>Delete</button>
          </div>
        )}
      </div>

      <section className="update-block">
        <div className="update-label">Yesterday</div>
        <div className="update-copy">{entry.yesterday}</div>
      </section>
      <section className="update-block">
        <div className="update-label">Today</div>
        <div className="update-copy">{entry.today}</div>
      </section>
      <section className="update-block">
        <div className="update-label blocker-label">Blockers</div>
        {entry.blockers?.trim()
          ? <div className="update-copy">{entry.blockers}</div>
          : <span className="no-blockers">No blockers</span>}
      </section>
    </article>
  );
}

export default EntryCard;
