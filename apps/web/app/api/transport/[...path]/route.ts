import { proxyTransport } from "@/lib/transport-gateway";

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyTransport(request, (await params).path);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH };
