'use client';

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { LEAD_STAGE_MAP } from '@/lib/constants';
import type { WidgetProps } from '../types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export function FunnelWidget({ data }: WidgetProps) {
  const { funnelData } = data;

  const chartData = {
    labels: funnelData.map((d) => LEAD_STAGE_MAP[d.stage]?.label || d.label || d.stage),
    datasets: [
      {
        label: '线索数量',
        data: funnelData.map((d) => d.count),
        backgroundColor: [
          'rgba(59, 130, 246, 0.7)',
          'rgba(99, 102, 241, 0.7)',
          'rgba(139, 92, 246, 0.7)',
          'rgba(234, 179, 8, 0.7)',
          'rgba(249, 115, 22, 0.7)',
          'rgba(34, 197, 94, 0.7)',
          'rgba(239, 68, 68, 0.7)',
        ],
        borderWidth: 0,
        borderRadius: 4,
      },
    ],
  };

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { title: { display: true, text: '数量' } } },
  };

  return (
    <div className="h-full w-full" style={{ minHeight: 180 }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}
