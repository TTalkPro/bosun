import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { Tooltip, Typography, type TypographyProps } from '@mui/material';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const RelativeTime = ({ value, ...rest }: { value: string } & TypographyProps) => {
  const d = dayjs(value);
  return (
    <Tooltip title={d.format('YYYY-MM-DD HH:mm:ss')}>
      <Typography component="span" variant="caption" color="text.secondary" {...rest}>
        {d.fromNow()}
      </Typography>
    </Tooltip>
  );
};

export default RelativeTime;
