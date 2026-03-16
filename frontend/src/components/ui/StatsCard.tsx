import React from 'react';
import {
  HiOutlineUsers,
  HiOutlineFunnel,
  HiOutlineShoppingCart,
  HiOutlineCurrencyDollar,
  HiOutlineClock,
  HiOutlineArrowTrendingUp,
  HiOutlineArrowTrendingDown,
} from 'react-icons/hi2';

const iconMap: Record<string, React.ElementType> = {
  users: HiOutlineUsers,
  target: HiOutlineFunnel,
  shoppingCart: HiOutlineShoppingCart,
  dollarSign: HiOutlineCurrencyDollar,
  clock: HiOutlineClock,
  trendingUp: HiOutlineArrowTrendingUp,
};

interface StatsCardProps {
  icon: string | React.ElementType;
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  iconColor?: string;
  iconBg?: string;
}

export default function StatsCard({
  icon,
  title,
  value,
  change,
  changeLabel = '较上月',
  iconColor = 'text-blue-600',
  iconBg = 'bg-blue-100',
}: StatsCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const Icon = typeof icon === 'string' ? iconMap[icon] || HiOutlineUsers : icon;

  return (
    <div className="rounded-lg bg-white p-5 shadow flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
        {change !== undefined && (
          <div className="mt-2 flex items-center gap-1">
            {isPositive ? (
              <HiOutlineArrowTrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <HiOutlineArrowTrendingDown className="h-4 w-4 text-red-500" />
            )}
            <span
              className={`text-xs font-medium ${
                isPositive ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {isPositive ? '+' : ''}
              {change}%
            </span>
            <span className="text-xs text-gray-400">{changeLabel}</span>
          </div>
        )}
      </div>
      <div className={`rounded-xl p-3 ${iconBg}`}>
        <Icon className={`h-6 w-6 ${iconColor}`} />
      </div>
    </div>
  );
}
