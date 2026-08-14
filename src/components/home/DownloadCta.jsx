import PhoneMockup from '../PhoneMockup'
import StoreButtons from '../StoreButtons'

export default function DownloadCta() {
  return (
    <section id="download" className="py-16">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <div className="rounded-[36px] bg-charcoal text-white px-6 md:px-10 py-14 md:py-16 text-center relative overflow-hidden">
          <div className="flex justify-center -mb-2">
            <div className="flex items-end -space-x-8">
              <PhoneMockup screen="home" size="sm" className="-rotate-[8deg]" />
              <PhoneMockup screen="track" size="sm" className="rotate-[8deg] translate-y-2" />
            </div>
          </div>
          <h2 className="mt-10 font-heading text-3xl md:text-4xl font-extrabold tracking-tight">
            Trusted help for<br />life's moments
          </h2>
          <p className="mt-3 text-white/85">Download the Kynd app and book your first service today.</p>
          <StoreButtons className="mt-6" />
        </div>
      </div>
    </section>
  )
}
