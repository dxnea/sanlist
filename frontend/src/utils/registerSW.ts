export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const basePath = import.meta.env.BASE_URL || '/';
      const registration = await navigator.serviceWorker.register(`${basePath}sw.js`, {
        scope: basePath,
      });
      console.log('Service Worker registered:', registration.scope);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }
  return null;
}
