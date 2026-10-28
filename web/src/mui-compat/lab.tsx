import { cn } from '@/lib/utils';
export const Timeline = ({ children, sx }: any) => <ol className="space-y-4" style={typeof sx === 'object' ? sx : undefined}>{children}</ol>;
export const TimelineItem = ({ children }: any) => <li className="grid grid-cols-[auto_1fr] gap-3">{children}</li>;
export const TimelineOppositeContent = ({ children }: any) => <div className="hidden whitespace-nowrap md:block">{children}</div>;
export const TimelineSeparator = ({ children }: any) => <div className="relative flex flex-col items-center">{children}</div>;
export const TimelineDot = ({ color='grey', variant='filled' }: any) => <span className={cn('mt-1 flex size-3 items-center justify-center rounded-full', color==='success'?'bg-emerald-500':color==='error'?'bg-destructive':color==='warning'?'bg-amber-500':color==='info'?'bg-sky-500':color==='primary'?'bg-primary':'border bg-background', variant==='outlined' && 'border-2 bg-background')} />;
export const TimelineConnector = () => <span className="my-1 w-px flex-1 bg-border" />;
export const TimelineContent = ({ children }: any) => <div className="pb-2">{children}</div>;
export default Timeline;
