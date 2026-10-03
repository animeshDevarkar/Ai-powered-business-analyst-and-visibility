"use client";

import { createAuthClient } from "better-auth/react";

// Relative auth endpoints use the Next.js proxy and same-origin session cookies.
export const authClient = createAuthClient();
