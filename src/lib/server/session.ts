import { env } from '$env/dynamic/private';

export interface SessionData {
	djUserId: string;
	djDisplayName: string;
	spotifyAccessToken: string;
	spotifyRefreshToken: string;
	tokenExpiry: number; // unix timestamp ms
}

const COOKIE_NAME = 'spotybox_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

async function getSigningKey(): Promise<CryptoKey> {
	const secret = env.SESSION_SECRET;
	if (!secret) throw new Error('SESSION_SECRET is not set');
	const keyData = new TextEncoder().encode(secret);
	return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
		'verify',
	]);
}

async function sign(payload: string): Promise<string> {
	const key = await getSigningKey();
	const data = new TextEncoder().encode(payload);
	const signature = await crypto.subtle.sign('HMAC', key, data);
	const sigHex = Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return `${payload}.${sigHex}`;
}

async function verify(signed: string): Promise<string | null> {
	const lastDot = signed.lastIndexOf('.');
	if (lastDot === -1) return null;

	const payload = signed.slice(0, lastDot);
	const sigHex = signed.slice(lastDot + 1);

	const key = await getSigningKey();
	const data = new TextEncoder().encode(payload);

	// Reconstruct the signature bytes from hex
	const sigBytes = new Uint8Array(
		sigHex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? [],
	);

	const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
	return valid ? payload : null;
}

function isProduction(): boolean {
	return process.env.NODE_ENV === 'production';
}

export async function createSessionCookie(data: SessionData): Promise<string> {
	const payload = btoa(JSON.stringify(data));
	const signed = await sign(payload);
	const secure = isProduction() ? '; Secure' : '';
	return `${COOKIE_NAME}=${encodeURIComponent(signed)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secure}`;
}

export async function readSessionCookie(cookieHeader: string | null): Promise<SessionData | null> {
	if (!cookieHeader) return null;

	const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
	if (!match) return null;

	try {
		const raw = decodeURIComponent(match[1]);
		const payload = await verify(raw);
		if (!payload) return null;
		return JSON.parse(atob(payload)) as SessionData;
	} catch {
		return null;
	}
}

export function clearSessionCookie(): string {
	const secure = isProduction() ? '; Secure' : '';
	return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}
