/* --------------------------------------------------------------------------
   The route map (/map) is a development screen: every route in the app on
   one page, for walking the build. POL-FE-39 — it is a 404 in production and
   no menu, footer or sheet links to it there. One flag, read everywhere the
   link appears, so the two can't drift apart. `NODE_ENV` is inlined into
   client bundles, so the client-side sheets read the same answer.
   -------------------------------------------------------------------------- */

export const ROUTE_MAP_SHOWN = process.env.NODE_ENV !== "production";
