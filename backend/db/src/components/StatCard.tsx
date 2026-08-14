import clsx from "clsx";
import Link from "next/link";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  positive: boolean;
  icon: LucideIcon;
  color: string;
  href?: string;
}

export default function StatCard({
  title,
  value,
  change,
  positive,
  icon: Icon,
  color,
  href,
}: StatCardProps) {
  const inner = (
    <div className="group relative bg-white rounded-2xl p-5 border border-lightstone shadow-soft hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
        style={{ background: "linear-gradient(135deg, rgba(169,95,69,0.04) 0%, rgba(122,141,114,0.04) 100%)" }} />
      <div className="flex items-start justify-between mb-4">
        <div className={clsx("w-11 h-11 rounded-xl flex items-center justify-center shadow-sm", color)}>
          <Icon size={20} className="text-white" />
        </div>
        {change && (
          <span className={clsx(
            "inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg",
            positive ? "bg-sage/10 text-sage" : "bg-dustyrose/10 text-rosewood"
          )}>
            {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {change}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-charcoal tracking-tight">{value}</p>
      <p className="text-sm text-warmgrey mt-1 font-medium">{title}</p>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
