// 统一管理前端所有 key/token（从 Vite 环境变量读取）
// 注意：这里只做读取与基本校验，不要在代码里硬编码任何密钥。

export const ENV = {
  AMAP_WEB_KEY: import.meta.env.VITE_AMAP_WEB_KEY || '',
  MAPBOX_TOKEN: import.meta.env.VITE_MAPBOX_TOKEN || '',
};

export function requireEnv(key, hint) {
  const value = ENV[key] || '';
  if (!value) {
    throw new Error(hint || `缺少环境变量：${key}`);
  }
  return value;
}

