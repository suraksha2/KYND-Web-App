import {
  Bell, Search, Home as HomeIcon, Heart, User,
  WashingMachine, SprayCan, Brush, ShieldCheck, Sparkles,
  ShoppingBag, CheckCircle2
} from 'lucide-react'

const PhoneAppScreen = ({ variant = 'home' }) => {
  if (variant === 'list') {
    return (
      <div className="bg-white h-full flex flex-col text-[10px]">
        <div className="bg-brand-400 text-cocoa px-3 py-3 flex items-center justify-between">
          <div className="font-semibold">Kynd</div>
          <Bell className="w-3 h-3" />
        </div>
        <div className="p-3 space-y-2">
          {[
            { Icon: WashingMachine, t: 'Laundry', p: 'From S$249' },
            { Icon: SprayCan, t: 'Window Cleaning', p: 'From S$299' },
            { Icon: Brush, t: 'Sweeping & Mopping', p: 'From S$199' }
          ].map((s, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 p-2 flex gap-2 items-center">
              <div className="w-8 h-8 rounded-md bg-brand-100 flex items-center justify-center">
                <s.Icon className="w-4 h-4 text-brand-700" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{s.t}</div>
                <div className="text-neutral-500">{s.p}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (variant === 'book') {
    return (
      <div className="bg-white h-full flex flex-col text-[10px]">
        <div className="bg-brand-400 text-cocoa px-3 py-3 font-semibold">Confirm booking</div>
        <div className="p-3 space-y-2 flex-1">
          <div className="rounded-lg bg-neutral-50 p-2">
            <div className="font-semibold">Bathroom Cleaning</div>
            <div className="text-neutral-500">Today • 11:30 AM</div>
          </div>
          <div className="rounded-lg bg-neutral-50 p-2 flex justify-between">
            <span>Total</span><span className="font-semibold">S$249</span>
          </div>
        </div>
        <div className="p-3"><div className="bg-brand-400 text-cocoa text-center rounded-lg py-2 font-semibold">Book now</div></div>
      </div>
    )
  }
  if (variant === 'track') {
    return (
      <div className="bg-white h-full flex flex-col text-[10px]">
        <div className="bg-brand-400 text-cocoa px-3 py-3 font-semibold">Tracking</div>
        <div className="p-3 space-y-2 flex-1">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-brand-600" /><span>Booking confirmed</span></div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-brand-600" /><span>Pro assigned</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full border-2 border-brand-600" /><span>On the way</span></div>
          <div className="flex items-center gap-2 text-neutral-400"><div className="w-3 h-3 rounded-full border-2 border-neutral-300" /><span>Service started</span></div>
          <div className="mt-2 rounded-lg bg-brand-50 p-2">
            <div className="font-semibold text-brand-800">Priya R.</div>
            <div className="text-neutral-600">Estimated in 12 min</div>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="bg-white h-full flex flex-col text-[10px]">
      <div className="bg-brand-400 text-cocoa px-3 pt-4 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="opacity-80">Hello,</div>
            <div className="font-bold text-sm">Welcome 👋</div>
          </div>
          <Bell className="w-3 h-3" />
        </div>
        <div className="mt-2 bg-white/95 rounded-lg flex items-center gap-1 px-2 py-1.5 text-neutral-600">
          <Search className="w-3 h-3" />
          <span>Search services</span>
        </div>
      </div>
      <div className="p-3 grid grid-cols-3 gap-2 -mt-3">
        {[
          { Icon: WashingMachine, l: 'Laundry' },
          { Icon: SprayCan, l: 'Windows' },
          { Icon: Brush, l: 'Mopping' },
          { Icon: ShieldCheck, l: 'Bathroom' },
          { Icon: Sparkles, l: 'Express' },
          { Icon: ShoppingBag, l: 'More' }
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm border border-neutral-100 p-2 flex flex-col items-center gap-1">
            <s.Icon className="w-4 h-4 text-brand-700" />
            <span className="font-medium text-[9px]">{s.l}</span>
          </div>
        ))}
      </div>
      <div className="px-3">
        <div className="rounded-lg bg-brand-50 p-2 text-brand-800">
          <div className="font-semibold">20% OFF</div>
          <div className="text-[9px]">First booking</div>
        </div>
      </div>
      <div className="mt-auto border-t border-neutral-100 px-3 py-1.5 flex justify-between text-neutral-500">
        <HomeIcon className="w-3.5 h-3.5 text-brand-600" />
        <Search className="w-3.5 h-3.5" />
        <Heart className="w-3.5 h-3.5" />
        <User className="w-3.5 h-3.5" />
      </div>
    </div>
  )
}

export default function PhoneMockup({ className = '', screen = 'home', size = 'md' }) {
  const dims = size === 'lg' ? 'w-[230px] h-[470px]' : size === 'sm' ? 'w-[170px] h-[350px]' : 'w-[200px] h-[410px]'
  return (
    <div className={`relative phone ${dims} ${className}`}>
      <span className="notch" />
      <div className="phone-screen w-full h-full">
        <PhoneAppScreen variant={screen} />
      </div>
    </div>
  )
}
