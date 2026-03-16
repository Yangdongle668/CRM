import React from 'react';
import { HiOutlineArrowTrendingUp, HiOutlineArrowTrendingDown } from 'react-icons/hi2';

interface StatsCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  iconColor?: string;
  iconBg?: string;
}

export default function StatsCard({
  icon: Icon,
  label,
  value,
  change,
  changeLabel = '较上月',
  iconColor = 'text-blue-600',
  iconBg = 'bg-blue-100',
}: StatsCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <div className="card flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{label}</p>
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
