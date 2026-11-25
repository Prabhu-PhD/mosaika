import {
  CheckCircle2,
  Command,
  Cpu,
  Globe,
  Layers,
  Rocket,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { CardIconId } from '../visualCraft.js';

export function CardIcon({
  icon,
  size = 18,
  className,
}: {
  icon: CardIconId | undefined;
  size?: number;
  className?: string;
}) {
  if (!icon || icon === 'none') return null;
  const props = { width: size, height: size, className, strokeWidth: 1.8 };
  switch (icon) {
    case 'sparkles':
      return <Sparkles {...props} />;
    case 'zap':
      return <Zap {...props} />;
    case 'layers':
      return <Layers {...props} />;
    case 'trending':
      return <TrendingUp {...props} />;
    case 'shield':
      return <Shield {...props} />;
    case 'globe':
      return <Globe {...props} />;
    case 'cpu':
      return <Cpu {...props} />;
    case 'check':
      return <CheckCircle2 {...props} />;
    case 'rocket':
      return <Rocket {...props} />;
    case 'star':
      return <Star {...props} />;
    case 'command':
      return <Command {...props} />;
    default:
      return null;
  }
}
