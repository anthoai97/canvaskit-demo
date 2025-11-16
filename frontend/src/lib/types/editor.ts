import type { Shape } from './shape';
import type { ResizeCorner } from '../utils/resize';
import type { Point } from '../utils/transform';
import { INVALID_INDEX } from '../contants/const';

export interface SelectedShape {
	index: number;
	rendered: boolean;
}

export interface ResizeState {
	shape: Shape;
	startMousePos: Point;
	aspectRatio: number;
}

export interface RotationState {
	initialRotation: number;
	initialAngle: number;
}

export const createSelectedShape = (): SelectedShape => ({
	index: INVALID_INDEX,
	rendered: false
});

export const resetSelectedShape = (selected: SelectedShape): void => {
	selected.index = INVALID_INDEX;
	selected.rendered = false;
};

