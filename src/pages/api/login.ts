import { ObjectParser } from "@pilcrowjs/object-parser";
import { verifyPasswordHash } from "@lib/password";
import { createSession, setSessionCookie } from "@lib/session";
import { verifyEmailInput } from "@lib/email";
import { Throttler } from "@lib/rate-limit";
import { getUserFromEmail, getUserPasswordHash } from "@lib/user";

import type { APIContext } from "astro";
import type { SessionFlags } from "@lib/session";

const throttler = new Throttler<number>([0, 1, 2, 4, 8, 16, 30, 60, 180, 300]);

export async function POST(context: APIContext): Promise<Response> {
	const data: unknown = await context.request.json();
	const parser = new ObjectParser(data);
	let email: string, password: string;
	try {
		email = parser.getString("email").toLowerCase();
		password = parser.getString("password");
	} catch {
		return new Response("Invalid or missing fields", {
			status: 400
		});
	}
	if (email === "" || password === "") {
		return new Response("Please enter your email and password.", {
			status: 400
		});
	}
	if (!verifyEmailInput(email)) {
		return new Response("Invalid email", {
			status: 400
		});
	}
	const user = getUserFromEmail(email);
	if (user === null) {
		return new Response("Account does not exist", {
			status: 400
		});
	}
	if (!throttler.check(user.id)) {
		return new Response("Too many request", {
			status: 429
		});
	}
	const passwordHash = getUserPasswordHash(user.id);
	const validPassword = await verifyPasswordHash(passwordHash, password);
	if (!validPassword) {
		throttler.increment(user.id);
		return new Response("Invalid password", {
			status: 400
		});
	}
	throttler.reset(user.id);
	const sessionFlags: SessionFlags = {
		twoFactorVerified: false
	};
	const session = createSession(user.id, sessionFlags);
	setSessionCookie(context, session);
	return new Response(null, { status: 204 });
}
