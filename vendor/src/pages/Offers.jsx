import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { AlertCircle, Clock, Inbox, Info, Loader2, Plus, Star, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import { formatMoney, formatTime12h, durationLabel, initials, parseSgt, sgtDayOf } from '../lib/format'

// An offer this close to expiring gets the red "about to expire" treatment —
// the top banner and the card's own warning line.
const EXPIRE_SOON_MINUTES = 15

// "Wed 7 Oct, 9am–1pm" — the compact window label used in both offer lists.
function windowLabel(start, end) {
  const s = parseSgt(start)
  if (!s) return ''
  const day = new Intl.DateTimeFormat('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore',
  }).format(s).replace(',', '')
  const e = parseSgt(end)
  return e ? `${day}, ${formatTime12h(s)}–${formatTime12h(e)}` : `${day}, ${formatTime12h(s)}`
}

// Under an hour reads as "H:MM" (e.g. "0:05"); an hour or more reads as
// "XhYm" — mirrors how little precision a vendor needs once there's time to
// spare, and how much they need once there isn't.
function formatCountdown(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (m < 60) return `${h}:${String(rem).padStart(2, '0')}`
  return `${h}h${rem}m`
}

function closedLabel(offer) {
  switch (offer.status) {
    case 'accepted':
      return 'Accepted — added to your jobs'
    case 'declined':
      return offer.declineReason ? `Declined · ${offer.declineReason}` : 'Declined'
    case 'taken':
      return 'Another partner took this offer'
    default:
      return offer.heldByTeam
        ? 'Already with your team — Kynd assigned your pro directly'
        : 'Expired, Kynd offered it to another partner'
  }
}

function OpenOfferCard({ offer, onAccept, onDecline, busy, innerRef }) {
  const [confirming, setConfirming] = useState(false)
  const net = Math.round(offer.price * (1 - (offer.feePct || 0) / 100) * 100) / 100
  const soon = offer.expiresInMinutes <= EXPIRE_SOON_MINUTES

  return (
    <div ref={innerRef} className="rounded-2xl border border-lightstone bg-white px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-charcoal">
            {offer.serviceLabel}
            {offer.windowEnd && <span className="font-normal text-warmgrey"> · {durationLabel(offer.windowStart, offer.windowEnd)}</span>}
          </p>
          <p className="mt-0.5 text-xs text-warmgrey">
            {offer.category ? `${offer.category} · ` : ''}{offer.area || ''}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0 ${
          soon ? 'bg-danger/10 text-danger' : 'bg-lightstone/60 text-charcoal'
        }`}>
          <Clock className="w-3 h-3" />
          {formatCountdown(offer.expiresInMinutes)}
        </span>
      </div>

      <p className="mt-2 text-sm font-semibold text-charcoal">{windowLabel(offer.windowStart, offer.windowEnd)}</p>

      {soon && (
        <p className="mt-1.5 text-xs font-semibold text-danger">
          Expires soon. If no one replies, Kynd offers it to another partner.
        </p>
      )}

      <div className="mt-3 pt-3 border-t border-lightstone">
        <div className="rounded-xl bg-warmlinen/70 px-3.5 py-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-warmgrey">You earn</span>
          <span className="text-base font-bold text-charcoal">{formatMoney(net)}</span>
        </div>

        {offer.notes && (
          <p className="mt-2.5 flex items-start gap-1.5 text-xs text-warmgrey">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {offer.notes}
          </p>
        )}

        {offer.suggested && (
          <div className="mt-2.5 flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-accent-100 text-terracotta text-[10px] font-bold shrink-0">
              {initials(offer.suggested.name)}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-charcoal truncate">Kynd suggests {offer.suggested.name}</p>
              <p className="text-[11px] text-warmgrey truncate">
                {offer.suggested.clashNote && <span className="text-danger font-medium">Clash: {offer.suggested.clashNote}</span>}
                {offer.suggested.clashNote && offer.suggested.rating > 0 && ' · '}
                {offer.suggested.rating > 0 && (
                  <span className="inline-flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />rated {offer.suggested.rating.toFixed(1)}</span>
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3.5 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onAccept(offer)}
          disabled={busy}
          className="inline-flex items-center rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-4 py-2 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
        >
          Accept and assign
        </button>
        {confirming ? (
          <>
            <span className="text-xs text-warmgrey">Decline this offer?</span>
            <button
              onClick={() => onDecline(offer)}
              disabled={busy}
              className="text-xs font-semibold text-danger hover:underline disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded"
            >
              Yes, decline
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="text-xs font-semibold text-warmgrey hover:text-charcoal focus:outline-none rounded"
            >
              Keep it
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="text-sm font-semibold text-warmgrey hover:text-danger px-2 py-2 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-lg transition-colors"
          >
            Decline
          </button>
        )}
      </div>
    </div>
  )
}

// Status line under each member's name in the picker: leave and clashes are
// warnings (assigning anyway is still allowed), otherwise how busy they are.
function memberStatus(m) {
  if (m.onLeave?.length) {
    const l = m.onLeave[0]
    return { warn: true, text: `On leave ${l.startDate === l.endDate ? l.startDate : `${l.startDate} – ${l.endDate}`}` }
  }
  if (m.outsideHours) return { warn: true, text: 'Outside working hours' }
  if (m.clashes?.length) {
    const c = m.clashes[0]
    return {
      warn: true,
      text: `Clash: ${c.serviceLabel} ${String(c.windowStart).slice(11, 16)}–${String(c.windowEnd || '').slice(11, 16)}`,
    }
  }
  const n = m.jobsToday || 0
  return { warn: false, text: `Free · ${n} other job${n === 1 ? '' : 's'} that day` }
}

// "Accept and choose who goes": fetches this vendor's team for the offer's
// window via /vendor/team/availability so the owner can accept and hand the
// job to someone in one step — or accept now and assign later.
function AcceptAssignModal({ offer, token, busy, onConfirm, onClose }) {
  const [members, setMembers] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(offer.suggested?.id || null)

  useEffect(() => {
    let cancelled = false
    const start = parseSgt(offer.windowStart)
    const end = parseSgt(offer.windowEnd)
    const durationMin = start && end ? Math.round((end - start) / 60000) : 120
    // windowStart may arrive as a bare SGT string or an ISO "Z" instant —
    // the endpoint wants SGT wall clock ("YYYY-MM-DD HH:MM"), so format the
    // parsed instant in Asia/Singapore rather than slicing the raw value.
    const at = start
      ? `${sgtDayOf(offer.windowStart)} ${new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore',
        }).format(start)}`
      : ''
    if (!at) {
      setLoadError('This offer is missing a scheduled time.')
      return
    }
    vendorFetch(`/vendor/team/availability?at=${encodeURIComponent(at)}&durationMin=${durationMin}`, token)
      .then((d) => { if (!cancelled) setMembers(d.members || []) })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'Failed to load team.') })
    return () => { cancelled = true }
  }, [offer, token])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-charcoal/50" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-soft p-5 sm:p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-bold text-charcoal">Accept and choose who goes</h2>
            <p className="mt-1 text-sm text-warmgrey">
              {offer.serviceLabel}
              {offer.windowEnd && ` · ${durationLabel(offer.windowStart, offer.windowEnd)}`}
              {offer.area && ` · ${offer.area}`}
              {` · ${windowLabel(offer.windowStart, offer.windowEnd)}`}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-warmgrey hover:text-charcoal disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-2.5">
          {loadError ? (
            <div className="rounded-2xl bg-red-50 border border-red-100 text-danger text-sm px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {loadError}
            </div>
          ) : members === null ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-terracotta" />
            </div>
          ) : members.length === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-lightstone px-4 py-6 text-center text-sm text-warmgrey">
              No active team members yet — add someone from the Team page first.
            </p>
          ) : (
            members.map((m) => {
              const st = memberStatus(m)
              const isSel = selected === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => setSelected(isSel ? null : m.id)}
                  disabled={busy}
                  className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
                    isSel
                      ? 'border-terracotta bg-accent-100/60'
                      : 'border-lightstone bg-white hover:border-warmgrey/40'
                  }`}
                >
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-accent-100 text-terracotta text-xs font-bold shrink-0">
                    {initials(m.name)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-charcoal truncate">{m.name}</span>
                    <span className={`block text-xs truncate ${st.warn ? 'text-amber-700 font-medium' : 'text-warmgrey'}`}>
                      {st.text}
                    </span>
                  </span>
                  {m.rating > 0 && (
                    <span className="inline-flex items-center gap-1 text-sm text-charcoal shrink-0">
                      <Star className="w-3.5 h-3.5 text-warmgrey" />
                      {m.rating.toFixed(1)}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-5">
          <button
            onClick={() => onConfirm(null)}
            disabled={busy}
            className="text-sm font-semibold text-charcoal hover:text-terracotta disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded transition-colors"
          >
            Accept, assign later
          </button>
          <button
            onClick={() => onConfirm(selected)}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {selected ? 'Accept and assign' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Offers() {
  const { profile, reload } = useOutletContext()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [assignOffer, setAssignOffer] = useState(null)
  const cardRefs = useRef({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await vendorFetch('/vendor/offers', token))
    } catch (err) {
      setError(err.message || 'Failed to load offers.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const open = data?.open || []
  const closed = data?.closed || []

  const categories = useMemo(() => {
    const fromOffers = data?.categories || []
    const fromVendor = profile?.vendor?.categories || []
    return [...new Set([...fromOffers, ...fromVendor])]
  }, [data, profile])

  const matchCategory = (o) => category === 'all' || o.category === category
  const visibleOpen = open.filter(matchCategory)
  const visibleClosed = closed.filter(matchCategory)

  // `open` is sorted soonest-expiry-first, so the first entry is the one
  // worth pinning to the top banner.
  const expiringSoon = open[0]?.expiresInMinutes <= EXPIRE_SOON_MINUTES ? open[0] : null

  const act = async (offer, action, body) => {
    setBusyId(offer.id)
    setError('')
    try {
      await vendorFetch(`/vendor/offers/${offer.id}/${action}`, token, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      await Promise.all([load(), reload()])
      return true
    } catch (err) {
      setError(err.message || `Failed to ${action} offer.`)
      return false
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-charcoal">Offer inbox</h1>
        <button
          onClick={() => navigate('/jobs', { state: { quickAdd: true } })}
          className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-5 py-3 shadow-soft focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Quick add job
        </button>
      </div>

      {expiringSoon && (
        <div className="rounded-2xl bg-danger/10 border border-danger/20 px-4 py-3 flex items-center gap-3 flex-wrap">
          <Clock className="w-5 h-5 text-danger shrink-0" />
          <p className="min-w-0 flex-1 text-sm text-charcoal">
            <span className="font-semibold text-danger">Offer about to expire</span>
            <span className="text-warmgrey">
              {' '}· {formatCountdown(expiringSoon.expiresInMinutes)} left to reply · {expiringSoon.serviceLabel}, {expiringSoon.area}
              {' '}· {windowLabel(expiringSoon.windowStart, expiringSoon.windowEnd)} · {formatMoney(expiringSoon.price)}
            </span>
          </p>
          <button
            onClick={() => cardRefs.current[expiringSoon.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="inline-flex items-center rounded-xl bg-terracotta hover:bg-accent-600 text-white text-xs font-semibold px-4 py-2 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
          >
            Review offer
          </button>
        </div>
      )}

      <p className="text-sm text-warmgrey max-w-2xl">
        Kynd sends offers that match your services and area. Accept, then choose who goes.
        Kynd may suggest someone. You always decide and can change it later.
      </p>

      {categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {['all', ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
                category === c
                  ? 'bg-white border-terracotta text-terracotta'
                  : 'bg-white/60 border-lightstone text-warmgrey hover:text-charcoal hover:border-warmgrey/40'
              }`}
            >
              {c === 'all' ? 'All services' : c}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-100 text-danger text-sm px-5 py-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-7 h-7 animate-spin text-terracotta" />
        </div>
      ) : visibleOpen.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-lightstone px-6 py-10 text-center">
          <p className="text-sm text-warmgrey">
            No offers waiting. New ones appear here and on Home as soon as Kynd sends them.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          {visibleOpen.map((offer) => (
            <OpenOfferCard
              key={offer.id}
              offer={offer}
              busy={busyId === offer.id}
              innerRef={(el) => { cardRefs.current[offer.id] = el }}
              onAccept={setAssignOffer}
              onDecline={(o) => act(o, 'decline')}
            />
          ))}
        </div>
      )}

      {visibleClosed.length > 0 && (
        <section>
          <h2 className="font-heading text-lg font-bold text-charcoal mb-3">Closed</h2>
          <div className="space-y-2.5">
            {visibleClosed.map((offer) => (
              <div
                key={offer.id}
                className="flex items-center gap-3 rounded-2xl border border-lightstone bg-white px-4 py-3.5"
              >
                {offer.status === 'accepted' || offer.heldByTeam ? (
                  <Inbox className="w-4 h-4 text-sage shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-warmgrey shrink-0" />
                )}
                <p className="min-w-0 flex-1 text-sm text-charcoal truncate">
                  <span className="font-semibold">{offer.serviceLabel}</span>
                  {offer.windowEnd && <span className="text-warmgrey"> · {durationLabel(offer.windowStart, offer.windowEnd)}</span>}
                  <span className="text-warmgrey">
                    {offer.area ? ` · ${offer.area}` : ''} · {windowLabel(offer.windowStart, offer.windowEnd)}
                  </span>
                </p>
                <p className="text-xs text-warmgrey shrink-0">{closedLabel(offer)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {assignOffer && (
        <AcceptAssignModal
          offer={assignOffer}
          token={token}
          busy={busyId === assignOffer.id}
          onClose={() => setAssignOffer(null)}
          onConfirm={async (assigneeId) => {
            // Close either way — on failure the page error banner explains
            // (e.g. the offer was just taken by another partner).
            await act(assignOffer, 'accept', assigneeId ? { assigneeId } : undefined)
            setAssignOffer(null)
          }}
        />
      )}
    </div>
  )
}
