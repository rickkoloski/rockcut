// Navigations the service worker leaves to the network instead of serving the
// app shell (D21). Whole path segments only: `/dev` must not catch `/devices`
// (D33's Shared devices page), which then failed offline (DEV pass 3 G2).
export const SW_NAVIGATION_DENYLIST = [/^\/api(\/|$)/, /^\/dev(\/|$)/]
