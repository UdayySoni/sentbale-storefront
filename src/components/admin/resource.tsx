'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { money } from '@/lib/catalog';
import { removeRow, saveRow, uid, useDb } from '@/lib/admin/store';
import type { Db, ListKey, Row } from '@/lib/admin/types';
import { Badge, Confirm, Drawer, exportCsv, Fields, formatDate, formatDateTime, fromForm, Loading, PageHeader, toForm, useToast, type Fld, type FormValues } from './ui';

export type Col = { key: string; label: string; get?: (row: Row, db: Db) => string | number; render?: (row: Row, db: Db) => ReactNode; kind?: 'money' | 'date' | 'datetime' | 'badge' | 'bool'; right?: boolean };
export type Resource = {
  list: ListKey; title: string; noun: string; description: string; cols: Col[]; fields: Fld[];
  name: (row: Row) => string;
  filter?: { key: string; label: string; options: string[]; get?: (row: Row, db: Db) => string };
  sort?: [string, 'asc' | 'desc'];
  blank?: (db: Db) => Record<string, unknown>;
  create?: boolean; edit?: boolean; remove?: boolean;
  actions?: (row: Row) => { label: string; patch: Record<string, unknown> }[];
  /** Final checks and derived values before saving. Return a message to reject. */
  clean?: (row: Row, db: Db) => Row | string;
  note?: string;
};
const PAGE = 10;
const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

export default function ResourcePage({ config, tabs }: { config: Resource; tabs?: ReactNode }) {
  const db = useDb();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filterValue = config.filter ? params.get(config.filter.key) || '' : '';
  const [query, setQuery] = useState(params.get('q') || '');
  const [sort, setSort] = useState(config.sort || [config.cols[0].key, 'asc'] as [string, 'asc' | 'desc']);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [error, setError] = useState('');
  const [doomed, setDoomed] = useState<Row | null>(null);
  const canEdit = config.edit !== false, canCreate = config.create !== false, canRemove = config.remove !== false;

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }
  function open(row: Row | 'new') {
    if (!db) return;
    setValues(toForm(config.fields, row === 'new' ? config.blank?.(db) || {} : row));
    setError('');
    setEditing(row);
  }
  const q = params.get('q'), wantsNew = params.get('new');
  useEffect(() => { setQuery(q || ''); setPage(0); }, [q, filterValue]);
  // Links such as "Add product" arrive with ?new=1: open the form once, then tidy the URL.
  useEffect(() => { if (wantsNew && db && canCreate) { open('new'); setParam('new', ''); } }, [wantsNew, !!db]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = (row: Row, col: Col) => (col.get ? col.get(row, db!) : row[col.key]) ?? '';
  const rows = useMemo(() => {
    if (!db) return [];
    const term = query.trim().toLowerCase();
    const filter = config.filter;
    const found = (db[config.list] as Row[]).filter(row => (!filterValue || !filter || String(filter.get ? filter.get(row, db) : row[filter.key]) === filterValue)
      && (!term || config.cols.some(col => String(col.get ? col.get(row, db) : row[col.key] ?? '').toLowerCase().includes(term))));
    const col = config.cols.find(c => c.key === sort[0]);
    if (!col) return found;
    const read = (row: Row) => col.get ? col.get(row, db) : row[col.key] ?? '';
    return [...found].sort((a, b) => { const x = read(a), y = read(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * (sort[1] === 'asc' ? 1 : -1); });
  }, [db, config, query, filterValue, sort]);
  if (!db) return <Loading />;

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE, current * PAGE + PAGE);

  function save() {
    if (!db || !editing) return;
    const cleaned = fromForm(config.fields, values);
    if (typeof cleaned === 'string') return setError(cleaned);
    const merged = { ...(editing === 'new' ? { id: uid(), ...config.blank?.(db) } : editing), ...cleaned } as Row;
    const final = config.clean ? config.clean(merged, db) : merged;
    if (typeof final === 'string') return setError(final);
    saveRow(config.list, final, config.noun, config.name(final));
    toast(`${capital(config.noun)} ${editing === 'new' ? 'created' : 'saved'}.`);
    setEditing(null);
  }
  function cell(row: Row, col: Col) {
    if (col.render) return col.render(row, db!);
    const v = value(row, col);
    if (col.kind === 'money') return money(Number(v));
    if (col.kind === 'date') return formatDate(String(v));
    if (col.kind === 'datetime') return formatDateTime(String(v));
    if (col.kind === 'badge') return <Badge>{String(v)}</Badge>;
    if (col.kind === 'bool') return v ? 'Yes' : 'No';
    return String(v);
  }
  function download() {
    exportCsv(`sentbale-${config.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, config.cols.map(col => col.label), rows.map(row => config.cols.map(col => { const v = value(row, col); return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v; })));
    toast(`Exported ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}.`);
  }
  const hasActions = canEdit || canRemove || !!config.actions;

  return <>
    <PageHeader title={config.title} description={config.description}>
      <button type="button" className="adm-btn ghost" onClick={download} disabled={!rows.length}><Download size={16} /> Export CSV</button>
      {canCreate && <button type="button" className="adm-btn" onClick={() => open('new')}><Plus size={16} /> New {config.noun}</button>}
    </PageHeader>
    {tabs}
    {config.note && <p className="adm-note">{config.note}</p>}
    <section className="adm-card adm-resource">
      <div className="adm-toolbar">
        <label className="adm-inline-search"><Search size={16} /><input type="search" aria-label={`Search ${config.title.toLowerCase()}`} placeholder={`Search ${config.title.toLowerCase()}…`} value={query} maxLength={80} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
        {config.filter && <select aria-label={config.filter.label} value={filterValue} onChange={event => setParam(config.filter!.key, event.target.value)}><option value="">{config.filter.label}: All</option>{config.filter.options.map(option => <option key={option}>{option}</option>)}</select>}
        <span className="adm-count">{rows.length} {rows.length === 1 ? 'result' : 'results'}</span>
      </div>
      <div className="adm-table-wrap"><table className="adm-table">
        <thead><tr>{config.cols.map(col => <th key={col.key} className={col.right ? 'right' : ''} aria-sort={sort[0] === col.key ? (sort[1] === 'asc' ? 'ascending' : 'descending') : undefined}>
          <button type="button" onClick={() => setSort([col.key, sort[0] === col.key && sort[1] === 'asc' ? 'desc' : 'asc'])}>{col.label}{sort[0] === col.key && (sort[1] === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th>)}
          {hasActions && <th className="right">Actions</th>}</tr></thead>
        <tbody>{visible.map(row => <tr key={row.id}>
          {config.cols.map(col => <td key={col.key} className={col.right ? 'right' : ''}>{cell(row, col)}</td>)}
          {hasActions && <td className="right"><div className="adm-row-actions">
            {config.actions?.(row).map(action => <button type="button" key={action.label} className="adm-chip" onClick={() => { saveRow(config.list, { ...row, ...action.patch }, config.noun, config.name(row)); toast(`${action.label}: ${config.name(row)}.`); }}>{action.label}</button>)}
            {canEdit && <button type="button" className="adm-icon-btn small" aria-label={`Edit ${config.name(row)}`} title="Edit" onClick={() => open(row)}><Pencil size={15} /></button>}
            {canRemove && <button type="button" className="adm-icon-btn small danger" aria-label={`Delete ${config.name(row)}`} title="Delete" onClick={() => setDoomed(row)}><Trash2 size={15} /></button>}
          </div></td>}
        </tr>)}</tbody>
      </table></div>
      {!rows.length && <p className="adm-empty">Nothing matches yet. {query || filterValue ? 'Try clearing the search or filter.' : canCreate ? `Create your first ${config.noun}.` : ''}</p>}
      {pages > 1 && <div className="adm-pager"><span>Page {current + 1} of {pages}</span>
        <button type="button" className="adm-icon-btn small" aria-label="Previous page" disabled={!current} onClick={() => setPage(current - 1)}><ChevronLeft size={16} /></button>
        <button type="button" className="adm-icon-btn small" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}><ChevronRight size={16} /></button></div>}
    </section>

    <Drawer open={!!editing} eyebrow={editing === 'new' ? 'NEW' : 'EDIT'} title={editing === 'new' ? `New ${config.noun}` : editing ? config.name(editing) : ''} onClose={() => setEditing(null)}>
      <form onSubmit={event => { event.preventDefault(); save(); }} noValidate>
        <Fields fields={config.fields} values={values} db={db} onChange={(name, next) => { setValues(v => ({ ...v, [name]: next })); setError(''); }} />
        {error && <p className="adm-form-error" role="alert">{error}</p>}
        <div className="adm-form-actions"><button type="button" className="adm-btn ghost" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="adm-btn">{editing === 'new' ? `Create ${config.noun}` : 'Save changes'}</button></div>
      </form>
    </Drawer>
    <Confirm open={!!doomed} title={`Delete this ${config.noun}?`} body={doomed ? `“${config.name(doomed)}” will be removed. This cannot be undone.` : ''} action="Delete"
      onCancel={() => setDoomed(null)} onConfirm={() => { if (doomed) { removeRow(config.list, doomed.id, config.noun, config.name(doomed)); toast(`${capital(config.noun)} deleted.`); } setDoomed(null); }} />
  </>;
}
