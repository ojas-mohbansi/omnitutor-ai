import { profileView, saveProfile } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readBody, sessionOf } from "../_lib/http";

/** The signed-in learner's onboarding profile ({ profile: null } before onboarding). */
export const GET = handle(async (req) => json(endpoints.getProfile.response, await profileView(sessionOf(req))));

/** Saves the onboarding answers; they personalise the tutor's tone, structure and temperature. */
export const POST = handle(async (req) => {
  const body = await readBody(req, endpoints.saveProfile.request);
  return json(endpoints.saveProfile.response, await saveProfile(sessionOf(req), body));
});
