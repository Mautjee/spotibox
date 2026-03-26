export function getFingerprint(): string {
	// Build a string from stable browser properties
	const components = [
		navigator.userAgent,
		navigator.language,
		screen.width,
		screen.height,
		screen.colorDepth,
		Intl.DateTimeFormat().resolvedOptions().timeZone,
	].join('|');

	// Simple djb2 hash (no crypto needed, just needs to be stable)
	let hash = 5381;
	for (let i = 0; i < components.length; i++) {
		hash = ((hash << 5) + hash) + components.charCodeAt(i);
		hash = hash & hash; // Convert to 32-bit integer
	}
	return 'fp_' + Math.abs(hash).toString(36);
}

export function getCrowdToken(): string {
	// Try cookie first
	const match = document.cookie.match(/spotybox_token=([^;]+)/);
	if (match) return match[1];

	// Fallback: try localStorage
	let token = localStorage.getItem('spotybox_token');
	if (token) return token;

	// Last resort: fingerprint
	return getFingerprint();
}
