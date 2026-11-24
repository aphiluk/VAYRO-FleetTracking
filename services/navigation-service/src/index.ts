import { createNavigationApp } from "./app";

const app = createNavigationApp().listen({ hostname: process.env.HOST ?? "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
console.log(`navigation-service listening on ${app.server?.hostname}:${app.server?.port}`);
