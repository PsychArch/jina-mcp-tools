import { createHttpApp, createMcpServer } from "../../dist/index.js";
import { initializeCache } from "../../dist/cache.js";

initializeCache(2);
const app = createHttpApp(() => createMcpServer({
  searchEndpoint: process.env.JINA_TEST_SEARCH_ENDPOINT,
  tokensPerPage: 40
}), { allowedHosts: [], allowedOrigins: ["https://client.example"], authToken: "e2e-http-token" });
const server = app.listen(0, "127.0.0.1", () => {
  process.send({ port: server.address().port });
});
process.on("disconnect", () => {
  server.closeAllConnections();
  server.close();
});
