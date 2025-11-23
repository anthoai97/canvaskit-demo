import type { ResizeCorner } from './resize';
import { INVALID_INDEX } from '$lib/constants/const';

export interface HoverState {
	shapeIndex: number;
	resizeCorner: ResizeCorner | null;
	isHoveringRotateCircle: boolean;
}

export const createHoverState = (): HoverState => ({
	shapeIndex: INVALID_INDEX,
	resizeCorner: null,
	isHoveringRotateCircle: false
});

export const resetHoverState = (state: HoverState): void => {
	state.shapeIndex = INVALID_INDEX;
	state.resizeCorner = null;
	state.isHoveringRotateCircle = false;
};

