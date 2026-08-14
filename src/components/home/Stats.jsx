export default function Stats() {
  return (
    <section id="why" className="py-16">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">
          No more planning<br />around your house help.
        </h2>
        <p className="mt-3 text-warmgrey max-w-xl mx-auto">
          Our team of verified Kynd Professionals are always on time.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {[
            { n: '15,000+', l: 'Homes' },
            { n: '40,000+', l: 'Hours saved' },
            { n: '1,500+',  l: 'Pros' }
          ].map((s, i) => (
            <div key={i} className="rounded-full bg-accent-50 ring-1 ring-accent-200 px-5 py-2.5 flex items-baseline gap-2">
              <span className="text-base md:text-lg font-extrabold text-accent-700">{s.n}</span>
              <span className="text-xs text-warmgrey">{s.l}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
