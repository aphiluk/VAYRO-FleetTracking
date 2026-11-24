import { proxyNavigation } from "@/lib/navigation-gateway";

export async function POST(request: Request) {
  return proxyNavigation(request, "route");
}
