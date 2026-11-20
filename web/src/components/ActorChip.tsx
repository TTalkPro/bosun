import { Bot, User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useActorKinds } from '@/api/identity';

type Kind = 'human' | 'agent';
export const ActorAvatar = ({ name, kind, size = 24 }: { name: string; kind?: Kind | null; size?: number }) => {
  const kinds = useActorKinds();
  const k = kind ?? kinds[name] ?? (name === 'user' ? 'human' : 'agent');
  return (
    <Tooltip><TooltipTrigger asChild>
      <Avatar style={{ width: size, height: size }}><AvatarFallback className={k === 'human' ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-primary-foreground'}>{k === 'human' ? <User style={{ width: size * .65, height: size * .65 }} /> : <Bot style={{ width: size * .65, height: size * .65 }} />}</AvatarFallback></Avatar>
    </TooltipTrigger><TooltipContent>{k === 'human' ? `${name}（人）` : `${name}（Agent）`}</TooltipContent></Tooltip>
  );
};
const ActorChip = ({ name, kind, size = 20 }: { name: string; kind?: Kind | null; size?: number }) => (
  <span className="inline-flex min-w-0 items-center gap-1.5"><ActorAvatar name={name} kind={kind} size={size} /><span className="truncate text-sm font-medium">{name}</span></span>
);
export default ActorChip;
