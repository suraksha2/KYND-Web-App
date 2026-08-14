import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import PageHero from '../components/PageHero'

const items = [
  { q: 'What is Kynd?', a: 'Kynd is an on-demand and subscription-based house help platform connecting trained, background-verified Pros with urban homes — for cleaning, laundry, kitchen and bathroom upkeep. Schedule for later or get instant service in 15 minutes.' },
  { q: 'How is Kynd different from existing options?', a: "Trained background-verified Pros, transparent in-app pricing, on-demand booking within 15 minutes, and the ability to pause or reschedule without awkward conversations. No advance payment, no informal commitments, and no risk of a no-show with no recourse." },
  { q: 'How do I download the Kynd app?', a: 'On Google Play Store or Apple App Store — search "Kynd - house help". Sign up takes under a minute with phone number, address, and OTP.' },
  { q: 'How do I book a service?', a: 'Open the app, select chores, pick a time and we send a verified professional.' },
  { q: 'How fast can a Pro reach me?', a: 'Within 15 minutes for instant bookings. Or schedule for later or set up a recurring slot.' },
  { q: 'Can I stack multiple tasks?', a: 'Yes — sweeping, mopping, utensils, ironing — combined into one booking handled by a single Pro in one visit.' },
  { q: 'Do you support recurring bookings?', a: 'Yes — daily, weekly, or a custom cadence. The system auto-assigns the best available trained Pro for every visit.' },
  { q: 'Are the Pros verified?', a: 'Every Kynd Pro completes a formal training program and a thorough background check before their first booking.' },
  { q: 'What if I am not satisfied?', a: 'Reach support immediately on +91 9910483315 or help@kynd.sg. We resolve, send a replacement Pro if needed, and refund where appropriate.' },
  { q: 'How is pricing calculated?', a: 'Transparent and shown upfront in the app — per visit, no per-bedroom multipliers, no hidden charges, no advance deposits.' },
  { q: 'Which cities is Kynd in?', a: '15 Indian cities: Ahmedabad, Bangalore, Chennai, Delhi, Faridabad, Ghaziabad, Gurgaon, Hyderabad, Jaipur, Kolkata, Mumbai, Navi Mumbai, Noida, Pune, and Thane.' },
  { q: 'How do I contact support?', a: 'Call +91 9910483315 or email help@kynd.sg.' }
]

export default function FAQ() {
  const [open, setOpen] = useState(0)
  return (
    <div>
      <PageHero title="Frequently Asked Questions" subtitle="Everything you need to know about Kynd." />
      <section className="py-14">
        <div className="max-w-3xl mx-auto px-6 space-y-3">
          {items.map((it, i) => {
            const isOpen = open === i
            return (
              <div key={i} className="rounded-2xl bg-white border border-lightstone shadow-sm">
                <button onClick={() => setOpen(isOpen ? -1 : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                  <span className="font-medium text-charcoal">{it.q}</span>
                  <span className={`w-7 h-7 grid place-items-center rounded-full bg-charcoal text-white transition ${isOpen ? 'rotate-180' : ''}`}>
                    <ChevronDown className="w-4 h-4" />
                  </span>
                </button>
                {isOpen && <div className="px-5 pb-5 text-sm text-warmgrey -mt-1">{it.a}</div>}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
