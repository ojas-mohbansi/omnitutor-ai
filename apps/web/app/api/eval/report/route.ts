import { evalReports } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json } from "../../_lib/http";

/** The latest evaluation reports (system-level: the team test set, no learner data). */
export const GET = handle(async () => json(endpoints.evalReport.response, await evalReports()));
