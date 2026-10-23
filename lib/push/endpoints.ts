/**
 * Whether a push subscription endpoint belongs to a browser push service.
 *
 * An endpoint is an address our server will POST to whenever it sends a push,
 * and a promo announcement sends to every subscriber at once. A real endpoint
 * is minted by the browser and always lives on one of these hosts, so anything
 * else is somebody pointing our server at an address of their choosing.
 *
 * Migration 0094 holds the same list in is_browser_push_endpoint().
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isBrowserPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") {
    return false;
  }
  return PUSH_HOSTS.some((host) => host.test(url.hostname));
}
