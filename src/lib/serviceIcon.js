import {
  Bath,
  Refrigerator,
  UtensilsCrossed,
  Wind,
  Wrench,
  Sparkles,
  WashingMachine,
  Shirt,
  Sofa,
  PaintRoller,
  Zap,
  Trash2,
  Home,
} from 'lucide-react'

export function iconForService(name = '') {
  const n = name.toLowerCase()
  if (n.includes('bathroom') || n.includes('bath')) return Bath
  if (n.includes('fridge') || n.includes('refriger')) return Refrigerator
  if (n.includes('kitchen') || n.includes('cook') || n.includes('prep')) return UtensilsCrossed
  if (n.includes('dust')) return Wind
  if (n.includes('plumb')) return Wrench
  if (n.includes('laundry') || n.includes('wash')) return WashingMachine
  if (n.includes('iron') || n.includes('cloth')) return Shirt
  if (n.includes('sofa') || n.includes('uphol')) return Sofa
  if (n.includes('paint')) return PaintRoller
  if (n.includes('electric')) return Zap
  if (n.includes('trash') || n.includes('garbage')) return Trash2
  if (n.includes('clean')) return Sparkles
  return Home
}
