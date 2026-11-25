import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import type { CategoryMeta, GuildMemberMeta, GuildRoleMeta, TextChannelMeta, VoiceChannelMeta } from '@/types/api';

interface BaseSelectProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
  disabled?: boolean;
}

export function TextChannelSelect({
  channels,
  value,
  onChange,
  allowNone = true,
  noneLabel,
  className = '',
  disabled,
}: BaseSelectProps & { channels: TextChannelMeta[] }) {
  const { t } = useTranslation();
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className={`input-field ${className}`}
    >
      {allowNone && <option value="">{noneLabel ?? t('common.selectChannel')}</option>}
      {channels.map((ch) => (
        <option key={ch.id} value={ch.id}>
          {ch.type === 'announcement' ? '📢 #' : '#'}
          {ch.name}
        </option>
      ))}
    </select>
  );
}

export function VoiceChannelSelect({
  channels,
  value,
  onChange,
  allowNone = true,
  noneLabel,
  className = '',
  disabled,
}: BaseSelectProps & { channels: VoiceChannelMeta[] }) {
  const { t } = useTranslation();
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className={`input-field ${className}`}
    >
      {allowNone && <option value="">{noneLabel ?? t('common.selectChannel')}</option>}
      {channels.map((ch) => (
        <option key={ch.id} value={ch.id}>
          🔊 {ch.name}
        </option>
      ))}
    </select>
  );
}

export function CategorySelect({
  categories,
  value,
  onChange,
  allowNone = true,
  noneLabel,
  className = '',
  disabled,
}: BaseSelectProps & { categories: CategoryMeta[] }) {
  const { t } = useTranslation();
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className={`input-field ${className}`}
    >
      {allowNone && <option value="">{noneLabel ?? t('common.none')}</option>}
      {categories.map((cat) => (
        <option key={cat.id} value={cat.id}>
          📁 {cat.name}
        </option>
      ))}
    </select>
  );
}

export function RoleSelect({
  roles,
  value,
  onChange,
  allowNone = true,
  noneLabel,
  allowEveryone = false,
  onlyEditable = false,
  className = '',
  disabled,
}: BaseSelectProps & {
  roles: GuildRoleMeta[];
  allowEveryone?: boolean;
  onlyEditable?: boolean;
}) {
  const { t } = useTranslation();
  const filtered = roles.filter((r) => {
    if (!allowEveryone && r.isEveryone) return false;
    if (onlyEditable && (!r.editable || r.managed)) return false;
    return true;
  });

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className={`input-field ${className}`}
    >
      {allowNone && <option value="">{noneLabel ?? t('common.selectRole')}</option>}
      {filtered.map((role) => (
        <option key={role.id} value={role.id}>
          {role.isEveryone ? '@everyone' : `@${role.name}`}
        </option>
      ))}
    </select>
  );
}

export function MemberSelect({
  members,
  value,
  onChange,
  allowNone = true,
  noneLabel,
  className = '',
}: BaseSelectProps & { members: GuildMemberMeta[] }) {
  const { t } = useTranslation();
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={`input-field ${className}`}
    >
      {allowNone && <option value="">{noneLabel ?? t('common.selectMember')}</option>}
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.displayName} (@{m.username})
        </option>
      ))}
    </select>
  );
}

export function RoleListEditor({
  roles,
  value,
  onChange,
  allowEveryone = false,
  onlyEditable = false,
  addLabel,
  emptyLabel,
}: {
  roles: GuildRoleMeta[];
  value: string[];
  onChange: (next: string[]) => void;
  allowEveryone?: boolean;
  onlyEditable?: boolean;
  addLabel?: string;
  emptyLabel?: string;
}) {
  const { t } = useTranslation();

  const handleUpdate = (idx: number, roleId: string | null) => {
    const next = [...value];
    next[idx] = roleId ?? '';
    onChange(next);
  };

  const handleRemove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const handleAdd = () => {
    onChange([...value, '']);
  };

  return (
    <div className="space-y-2.5">
      {value.length === 0 && emptyLabel && (
        <p className="text-xs text-slate-500">{emptyLabel}</p>
      )}
      {value.map((roleId, idx) => (
        <div key={`${idx}-${roleId}`} className="flex items-center gap-2">
          <RoleSelect
            roles={roles}
            value={roleId}
            onChange={(nextId) => handleUpdate(idx, nextId)}
            allowEveryone={allowEveryone}
            onlyEditable={onlyEditable}
          />
          <button
            type="button"
            onClick={() => handleRemove(idx)}
            className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 transition shrink-0"
            title={t('common.remove')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <Button
        variant="dashed"
        size="sm"
        onClick={handleAdd}
        icon={<Plus className="w-3.5 h-3.5" />}
      >
        {addLabel ?? t('common.addRole')}
      </Button>
    </div>
  );
}

export function ChannelListEditor({
  channels,
  value,
  onChange,
  addLabel,
}: {
  channels: TextChannelMeta[];
  value: string[];
  onChange: (next: string[]) => void;
  addLabel?: string;
}) {
  const { t } = useTranslation();

  const handleUpdate = (idx: number, channelId: string | null) => {
    const next = [...value];
    next[idx] = channelId ?? '';
    onChange(next);
  };

  const handleRemove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2.5">
      {value.map((channelId, idx) => (
        <div key={`${idx}-${channelId}`} className="flex items-center gap-2">
          <TextChannelSelect
            channels={channels}
            value={channelId}
            onChange={(nextId) => handleUpdate(idx, nextId)}
          />
          <button
            type="button"
            onClick={() => handleRemove(idx)}
            className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 transition shrink-0"
            title={t('common.remove')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <Button
        variant="dashed"
        size="sm"
        onClick={() => onChange([...value, ''])}
        icon={<Plus className="w-3.5 h-3.5" />}
      >
        {addLabel ?? t('common.addChannel')}
      </Button>
    </div>
  );
}
