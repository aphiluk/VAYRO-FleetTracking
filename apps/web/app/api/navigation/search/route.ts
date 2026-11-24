import { proxyNavigation } from "@/lib/navigation-gateway";

export async function GET(request: Request) {
  return proxyNavigation(request, "search");
}
