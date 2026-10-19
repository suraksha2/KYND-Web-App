import { Construction } from 'lucide-react'

export default function ComingSoon({ title, description }) {
  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold text-charcoal">{title}</h1>
      <div className="mt-6 bg-white rounded-3xl border border-lightstone shadow-soft p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-warmlinen flex items-center justify-center mx-auto mb-4">
          <Construction className="w-7 h-7 text-warmgrey" />
        </div>
        <p className="font-heading text-lg font-bold text-charcoal">Coming soon</p>
        <p className="text-warmgrey text-sm mt-1">{description || `${title} is on its way.`}</p>
      </div>
    </div>
  )
}
