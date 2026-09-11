import { AGENT_PROFILES, DEFAULT_AVATAR } from '@/lib/agentProfiles';
import { cn } from '@/lib/utils';

interface AgentAvatarProps {
  agentKey: string;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  showRole?: boolean;
  className?: string;
}

const sizeClasses = {
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
  const avatar = profile?.avatar ?? DEFAULT_AVATAR(name);

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img
        src={avatar}
        alt={name}
        onError={(e) => {
          const img = e.currentTarget;
          const fallback = DEFAULT_AVATAR(name);
          if (img.src !== fallback) img.src = fallback;
        }}
        className={cn(
          sizeClasses[size],
          'rounded-full object-cover',
          'ring-2 ring-background shadow-sm',
        )}
      />
      {(showName || showRole) && (
        <div>
          {showName && (
            <p className="text-sm font-semibold leading-tight">{name}</p>
          )}
          {showRole && profile?.role && (
            <p className="text-xs text-muted-foreground">{profile.role}</p>
          )}
        </div>
      )}
    </div>
  );
}
