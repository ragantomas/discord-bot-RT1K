import { RefreshCw, ScrollText, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logsApi } from '@/api/logs';
import { Button } from '@/components/ui/Button';
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback';
import { LOG_FILTER_CATEGORIES } from '@/config/constants';
import { LOG_CATEGORY_LABEL_KEYS, LOG_LEVEL_STYLES } from '@/config/theme';
import { useConfirm } from '@/context/ConfirmContext';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { getAppLanguage } from '@/i18n';
import { formatDateTime } from '@/utils/format';

export function ActivityLogPage() {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { logs, setLogs, refreshLogs, initialLoading } = useDashboard();

  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((entry) => {
      if (category !== 'all') {
        const entryCat = entry.category === 'dashboard' ? 'audit' : entry.category;
        if (entryCat !== category) return false;
      }
      if (!q) return true;
      return (
        entry.message.toLowerCase().includes(q) ||
        (entry.actor ?? '').toLowerCase().includes(q) ||
        entry.category.toLowerCase().includes(q)
      );
    });
  }, [logs, category, search]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshLogs();
    } finally {
      setRefreshing(false);
    }
  };

  const handleClear = async () => {
    const ok = await confirm({
      title: t('logs.clearTitle'),
      message: t('logs.clearMessage'),
      confirmLabel: t('common.clear'),
    });
    if (!ok) return;

    try {
      const res = await logsApi.clear();
      setLogs(res.logs || []);
      showToast(t('logs.clearedToast'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  if (initialLoading) return <SkeletonCard rows={6} />;

  return (
    <div className="card overflow-hidden">
      <div className="p-5 border-b border-slate-800/90 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-brand" />
            <span>{t('logs.title')}</span>
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative sm:w-56 w-full">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('common.search')}
                className="input-field pl-9"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              loading={refreshing}
              onClick={() => void handleRefresh()}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              {t('common.refresh')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => void handleClear()}
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              {t('common.clear')}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {LOG_FILTER_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                category === cat
                  ? 'bg-brand text-white border-brand'
                  : 'bg-bg-elevated hover:bg-bg-hover text-slate-300 border-slate-700'
              }`}
            >
              {t(LOG_CATEGORY_LABEL_KEYS[cat] ?? 'logs.categories.system')}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message={t('logs.noLogs')} />
      ) : (
        <div className="divide-y divide-slate-800/70">
          {filtered.map((entry, idx) => {
            const lvl = LOG_LEVEL_STYLES[entry.level] ?? LOG_LEVEL_STYLES.info;
            const catKey = LOG_CATEGORY_LABEL_KEYS[entry.category] ?? 'logs.categories.system';
            return (
              <div
                key={`${entry.timestamp}-${idx}`}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm hover:bg-bg-elevated/35 transition"
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 sm:mt-0 ${lvl.dot}`} />
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium border shrink-0 ${lvl.badge}`}
                  >
                    {t(catKey)}
                  </span>
                  <span className="text-slate-200 break-words">{entry.message}</span>
                </div>
                <div className="text-xs text-slate-500 shrink-0 flex items-center gap-2">
                  {entry.actor && <span className="text-slate-400">{entry.actor}</span>}
                  <span>{formatDateTime(entry.timestamp, lang)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
