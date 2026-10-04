import { Router, type IRouter } from "express";
import {
  RunCompleteDemoBody,
  RunCompleteDemoResponse,
  SimulateLeadBody,
  SimulateLeadResponse,
} from "@workspace/api-zod";
import {
  runCompleteDemo,
  simulateNewLead,
} from "../services/demoService";

const router: IRouter = Router();

router.post("/demo/simulate-lead", async (req, res): Promise<void> => {
  const parsed = SimulateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await simulateNewLead(parsed.data.lead);
  res.status(201).json(SimulateLeadResponse.parse(result));
});

router.post("/demo/run-complete", async (req, res): Promise<void> => {
  const parsed = RunCompleteDemoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await runCompleteDemo(parsed.data.lead);
  res.status(201).json(RunCompleteDemoResponse.parse(result));
});

export default router;