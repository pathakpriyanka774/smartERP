import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { builderAPI } from '../services/api';
import PageRenderer from '../pagebuilder/PageRenderer';

/**
 * Route target for a client-built page: /p/:pageKey
 *
 * Uses the same renderer as the builder's preview, so a page cannot look one
 * way while being edited and another way once published.
 */
const CustomPage = () => {
  const { pageKey } = useParams();
  const [state, setState] = useState({ loading: true, error: null, page: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, page: null });
    builderAPI.page(pageKey)
      .then(res => { if (!cancelled) setState({ loading: false, error: null, page: res.data.data }); })
      .catch(err => {
        if (cancelled) return;
        setState({
          loading: false,
          error: err?.response?.status === 404
            ? 'This page does not exist. It may have been deleted.'
            : (err?.response?.data?.message || err.message),
          page: null
        });
      });
    return () => { cancelled = true; };   // avoid setting state after navigating away
  }, [pageKey]);

  if (state.loading) return <div className="pb-page"><p className="pb-placeholder">Loading…</p></div>;
  if (state.error) return <div className="pb-page"><h1>Page unavailable</h1><p className="pb-placeholder">{state.error}</p></div>;

  const { page } = state;
  return (
    <div className="pb-live-page">
      <header className="pb-live-head">
        <h1>{page.title}</h1>
        {page.description ? <p>{page.description}</p> : null}
        {page.status !== 'Active' && (
          <div className="pb-inactive-banner">
            This page is Inactive — it is hidden from the sidebar but still reachable by URL.
          </div>
        )}
      </header>
      <PageRenderer layout={page.layout} />
    </div>
  );
};

export default CustomPage;
