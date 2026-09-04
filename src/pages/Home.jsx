import { useRef, useState, useEffect } from 'react'
import Hero from '../components/home/Hero'
import Services from '../components/home/Services'
import Seo from '../components/Seo'
import { organizationSchema } from '../lib/schema'
import { DEFAULT_DESCRIPTION } from '../lib/site'
// import Stats from '../components/home/Stats'
// import Steps from '../components/home/Steps'
// import ValuePillars from '../components/home/ValuePillars'
// import Reviews from '../components/home/Reviews'
// import Faq from '../components/home/Faq'
// import DownloadCta from '../components/home/DownloadCta'

export { Services }

const peopleImage = (name) =>
  import.meta.env.BASE_URL + 'images/people/' + encodeURIComponent(name)

function ScrollReveal({ children }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true)
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      {children}
    </div>
  )
}

const slides = [
  {
    title: 'Raising the bar, every visit.',
    body: 'Replace this with the first story or value you want to highlight on the home page.',
    image: 'Screenshot 2026-08-12 at 21.19.14.png',
    alt: 'Kynd professionals on the way to a booking',
    stat: '10,000+',
    statLabel: 'homes helped and counting',
    bullets: [
      'Background-checked and insured pros',
      'Ongoing training and quality standards',
      'Transparent pricing, no hidden fees',
      'Rated and reviewed by real homes'
    ]
  },
  {
    title: 'Real people, real care.',
    body: 'Replace this with your second key message — the people behind every booking.',
    image: 'Screenshot 2026-08-12 at 21.18.48.png',
    alt: 'Kynd professional vacuuming a living room',
    stat: '4.7/5',
    statLabel: 'average customer rating',
    bullets: [
      'Hired for character and trained for skill',
      'Warm, respectful service on every visit',
      'Real humans you can reach when you need',
      'Consistent quality you can count on'
    ]
  },
  {
    title: 'Trained for every task.',
    body: 'Replace this with your third message — training, tools and expertise.',
    image: 'Screenshot 2026-08-12 at 21.18.31.png',
    alt: 'Kynd professional servicing an aircon',
    stat: '200+',
    statLabel: 'hours of hands-on training',
    bullets: [
      'Skill-matched to the job you book',
      'Equipped with the right tools and supplies',
      'Trained on safety, care and cleanliness',
      'Quality-checked before they reach your door'
    ]
  },
  {
    title: 'Attention to every detail.',
    body: 'Replace this with your fourth message — the finishing touches that matter.',
    image: 'Screenshot 2026-08-12 at 21.18.02.png',
    alt: 'Kynd professional cleaning a kitchen counter',
    stat: '1,500+',
    statLabel: 'verified Kynd professionals',
    bullets: [
      'Checklists built for your home',
      'Follow-ups on every completed job',
      'Feedback drives the next visit',
      'Pride in the work, every time'
    ]
  }
]

function StandardsCarousel() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setActive((prev) => (prev + 1) % slides.length)
    }, 5000)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="py-16 md:py-24 bg-warmlinen overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <div className="relative overflow-hidden rounded-[2rem] md:rounded-[2.5rem]">
          <div
            className="flex transition-transform duration-700 ease-in-out"
            style={{ transform: `translateX(-${active * 100}%)` }}
          >
            {slides.map((slide, i) => (
              <div
                key={i}
                className="w-full shrink-0 p-6 md:p-12 bg-white"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
                  <div className="text-center md:text-left order-2 md:order-1">
                    <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal leading-tight">
                      {slide.title}
                    </h2>
                    <p className="mt-4 text-warmgrey leading-relaxed">
                      {slide.body}
                    </p>

                    <div className="mt-8 space-y-4 text-left max-w-md mx-auto md:mx-0">
                      {slide.bullets.map((item, b) => (
                        <div key={b} className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-sage/15 text-sage grid place-items-center shrink-0 text-xs font-bold">
                            {b + 1}
                          </span>
                          <span className="text-sm text-charcoal font-medium">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative order-1 md:order-2">
                    <div className="relative rounded-[2rem] overflow-hidden shadow-soft aspect-[4/3] md:aspect-square">
                      <img
                        src={peopleImage(slide.image)}
                        alt={slide.alt}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-white/95 backdrop-blur-sm p-4 shadow-soft">
                        <p className="font-heading text-2xl font-extrabold text-charcoal">
                          {slide.stat}
                        </p>
                        <p className="text-sm text-warmgrey">
                          {slide.statLabel}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                active === i
                  ? 'w-8 bg-terracotta'
                  : 'w-2.5 bg-lightstone hover:bg-terracotta/50'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  return (
    <>
      <Seo
        title={null}
        description={DEFAULT_DESCRIPTION}
        path="/"
        jsonLd={organizationSchema()}
      />
      <Hero />
      <ScrollReveal><Services /></ScrollReveal>
      {/* <ScrollReveal><Steps /></ScrollReveal> */}
      {/* <ScrollReveal><Stats /></ScrollReveal> */}
      {/* <ScrollReveal><ValuePillars /></ScrollReveal> */}
      {/* <ScrollReveal><StandardsCarousel /></ScrollReveal> */}
      {/* <ScrollReveal><Reviews /></ScrollReveal> */}
      {/* <ScrollReveal><Faq /></ScrollReveal> */}
      {/* <ScrollReveal><DownloadCta /></ScrollReveal> */}
    </>
  )
}
