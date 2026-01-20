import React from 'react';
import { cn } from '../../lib/utils';

const Button = React.forwardRef(({ className, variant = 'default', size = 'default', ...props }, ref) => {
  const variants = {
    // 主按钮：霓虹渐变（适配深色/浅色）
    default: 'text-slate-950 bg-gradient-to-r from-sky-400 to-emerald-400 hover:opacity-90',
    // 强 CTA：更“热”的渐变（用于生成/分享等关键动作）
    accent: 'text-slate-950 bg-gradient-to-r from-fuchsia-400 to-amber-300 hover:opacity-90',
    // 危险按钮
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    // 描边按钮：玻璃描边风格
    outline: 'border border-slate-700/70 bg-slate-950/20 text-slate-100 hover:bg-slate-950/35 hover:border-slate-500',
    // 次按钮：低对比填充
    secondary: 'bg-slate-900/60 text-slate-100 hover:bg-slate-900/80 border border-slate-800/60',
    // 幽灵按钮：无底，仅 hover 出现玻璃底
    ghost: 'text-slate-200 hover:bg-slate-950/30 hover:text-slate-50',
    link: 'text-primary underline-offset-4 hover:underline',
  };

  const sizes = {
    default: 'h-10 px-4 py-2 rounded-xl',
    sm: 'h-9 px-3 rounded-lg',
    lg: 'h-11 px-8 rounded-xl',
    icon: 'h-10 w-10 rounded-xl',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/30 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
        'shadow-sm hover:shadow-md',
        variants[variant],
        sizes[size],
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = 'Button';

export default Button;
