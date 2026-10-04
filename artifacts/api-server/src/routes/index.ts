import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import dashboardRouter from "./dashboard";
import automationRouter from "./automation";
import appointmentsRouter from "./appointments";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadsRouter);
router.use(dashboardRouter);
router.use(automationRouter);
router.use(appointmentsRouter);
router.use(webhooksRouter);

export default router;
