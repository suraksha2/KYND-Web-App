export function taglineForService(name = '') {
  const n = name.toLowerCase()
  if (n.includes('bathroom') || n.includes('bath')) return 'A bathroom that sparkles, without you lifting a brush.'
  if (n.includes('fridge') || n.includes('refriger')) return 'A fresh, spotless fridge — inside and out.'
  if (n.includes('kitchen') || n.includes('cook') || n.includes('prep')) return 'A kitchen you actually want to cook in.'
  if (n.includes('dust')) return 'Less dust, easier breathing, calmer rooms.'
  if (n.includes('plumb')) return 'Leaks sorted properly, the first time.'
  if (n.includes('laundry') || n.includes('wash')) return 'Fresh laundry, folded and back where it belongs.'
  if (n.includes('iron') || n.includes('cloth')) return 'Crisp clothes, ready when you are.'
  if (n.includes('child') || n.includes('baby')) return 'Warm, watchful care for your little ones.'
  if (n.includes('elder') || n.includes('care')) return 'Kind, patient company for the people you love.'
  if (n.includes('sofa') || n.includes('uphol')) return 'Sofas that look and smell new again.'
  if (n.includes('paint')) return 'Fresh walls, neat edges, no mess left behind.'
  if (n.includes('electric')) return 'Safe, certified fixes for every socket and switch.'
  if (n.includes('trash') || n.includes('garbage')) return 'Cleared away, so your space feels lighter.'
  if (n.includes('clean')) return 'A cleaner home, more time for what matters.'
  return 'Trusted help for life\u2019s moments — booked in minutes.'
}
