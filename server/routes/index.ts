import { Express } from "express";
import { registerAuthRoutes } from "./auth.routes";
import { registerMoverRoutes } from "./mover.routes";
import { registerBookingRoutes } from "./booking.routes";
import { registerPaymentRoutes } from "./payment.routes";
import { registerAdminRoutes } from "./admin.routes";
import { registerSupportRoutes } from "./support.routes";
import { registerAIRoutes } from "./ai.routes";
import { registerConfigRoutes } from "./config.routes";
import { registerStorageRoutes } from "./storage.routes";
import { registerUserRoutes } from "./user.routes";

export function registerAllRoutes(app: Express): void {
  registerConfigRoutes(app);
  registerStorageRoutes(app);
  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerMoverRoutes(app);
  registerBookingRoutes(app);
  registerPaymentRoutes(app);
  registerAdminRoutes(app);
  registerSupportRoutes(app);
  registerAIRoutes(app);
}
