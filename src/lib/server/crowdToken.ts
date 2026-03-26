import { nanoid } from 'nanoid';

export const CROWD_TOKEN_COOKIE = 'spotybox_token';

export function generateCrowdToken(): string {
	return nanoid(32);
}
