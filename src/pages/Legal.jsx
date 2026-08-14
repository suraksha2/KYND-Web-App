import PageHero from '../components/PageHero'

const Section = ({ title, body }) => (
  <div className="mt-8">
    <h2 className="font-heading text-lg font-bold text-charcoal">{title}</h2>
    <p className="mt-2 text-sm text-charcoal leading-relaxed whitespace-pre-line">{body}</p>
  </div>
)

export function TnC() {
  return (
    <div>
      <PageHero title="Terms & Conditions" subtitle="Last updated: today." />
      <section className="py-14">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-sm text-charcoal">
            By using the Kynd app and website, you agree to these Terms. Please read them carefully.
          </p>
          <Section title="1. Service" body="Kynd provides a platform to book trained, background-verified professionals (Pros) for household tasks. Services are offered subject to availability in your locality and as listed in the Kynd app." />
          <Section title="2. Bookings" body="Confirmed bookings are non-transferrable. You may reschedule or cancel a booking up to 2 hours before the slot at no charge. Late cancellations may attract a fee as per the Cancellation Policy." />
          <Section title="3. Pricing & payment" body="Pricing for each service is shown upfront in the app and includes applicable taxes. Payment is made through the in-app gateway via UPI, card, netbanking or wallet." />
          <Section title="4. Conduct" body="You agree to provide a safe environment for the Pro and to treat them with respect. Kynd reserves the right to refuse service to any user violating this clause." />
          <Section title="5. Liability" body="Kynd's aggregate liability for any claim arising out of a service shall not exceed the value of the booking concerned." />
          <Section title="6. Contact" body="Questions? Email help@kynd.sg." />
        </div>
      </section>
    </div>
  )
}

export function PrivacyPolicy() {
  return (
    <div>
      <PageHero title="Privacy Policy" subtitle="How Kynd collects, uses and protects your information." />
      <section className="py-14">
        <div className="max-w-3xl mx-auto px-6">
          <Section title="Information we collect" body={"• Account details: name, phone, email\n• Address & locality\n• Booking history & preferences\n• Device & app usage data"} />
          <Section title="How we use it" body="To deliver bookings, assign verified Pros, process payments, send service updates, and improve the platform." />
          <Section title="Sharing" body="We never sell your data. We share limited information with assigned Pros (first name, address, contact mask) and with payment partners for transaction processing." />
          <Section title="Your rights" body="You can update your profile, request data export, or delete your account from the app. Email help@kynd.sg for any privacy-related request." />
          <Section title="Security" body="Data is encrypted in transit and at rest. Payment information is tokenised and handled by PCI-DSS compliant partners." />
        </div>
      </section>
    </div>
  )
}

export function CancellationPolicy() {
  return (
    <div>
      <PageHero title="Cancellation Policy" subtitle="Plans change. Here's how Kynd handles it." />
      <section className="py-14">
        <div className="max-w-3xl mx-auto px-6">
          <Section title="Free cancellation window" body="Cancel or reschedule up to 2 hours before the slot at no charge." />
          <Section title="Late cancellations" body="Cancellations within 2 hours of the slot may incur a fee equivalent to up to 50% of the booking value, applied to keep our Pros fairly compensated." />
          <Section title="No-show policy" body="If the Pro is unable to start the service due to no access (locked premises, no response), the full booking amount may be charged." />
          <Section title="Kynd-initiated cancellations" body="If a Pro cannot make it, the system auto-reassigns. If no Pro is available, we issue a full refund." />
        </div>
      </section>
    </div>
  )
}

export function Credits() {
  return (
    <div>
      <PageHero title="Photo Credits" subtitle="With thanks to the photographers and illustrators who made this site beautiful." />
      <section className="py-14">
        <div className="max-w-3xl mx-auto px-6 text-sm text-charcoal">
          <p>All photography on this website is licensed via Unsplash under the Unsplash License unless otherwise stated.</p>
          <p className="mt-3">If you believe an image has been used incorrectly, please reach out to <a className="text-accent-700 font-semibold" href="mailto:help@kynd.sg">help@kynd.sg</a>.</p>
        </div>
      </section>
    </div>
  )
}
