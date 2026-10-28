import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

dayjs.extend(relativeTime); dayjs.locale('zh-cn');
const RelativeTime = ({ value, ...rest }: { value: string } & React.ComponentProps<'span'>) => {
  const d = dayjs(value);
  return (<Tooltip><TooltipTrigger asChild><span className="text-xs text-muted-foreground" {...rest}>{d.fromNow()}</span></TooltipTrigger><TooltipContent>{d.format('YYYY-MM-DD HH:mm:ss')}</TooltipContent></Tooltip>);
};
export default RelativeTime;
