// @format
let next = 0;

// NOTE: environment.rpcHttpHost can be a single URL or a list of URLs. With a
// list, each call returns the next URL, so requests are spread across
// providers (e.g. to stay within several free tiers).
export function rpcHttpHost({ rpcHttpHost }) {
  if (!Array.isArray(rpcHttpHost)) return rpcHttpHost;
  return rpcHttpHost[next++ % rpcHttpHost.length];
}
