import { atom } from "nanostores";

import type { Question } from "../../src/maps/schema";

/**
 * Holds the in-progress (draft) question during the Add Question flow.
 * Non-persistent — never touches AsyncStorage, so it is discarded on app
 * restart and never affects the map until the user taps Submit.
 */
export const draftQuestion = atom<Question | null>(null);
