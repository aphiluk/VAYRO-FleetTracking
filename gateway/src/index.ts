import { createGateway } from "./app";

const app = createGateway().listen({
  hostname: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
});

console.log(`gateway listening on ${app.server?.hostname}:${app.server?.port}`);
