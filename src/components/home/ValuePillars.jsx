import { ShieldCheck, Heart, BadgeCheck, Users } from 'lucide-react'

const pillars = [
  {
    Icon: ShieldCheck,
    t: 'Trusted',
    d: 'Every pro is background-checked, insured and rated by real homes before they reach your door.'
  },
  {
    Icon: Heart,
    t: 'Kind',
    d: 'We hire for character first. Expect care, respect and a warm hello on every visit.'
  },
  {
    Icon: BadgeCheck,
    t: 'Professional',
    d: 'Trained to proper standards, on time, and equipped to finish the job the way you asked.'
  },
  {
    Icon: Users,
    t: 'Human',
    d: 'Real people you can reach — no endless menus, no scripts, just help when you need it.'
  }
]

export default function ValuePillars() {
  return (
    <section id="why" className="py-16 bg-sage">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-white">
            Life's better when you have<br />the right help.
          </h2>
          <p className="mt-3 text-white/80 max-w-xl mx-auto">
            Four things we hold ourselves to on every single booking.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pillars.map(({ Icon, t, d }) => (
            <div key={t} className="rounded-3xl bg-white border border-lightstone p-6 shadow-soft">
              <div className="w-12 h-12 rounded-2xl bg-dustyrose/15 grid place-items-center">
                <Icon className="w-6 h-6 text-terracotta" strokeWidth={1.75} />
              </div>
              <h3 className="mt-4 font-heading text-lg font-bold text-charcoal">{t}</h3>
              <p className="mt-1.5 text-sm text-warmgrey leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
