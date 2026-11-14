import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import PageHero from '../components/PageHero'
import Seo from '../components/Seo'
import { faqPageSchema } from '../lib/schema'

const items = [
  { q: 'What is Kynd?', a: 'Kynd is an on-demand and subscription-based house help platform connecting trained, background-verified Pros with urban homes — for cleaning, laundry, kitchen and bathroom upkeep. Schedule for later or get instant service in 15 minutes.' },
  { q: 'How is Kynd different from existing options?', a: "Trained background-verified Pros, transparent in-app pricing, on-demand booking within 15 minutes, and the ability to pause or reschedule without awkward conversations. No advance payment, no informal commitments, and no risk of a no-show with no recourse." },
  { q: 'How do I download the Kynd app?', a: 'On Google Play Store or Apple App Store — search "Kynd - house help". Sign up takes under a minute with phone number, address, and OTP.' },
  { q: 'How do I book a service?', a: 'Open the app, select chores, pick a time and we send a verified professional.' },
  { q: 'How fast can a Pro reach me?', a: 'Within 15 minutes for instant bookings. Or schedule for later or set up a recurring slot.' },
  { q: 'Can I stack multiple tasks?', a: 'Yes — sweeping, mopping, utensils, ironing — combined into one booking handled by a single Pro in one visit.' },
  { q: 'Do you support recurring bookings?', a: 'Yes — daily, weekly, or a custom cadence. The system auto-assigns the best available trained Pro for every visit.' },
  { q: 'Are the Pros verified?', a: 'Every Kynd Pro completes a formal training program and a thorough background check before their first booking.' },
  { q: 'What if I am not satisfied?', a: 'Reach our support team using the contact details on the Support page. We will review the issue and help with the next steps.' },
  { q: 'How is pricing calculated?', a: 'Transparent and shown upfront in the app — per visit, no per-bedroom multipliers, no hidden charges, no advance deposits.' },
  { q: 'Which cities is Kynd in?', a: 'Availability depends on your service address. Use the city selector in the booking form to see whether Kynd serves your area.' },
  { q: 'How do I contact support?', a: 'Visit the Support page for our current phone and email contact details.' },
  { q: 'How does Kynd verify its pros?', a: "Every professional on Kynd goes through a background check, identity verification, and reference screening before they're allowed to accept bookings. We re-verify periodically." },
  { q: "What happens if I'm not happy with a service?", a: 'Contact our support team using the details on the Support page and we will help resolve the issue.' },
  { q: 'How do I cancel or reschedule a booking?', a: 'Cancel or reschedule from the app up to 2 hours before your slot at no charge. Later cancellations may incur a fee as per the Cancellation Policy.' },
  { q: 'Are pros insured?', a: 'Yes — every booking made through Kynd is covered against accidental damage during the visit. If something goes wrong, contact support and we will sort it out.' },
  { q: 'Which areas does Kynd operate in?', a: 'Available areas are shown after you select a city in the booking form. We only accept bookings for supported locations.' },
  { q: 'How do I become a Kynd pro?', a: 'Email help@kynd.sg to apply. Once you clear background verification and complete our training program, you can start accepting bookings through the Kynd Pro app.' }
]

export default function FAQ() {
  const [open, setOpen] = useState(0)
  return (
    <div>
      <Seo
        title="Frequently asked questions"
        description="Everything you need to know about Kynd — booking, pricing, Pros, and support."
        path="/frequently-asked-questions"
        jsonLd={faqPageSchema(items)}
      />
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
