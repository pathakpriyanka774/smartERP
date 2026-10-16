import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../utils/format';

/**
 * A server-paginated list with search and filters.
 *
 *   const list = usePagedList(params => ordersAPI.getAll(params), { pageSize: 25, filters: { status } });
 *   list.rows, list.pagination, list.loading, list.error
 *   list.setPage(n), list.setQuery(text), list.reload()
 *
 * `fetcher` receives { page, pageSize, q, ...filters } and returns an axios
 * promise resolving to { data: { data: [...], pagination } }. The search text
 * is debounced; changing it or a filter goes back to page 1. Stale responses
 * (an earlier request finishing after a later one) are ignored.
 */
export default function usePagedList(fetcher, { pageSize = 25, filters = {}, debounceMs = 300 } = {}) {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [query, setQueryState] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), debounceMs);
    return () => clearTimeout(t);
  }, [query, debounceMs]);

  // A new search or filter starts again from the first page.
  useEffect(() => { setPage(1); }, [debounced, filterKey]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const params = { page, pageSize, ...JSON.parse(filterKey) };
      if (debounced) params.q = debounced;
      Object.keys(params).forEach(k => (params[k] === '' || params[k] == null) && delete params[k]);
      const res = await fetcherRef.current(params);
      if (mine !== seq.current) return;
      setRows(res.data?.data || []);
      setPagination(res.data?.pagination || { page, pageSize, total: (res.data?.data || []).length, totalPages: 1 });
    } catch (err) {
      if (mine !== seq.current) return;
      setRows([]);
      setError(errorMessage(err, 'Could not load the list'));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [page, pageSize, debounced, filterKey]);

  useEffect(() => { load(); }, [load]);

  return { rows, pagination, page, setPage, query, setQuery: setQueryState, loading, error, reload: load };
}
