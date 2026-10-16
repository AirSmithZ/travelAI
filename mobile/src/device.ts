/** 电脑：精细指针、能悬停、视口够宽。手机和平板留在手机壳。调用方只在进入页面时判一次。 */
export function isPhoneClient(): boolean {
  if (typeof window === 'undefined') return true;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const hover = window.matchMedia('(hover: hover)').matches;
  const wide = window.matchMedia('(min-width: 960px)').matches;
  return !(fine && hover && wide);
}
