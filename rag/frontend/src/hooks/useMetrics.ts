import { useState, useCallback } from 'react';
import {
  getMetricsSummary,
  getMetricsRecent,
  getMetricsTimeseries,
  getMetricsConfig,
  MetricsSummary,
  MetricsRecentItem,
  MetricsTimeseriesPoint,
  MetricsConfig,
} from '../api';

export type MetricsWindow = '1h' | '24h' | '7d' | 'all';

export function useMetrics() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [recent, setRecent] = useState<MetricsRecentItem[]>([]);
  const [series, setSeries] = useState<MetricsTimeseriesPoint[]>([]);
  const [config, setConfig] = useState<MetricsConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState<MetricsWindow>('1h');

  const refresh = useCallback(
    async (w: MetricsWindow = window) => {
      setLoading(true);
      setError(null);
      try {
        const [s, r, ts, c] = await Promise.all([
          getMetricsSummary(w),
          getMetricsRecent(50),
          getMetricsTimeseries(w === 'all' ? '24h' : w, 5),
          getMetricsConfig(),
        ]);
        setSummary(s);
        setRecent(r.items);
        setSeries(ts.series);
        setConfig(c);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载指标失败');
      } finally {
        setLoading(false);
      }
    },
    [window]
  );

  return {
    summary,
    recent,
    series,
    config,
    loading,
    error,
    window,
    setWindow,
    refresh,
  };
}