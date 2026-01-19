export function debounce(fn, wait = 300) {
  let t = null;
  const debounced = (...args) =>
    new Promise((resolve, reject) => {
      if (t) clearTimeout(t);
      t = setTimeout(async () => {
        t = null;
        try {
          resolve(await fn(...args));
        } catch (e) {
          reject(e);
        }
      }, wait);
    });

  debounced.cancel = () => {
    if (t) clearTimeout(t);
    t = null;
  };
  return debounced;
}

