export async function providerFetch(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: 'include' })
  if (response.status === 401 && !url.includes('/auth/')) {
    window.dispatchEvent(new Event('helpr:session-expired'))
  }
  return response
}
