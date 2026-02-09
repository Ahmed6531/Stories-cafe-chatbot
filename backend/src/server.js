import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { ENV } from "./config/env.js";


async function start() {
  await connectDB();

  const app = createApp();
  app.listen(ENV.PORT, () => {
    console.log(`✅ Backend running on http://localhost:${ENV.PORT}`);
  });
}

start().catch((err) => {
  console.error("❌ Server failed to start:", err.message);
  process.exit(1);
});


