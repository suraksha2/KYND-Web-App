import MonthCalendar from './MonthCalendar'

const STEP_MIN = 30
const FIRST_SLOT = 7 * 60 // 7:00 AM
const LAST_SLOT = 22 * 60 + 30 // 10:30 PM

const TIME_SLOTS = Array.from(
  { length: Math.floor((LAST_SLOT - FIRST_SLOT) / STEP_MIN) + 1 },
  (_, i) => {
    const t = FIRST_SLOT + i * STEP_MIN
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
  }
)

const fmtTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * Tap-to-pick date & time. `value`, `onChange` and `min` all use the same
 * 'YYYY-MM-DDTHH:mm' local-time shape as a datetime-local input, so it drops
 * in wherever that input was used.
 */
export default function DateTimePicker({ value, onChange, min = '' }) {
  const date = (value || '').slice(0, 10)
  const time = (value || '').slice(11, 16)
  const minDate = min.slice(0, 10)

  const firstEnabledOn = (iso) =>
    TIME_SLOTS.find((s) => `${iso}T${s}` >= min) || TIME_SLOTS[TIME_SLOTS.length - 1]

  const pickDate = (iso) => {
    const keep = time && `${iso}T${time}` >= min ? time : firstEnabledOn(iso)
    onChange(`${iso}T${keep}`)
  }

  const pickTime = (slot) => {
    if (!date) return
    onChange(`${date}T${slot}`)
  }

  return (
    <div>
      <MonthCalendar
        value={date}
        minDate={minDate}
        canPick={(iso) => iso >= minDate}
        onPick={pickDate}
      />
      <p className="mt-3 text-xs font-semibold text-charcoal">Time</p>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {TIME_SLOTS.map((slot) => {
          const enabled = date && `${date}T${slot}` >= min
          return (
            <button
              key={slot}
              type="button"
              onClick={() => pickTime(slot)}
              disabled={!enabled}
              aria-pressed={time === slot}
              className={`rounded-full px-1 py-1.5 text-[11px] font-semibold border transition ${
                date && time === slot
                  ? 'bg-accent-100 border-terracotta text-terracotta'
                  : enabled
                    ? 'bg-white border-lightstone text-charcoal hover:border-terracotta'
                    : 'bg-white border-lightstone text-warmgrey/40 cursor-default'
              }`}
            >
              {fmtTime(slot)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
