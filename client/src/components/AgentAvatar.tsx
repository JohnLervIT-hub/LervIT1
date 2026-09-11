import { AGENT_PROFILES, DEFAULT_AVATAR } from '@/lib/agentProfiles';
import { cn } from '@/lib/utils';

interface AgentAvatarProps {
  agentKey: string;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  showRole?: boolean;
  className?: string;
}

const sizes = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
};

export function AgentAvatar({
  agentKey,
  size = 'md',
  showName = false,
  showRole = false,
  className,
}: AgentAvatarProps) {
  const profile = AGENT_PROFILES[agentKey];
  const name = profile?.name ?? agentKey;
  const src = profile?.avatar ?? DEFAULT_AVATAR(name);

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img
        src={src}
        alt={name}
        onError={(e) => {
          const img = e.currentTarget;
          const fallback = DEFAULT_AVATAR(name);
          if (img.src !== fallback) img.src = fallback;
        }}
        className={cn(
          sizes[size],
          'rounded-full object-cover object-top',
          'ring-2 ring-background shadow-sm flex-shrink-0',
        )}
      />
      {(showName || showRole) && (
        <div className="min-w-0">
          {showName && (
            <p className="text-sm font-semibold leading-tight truncate">{name}</p>
          )}
          {showRole && profile?.role && (
            <p className="text-xs text-muted-foreground truncate">{profile.role}</p>
          )}
        </div>
      )}
    </div>
  );
}
