import PhoneMockup from '../PhoneMockup'

export default function Steps() {
  const steps = [
    { n: 'STEP 1', t: 'Book', d: 'Tell us where you are and what you need. Pick a time that suits you — instant, scheduled or recurring.', screen: 'list' },
    { n: 'STEP 2', t: 'Confirm', d: 'We match you with a verified pro and confirm the details. Stack several tasks into one visit if you like.', screen: 'book' },
    { n: 'STEP 3', t: 'Relax', d: 'Your pro arrives on time and takes it from there. Track it in the app and pay only when you are happy.', screen: 'track' }
  ]
  return (
    <section id="how" className="py-16 bg-sage/15">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">Book → Confirm →<br />Relax.</h2>
          <p className="mt-3 text-warmgrey">Three simple steps to trusted help at your door.</p>
        </div>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
          {steps.map((s, i) => (
            <div key={i} className="rounded-3xl bg-white p-6 flex flex-col items-center text-center shadow-soft border border-lightstone">
              <div className="rounded-2xl bg-accent-50 p-4 w-full flex items-center justify-center">
                <PhoneMockup screen={s.screen} size="sm" />
              </div>
              <div className="mt-5 text-[11px] font-bold tracking-widest text-terracotta">{s.n}</div>
              <h3 className="mt-1 font-heading text-lg font-bold text-charcoal">{s.t}</h3>
              <p className="mt-1 text-sm text-warmgrey max-w-[260px]">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
