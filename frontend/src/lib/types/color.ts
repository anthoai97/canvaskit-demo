// src/lib/types/color.ts
export interface RGBA {
	r: number; // 0-255
	g: number; // 0-255
	b: number; // 0-255
	a: number; // 0-1 (alpha/opacity)
}

// Helper function to convert to CanvasKit Color
export function rgbaToCanvasKitColor(ck: any, color: RGBA) {
	return ck.Color(color.r, color.g, color.b, color.a);
}

// Helper to convert from hex string
export function hexToRGBA(hex: string, alpha: number = 1.0): RGBA {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return { r, g, b, a: alpha };
}

// Helper to convert to hex string
export function rgbaToHex(color: RGBA): string {
	const r = Math.round(color.r).toString(16).padStart(2, '0');
	const g = Math.round(color.g).toString(16).padStart(2, '0');
	const b = Math.round(color.b).toString(16).padStart(2, '0');
	return `#${r}${g}${b}`;
}