const peopleImage = (name) =>
  import.meta.env.BASE_URL + 'images/people/' + encodeURIComponent(name)

const beliefs = [
  {
    title: 'We believe trust is not a checkbox.',
    body: 'Background checks that are actually thorough. Insurance that actually pays out. Reviews that are actually real. Trust is earned in the details, not claimed in a badge.',
  },
  {
    title: 'We believe help should feel human.',
    body: 'Not a gig, not a transaction. A person who shows up, does the work with care, and treats your home like it matters — because it does.',
  },
  {
    title: 'We believe in showing up for the moments that matter.',
    body: "A new baby. Ageing parents. A home that needs tending. These aren't errands. They're the moments life is made of, and we take them seriously.",
  },
  {
    title: 'We believe pros deserve respect too.',
    body: 'Fair pay, steady work, and the same trust we ask our customers to place in them. Kynd only works if it works for both sides.',
  },
  {
    title: 'We believe in less friction, more life.',
    body: "Three taps to book. No haggling, no guesswork, no wondering if someone will show up. The less you have to think about it, the more it's working.",
  },
]

const stats = [
  { label: 'Jobs completed', value: '500+' },
  { label: 'Verified pros', value: '120+' },
  { label: 'Avg rating', value: '4.8★' },
]

export default function About() {
  return (
    <div>
      {/* Hero */}
      <section className="pt-32 pb-14 bg-warmlinen">
        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-2 gap-10 items-center">
          <h1 className="font-heading text-4xl md:text-5xl font-extrabold tracking-tight text-charcoal leading-[1.05]">
            Trusted people<br />
            <span className="text-terracotta">for the moments<br />that matter.</span>
          </h1>
          <div className="rounded-3xl overflow-hidden bg-white/60 ring-1 ring-black/5 aspect-[4/3]">
            <img
              src={peopleImage('verified pros.png')}
              alt="A verified Kynd pro at work"
              className="w-full h-full object-cover"
              draggable="false"
            />
          </div>
        </div>
      </section>

      {/* Manifesto */}
      <section className="py-14">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="font-heading text-2xl font-extrabold text-charcoal">Our manifesto</h2>
          <div className="mt-8 space-y-7">
            {beliefs.map((b) => (
              <div key={b.title}>
                <h3 className="font-semibold text-terracotta">{b.title}</h3>
                <p className="mt-1.5 text-sm text-charcoal/80 leading-relaxed">{b.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 font-semibold text-terracotta leading-relaxed">
            This is why we exist: so you can spend less time worrying about who's coming
            through your door, and more time on everything else.
          </p>
        </div>
      </section>

      {/* Team / moment photo */}
      <section className="pb-14">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-3xl overflow-hidden bg-warmlinen ring-1 ring-black/5 aspect-[16/7]">
            <img
              src={peopleImage('Elderly care.png')}
              alt="A Kynd pro sharing a moment with a customer"
              className="w-full h-full object-cover"
              draggable="false"
            />
          </div>
        </div>
      </section>

      {/* About us */}
      <section className="py-14 bg-warmlinen">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="font-heading text-2xl font-extrabold text-charcoal">About us</h2>
          <div className="mt-6 space-y-4 text-sm text-charcoal/80 leading-relaxed">
            <p>
              Kynd started with a simple frustration: finding someone you could actually
              trust to help around the house or care for family took too much luck.
              Word-of-mouth only stretches so far, and directory listings don't tell you
              who's really behind the profile.
            </p>
            <p>
              So we built a marketplace where every professional is background-checked,
              identity-verified, and insured before they ever show up at your door — for
              home cleaning, AC servicing, tutoring, babysitting, and elderly care and
              companionship.
            </p>
            <p>
              Today Kynd operates across Singapore and is expanding across Southeast Asia,
              connecting households with professionals they can rely on for the moments
              that matter most.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm px-5 py-3.5 min-w-[120px]"
              >
                <p className="text-xs text-warmgrey">{s.label}</p>
                <p className="mt-0.5 text-lg font-extrabold text-charcoal">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
