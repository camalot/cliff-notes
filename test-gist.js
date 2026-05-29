import { loadConfig } from "./apps/api/src/config.js";
import { buildServer } from "./apps/api/src/server.js";

const app = await buildServer(loadConfig({}), { logger: false });
const res = await app.inject({
  method: "GET",
  url: "/api/gist/invalid",
});
console.log("Status:", res.statusCode);
console.log("Body:", res.body);
app.close();
