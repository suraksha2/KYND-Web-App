type TablePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  overallTotal?: number;
  label: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export default function TablePagination({
  page, pageSize, total, overallTotal, label, onPageChange, onPageSizeChange,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-lightstone/50 text-xs text-warmgrey">
      <p aria-live="polite">
        Showing <span className="font-semibold">{start}–{end}</span> of{" "}
        <span className="font-semibold">{total}</span> {label}
        {overallTotal !== undefined && overallTotal !== total && ` (${overallTotal} total)`}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          Rows per page
          <select
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-lightstone bg-white px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-terracotta/30"
          >
            {[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <nav aria-label={`${label} pagination`} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="rounded-lg border border-lightstone px-3 py-1.5 font-semibold hover:bg-accent-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className="rounded-lg border border-lightstone px-3 py-1.5 font-semibold hover:bg-accent-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </nav>
      </div>
    </div>
  );
}
