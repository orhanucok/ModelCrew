import { Router } from "express";
import { runSingleChat } from "../core/crew/orchestrator.js";
import { userError } from "../utils/errors.js";

export const chatRouter = Router();

chatRouter.post("/single", async (req, res, next) => {
  try {
    const modelId = String(req.body?.modelId ?? "").trim();
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!modelId) throw userError("Choose one selected model before sending a chat message.");
    if (!messages.length) throw userError("Write a message before sending.");
    const response = await runSingleChat({ modelId, messages });
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});
