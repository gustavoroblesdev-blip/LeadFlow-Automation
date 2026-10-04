import { Router, type IRouter } from "express";
import {
  CompleteAppointmentParams,
  CompleteAppointmentResponse,
  CreateAppointmentBody,
  CreateAppointmentParams,
  CreateAppointmentResponse,
} from "@workspace/api-zod";
import {
  completeAppointmentById,
  createAppointmentForLead,
} from "../services/appointmentService";

const router: IRouter = Router();

router.post("/leads/:leadId/appointments", async (req, res): Promise<void> => {
  const params = CreateAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CreateAppointmentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const appointment = await createAppointmentForLead(
    params.data.leadId,
    new Date(body.data.startsAt),
    body.data.title,
  );
  if (!appointment) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  res
    .status(201)
    .json(
      CreateAppointmentResponse.parse({
        id: appointment.id,
        leadId: appointment.leadId,
        title: appointment.title,
        startsAt: appointment.startsAt.toISOString(),
        status: appointment.status,
      }),
    );
});

router.post(
  "/appointments/:appointmentId/complete",
  async (req, res): Promise<void> => {
    const params = CompleteAppointmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const appointment = await completeAppointmentById(
      params.data.appointmentId,
    );
    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    res.json(
      CompleteAppointmentResponse.parse({
        id: appointment.id,
        leadId: appointment.leadId,
        title: appointment.title,
        startsAt: appointment.startsAt.toISOString(),
        status: appointment.status,
      }),
    );
  },
);

export default router;