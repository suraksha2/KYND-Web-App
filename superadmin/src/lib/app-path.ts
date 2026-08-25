/** Path inside this SPA, with the Vite/router basename stripped. */
export function appPathname(pathname: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
    return pathname.slice(base.length) || '/'
  }
  return pathname
}
