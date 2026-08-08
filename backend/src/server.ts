import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const host = "0.0.0.0";

const app = buildApp();

try {
  await app.listen({ port, host });
  // eslint-disable-next-line no-console
  console.log(`API พร้อมใช้งานที่ http://localhost:${port}/api/v1`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
