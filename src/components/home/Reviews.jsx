import { Star } from 'lucide-react'

export default function Reviews() {
  const data = [
    { n: 'Kirti', loc: 'Sector 56', s: 5, r: "I'd say it was great value for money. The urgency was handled well, without compromising quality. Really satisfied with the experience." },
    { n: 'Neha', loc: 'Sector 57', s: 5, r: 'The service was simple and effective. It met my expectations without any hassle. Good overall experience.' },
    { n: 'Pradnyesh', loc: 'Suncity', s: 5, r: 'Great work, my home was left spotless and fresh. The cleaning was thorough, and I appreciated the attention to detail. 👍🏼' },
    { n: 'Ridhi Saluja', loc: 'Sector 56', s: 5, r: 'The services have definitely improved from the first time. Preferences are kept as top priority. Thank you for making our lives easier with Kynd!' },
    { n: 'Ritika', loc: 'Sector 57', s: 5, r: 'Seamless experience from booking to completion. The staff was courteous, punctual, and did a fantastic job.' },
    { n: 'Sameer', loc: 'Sector 57', s: 5, r: 'Really liked your service, it was smooth, efficient, and just what I needed. Would definitely recommend to others. 🌟' },
    { n: 'Karishma', loc: 'Suncity', s: 5, r: 'Absolutely excellent service! The team was prompt and professional throughout. Would love to use it again.' },
    { n: 'Rabia', loc: 'Suncity', s: 5, r: 'Really impressive compared to other platforms. The service was reliable and professional. Communication was clear and fast — very pleased!' }
  ]

  const count = data.length
  const average = count > 0 ? data.reduce((sum, u) => sum + u.s, 0) / count : 0
  const rounded = Math.round(average * 10) / 10

  return (
    <section id="reviews" className="py-16">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">Loved by Kynd<br />homes.</h2>
          <p className="mt-3 text-warmgrey">Real reviews from real homes.</p>

          <div className="mt-6 inline-flex items-center gap-3 rounded-full bg-white border border-lightstone shadow-soft px-5 py-2.5">
            <span className="font-heading text-2xl font-extrabold text-charcoal">{rounded.toFixed(1)}</span>
            <span className="flex gap-0.5 text-amber-400">
              {Array.from({ length: 5 }).map((_, k) => (
                <Star key={k} className={`w-4 h-4 ${k < Math.round(average) ? 'fill-amber-400' : 'fill-lightstone text-lightstone'}`} />
              ))}
            </span>
            <span className="text-sm text-warmgrey">from {count} reviews</span>
          </div>
        </div>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.map((u, i) => (
            <div key={i} className="rounded-2xl bg-warmlinen border border-lightstone p-5">
              <div className="flex gap-0.5 text-amber-400 mb-2">
                {Array.from({ length: u.s }).map((_, k) => <Star key={k} className="w-3.5 h-3.5 fill-amber-400" />)}
              </div>
              <p className="text-[13px] text-charcoal leading-relaxed">"{u.r}"</p>
              <div className="mt-4">
                <div className="font-semibold text-sm text-charcoal">{u.n}</div>
                <div className="text-xs text-warmgrey">{u.loc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
