import { internalToken, required } from "@vayro/service-kit";

function providerUrl(value: string) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Navigation provider must be an HTTP(S) URL without credentials");
  }
  return url.href;
}

export function readConfig() {
  return {
    authServiceUrl: required("AUTH_SERVICE_URL"),
    internalToken: internalToken(),
    geocodingUrl: providerUrl(process.env.NAVIGATION_GEOCODING_URL ?? "https://photon.komoot.io/api/"),
    routingUrl: providerUrl(process.env.NAVIGATION_ROUTING_URL ?? "https://valhalla1.openstreetmap.de/route"),
  };
}
