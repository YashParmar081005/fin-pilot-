import { HugeiconsIcon } from '@hugeicons/react';
import { ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';

interface EyeIconProps {
  show: boolean;
  blinking: boolean;
}

export function EyeIcon({ show, blinking }: EyeIconProps) {
  const className = blinking ? 'fp-eye-animating' : '';
  const style = { display: 'block', transition: 'transform 0.2s ease' };

  return show ? (
    <HugeiconsIcon icon={ViewIcon} className={className} size={18} style={style} />
  ) : (
    <HugeiconsIcon icon={ViewOffIcon} className={className} size={18} style={style} />
  );
}
