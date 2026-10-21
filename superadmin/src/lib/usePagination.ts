import { useEffect, useState } from "react";

export function usePagination<T>(items: T[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;

  useEffect(() => {
    setPage(p => Math.min(p, totalPages));
  }, [totalPages]);

  return {
    pageItems: items.slice(start, start + pageSize),
    resetPage: () => setPage(1),
    pagination: {
      page: currentPage,
      pageSize,
      total: items.length,
      onPageChange: setPage,
      onPageSizeChange: (size: number) => {
        setPageSize(size);
        setPage(1);
      },
    },
  };
}
