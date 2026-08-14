
export default function PageHero({ title, subtitle, children }) {
  return (
    <section className="pt-32 pb-12 bg-warmlinen">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h1 className="font-heading text-3xl md:text-5xl font-extrabold tracking-tight text-charcoal">{title}</h1>
        {subtitle && <p className="mt-3 text-charcoal">{subtitle}</p>}
        {children}
      </div>
    </section>
  )
}
