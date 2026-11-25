import { Bot, Edit3, Eraser, Eye, Megaphone, Send, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { announcementsApi } from '@/api/announcements';
import { Button } from '@/components/ui/Button';
import { RoleSelect, TextChannelSelect } from '@/components/ui/DiscordSelects';
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { API_LIMITS } from '@/config/constants';
import { DEFAULT_EMBED_COLOR } from '@/config/theme';
import { useAuth } from '@/context/AuthContext';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { getAppLanguage } from '@/i18n';
import type { AnnouncementHistoryEntry } from '@/types/api';
import { formatDateTime } from '@/utils/format';

interface FormState {
  channelId: string | null;
  roleId: string | null;
  content: string;
  title: string;
  description: string;
  color: string;
  footerText: string;
  thumbnailUrl: string;
  imageUrl: string;
  timestamp: boolean;
  crosspost: boolean;
}

const EMPTY_FORM: FormState = {
  channelId: null,
  roleId: null,
  content: '',
  title: '',
  description: '',
  color: DEFAULT_EMBED_COLOR,
  footerText: '',
  thumbnailUrl: '',
  imageUrl: '',
  timestamp: true,
  crosspost: false,
};

function isValidHttpUrl(url: string): boolean {
  return /^https?:\/\/.+/i.test(url.trim());
}

export function AnnouncementsPage() {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const { showToast } = useToast();
  const { auth } = useAuth();
  const {
    overview,
    meta,
    announcementsHistory,
    setAnnouncementsHistory,
    initialLoading,
  } = useDashboard();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<AnnouncementHistoryEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failedImageUrls, setFailedImageUrls] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!editing) return;
    const stillExists = announcementsHistory.some(
      (h) => h.channelId === editing.channelId && h.messageId === editing.messageId,
    );
    if (!stillExists) {
      setEditing(null);
      setForm(EMPTY_FORM);
      showToast(t('announcements.deletedOnDiscord'), 'info');
    }
  }, [announcementsHistory, editing, showToast, t]);

  const selectedChannel = (meta?.textChannels ?? []).find((c) => c.id === form.channelId);
  const selectedRole = (meta?.roles ?? []).find((r) => r.id === form.roleId);
  const botName = overview?.bot.username || auth?.bot.username || 'BOT Gaben';
  const botAvatar = overview?.bot.avatarUrl || auth?.bot.avatarUrl;

  const trimmedThumb = form.thumbnailUrl.trim();
  const trimmedImage = form.imageUrl.trim();
  const showThumb = isValidHttpUrl(trimmedThumb) && !failedImageUrls[trimmedThumb];
  const showImage = isValidHttpUrl(trimmedImage) && !failedImageUrls[trimmedImage];

  const markImageFailed = (url: string) => {
    setFailedImageUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  };

  const startEdit = (entry: AnnouncementHistoryEntry) => {
    setEditing(entry);
    setForm({
      channelId: entry.channelId,
      roleId: entry.roleId ?? null,
      content: entry.content ?? '',
      title: entry.title ?? '',
      description: entry.description ?? '',
      color: entry.color || DEFAULT_EMBED_COLOR,
      footerText: entry.footerText ?? '',
      thumbnailUrl: entry.thumbnailUrl ?? '',
      imageUrl: entry.imageUrl ?? '',
      timestamp: Boolean(entry.timestamp),
      crosspost: false,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        const res = await announcementsApi.update(editing.channelId, editing.messageId, {
          content: form.content,
          title: form.title,
          description: form.description,
          color: form.color,
          footerText: form.footerText,
          thumbnailUrl: form.thumbnailUrl,
          imageUrl: form.imageUrl,
          roleId: form.roleId,
          timestamp: form.timestamp,
        });
        setAnnouncementsHistory(res.history || []);
        setEditing(null);
        setForm(EMPTY_FORM);
        showToast(t('announcements.updatedToast'));
      } else {
        if (!form.channelId) {
          showToast(t('common.selectChannel'), 'error');
          return;
        }
        const res = await announcementsApi.send({
          channelId: form.channelId,
          content: form.content,
          title: form.title,
          description: form.description,
          color: form.color,
          footerText: form.footerText,
          thumbnailUrl: form.thumbnailUrl,
          imageUrl: form.imageUrl,
          roleId: form.roleId,
          timestamp: form.timestamp,
          crosspost: form.crosspost,
        });
        setAnnouncementsHistory(res.history || []);
        setForm((prev) => ({ ...EMPTY_FORM, channelId: prev.channelId }));
        showToast(t('announcements.sentToast'));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (initialLoading) return <SkeletonCard rows={6} />;

  const hasEmbedPreview = Boolean(
    form.title.trim() ||
      form.description.trim() ||
      form.footerText.trim() ||
      showThumb ||
      showImage,
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <form onSubmit={handleSubmit} className="card p-6 xl:col-span-7 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-brand" />
              <span>
                {editing ? t('announcements.editTitle') : t('announcements.composeTitle')}
              </span>
            </h3>
            {editing && (
              <Button
                size="sm"
                variant="secondary"
                onClick={cancelEdit}
                icon={<X className="w-3.5 h-3.5" />}
              >
                {t('announcements.cancelEdit')}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                {t('announcements.targetChannel')}
              </label>
              <TextChannelSelect
                channels={meta?.textChannels ?? []}
                value={form.channelId}
                onChange={(val) => setForm((p) => ({ ...p, channelId: val }))}
                disabled={Boolean(editing)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                {t('announcements.pingRole')}
              </label>
              <RoleSelect
                roles={meta?.roles ?? []}
                value={form.roleId}
                onChange={(val) => setForm((p) => ({ ...p, roleId: val }))}
                allowEveryone
                noneLabel={t('common.none')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">
              {t('announcements.messageText')}
            </label>
            <textarea
              rows={2}
              maxLength={API_LIMITS.ANNOUNCEMENT_CONTENT_MAX}
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              placeholder={t('announcements.messagePlaceholder')}
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-3 space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                {t('announcements.embedTitle')}
              </label>
              <input
                type="text"
                maxLength={API_LIMITS.ANNOUNCEMENT_TITLE_MAX}
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t('common.color')}</label>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                className="input-field h-[42px] p-1 cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">
              {t('announcements.embedDescription')}
            </label>
            <textarea
              rows={5}
              maxLength={API_LIMITS.ANNOUNCEMENT_DESCRIPTION_MAX}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                {t('announcements.thumbnailUrl')}
              </label>
              <input
                type="url"
                value={form.thumbnailUrl}
                onChange={(e) => setForm((p) => ({ ...p, thumbnailUrl: e.target.value }))}
                placeholder="https://..."
                className="input-field"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                {t('announcements.imageUrl')}
              </label>
              <input
                type="url"
                value={form.imageUrl}
                onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                placeholder="https://..."
                className="input-field"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">
              {t('announcements.footerText')}
            </label>
            <input
              type="text"
              maxLength={API_LIMITS.ANNOUNCEMENT_FOOTER_MAX}
              value={form.footerText}
              onChange={(e) => setForm((p) => ({ ...p, footerText: e.target.value }))}
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
              <span className="text-sm font-medium text-white">
                {t('announcements.includeTimestamp')}
              </span>
              <ToggleSwitch
                checked={form.timestamp}
                onChange={(v) => setForm((p) => ({ ...p, timestamp: v }))}
              />
            </div>

            {!editing && selectedChannel?.type === 'announcement' && (
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
                <span className="text-sm font-medium text-white">
                  {t('announcements.crosspost')}
                </span>
                <ToggleSwitch
                  checked={form.crosspost}
                  onChange={(v) => setForm((p) => ({ ...p, crosspost: v }))}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {!editing && (
              <Button
                variant="secondary"
                onClick={() => setForm((prev) => ({ ...EMPTY_FORM, channelId: prev.channelId }))}
                icon={<Eraser className="w-4 h-4" />}
              >
                {t('common.clear')}
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              loadingText={t('common.sending')}
              icon={<Send className="w-4 h-4" />}
            >
              {editing ? t('announcements.updateBtn') : t('announcements.sendBtn')}
            </Button>
          </div>
        </form>

        {/* Authentic Discord preview */}
        <div className="card p-6 xl:col-span-5 space-y-4 xl:sticky xl:top-20">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Eye className="w-4 h-4 text-sky-400" />
            <span>{t('announcements.preview')}</span>
          </h3>

          <div className="rounded-2xl bg-[#313338] border border-slate-800 p-4">
            <div className="flex items-start gap-3">
              {botAvatar ? (
                <img
                  src={botAvatar}
                  alt={botName}
                  className="w-10 h-10 rounded-full object-cover bg-bg-base shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-brand/20 text-brand flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{botName}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-brand text-white">
                    APP
                  </span>
                  <span className="text-xs text-slate-400">{t('announcements.today')}</span>
                </div>

                {(selectedRole || form.content.trim()) && (
                  <div className="text-sm text-slate-200 mt-1 whitespace-pre-wrap break-words">
                    {selectedRole && (
                      <span className="px-1.5 py-0.5 rounded bg-brand/30 text-indigo-200 font-medium mr-1.5">
                        {selectedRole.isEveryone ? '@everyone' : `@${selectedRole.name}`}
                      </span>
                    )}
                    {form.content}
                  </div>
                )}

                {hasEmbedPreview ? (
                  <div
                    className="mt-2 rounded-lg bg-[#2b2d31] border-l-4 p-4 shadow space-y-2.5"
                    style={{ borderLeftColor: form.color }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {form.title.trim() && (
                          <div className="text-sm font-bold text-white break-words">
                            {form.title}
                          </div>
                        )}
                        {form.description.trim() && (
                          <div className="text-xs text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                            {form.description}
                          </div>
                        )}
                      </div>
                      {showThumb && (
                        <img
                          src={trimmedThumb}
                          alt=""
                          onError={() => markImageFailed(trimmedThumb)}
                          className="w-14 h-14 rounded-lg object-cover shrink-0 bg-bg-base"
                        />
                      )}
                    </div>

                    {showImage && (
                      <img
                        src={trimmedImage}
                        alt=""
                        onError={() => markImageFailed(trimmedImage)}
                        className="rounded-lg max-h-56 w-full object-cover bg-bg-base"
                      />
                    )}

                    {(form.footerText.trim() || form.timestamp) && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-0.5">
                        {form.footerText.trim() && <span>{form.footerText}</span>}
                        {form.footerText.trim() && form.timestamp && <span>·</span>}
                        {form.timestamp && <span>{formatDateTime(Date.now(), lang)}</span>}
                      </div>
                    )}
                  </div>
                ) : !selectedRole && !form.content.trim() ? (
                  <p className="text-xs text-slate-400 mt-2 italic">
                    {t('announcements.emptyPreview')}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-white">{t('announcements.historyTitle')}</h3>
        </div>

        {announcementsHistory.length === 0 ? (
          <EmptyState message={t('announcements.noHistory')} />
        ) : (
          <div className="space-y-2.5">
            {announcementsHistory.map((item) => (
              <div
                key={`${item.channelId}:${item.messageId}`}
                className="p-4 rounded-xl bg-bg-elevated/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color || DEFAULT_EMBED_COLOR }}
                    />
                    <span className="text-sm font-semibold text-white truncate">
                      {item.title || item.content || `#${item.channelName}`}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    #{item.channelName} · {formatDateTime(item.sentAt, lang)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => startEdit(item)}
                  icon={<Edit3 className="w-3.5 h-3.5" />}
                >
                  {t('common.edit')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
