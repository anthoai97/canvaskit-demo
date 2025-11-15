<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import type { Canvas, CanvasKit, Surface } from 'canvaskit-wasm';
	import type { EditorPage } from '$lib/types/page';
	import {
		DEFAULT_CAMERA_ZOOM,
		MIN_CAMERA_ZOOM,
		MAX_CAMERA_ZOOM,
		HOVER_CHECK_DELAY,
		INVALID_INDEX,
		ZOOM_IN_FACTOR,
		ZOOM_OUT_FACTOR,
		CURSOR_DEFAULT,
		CURSOR_POINTER,
		CURSOR_GRAB,
		CURSOR_GRABBING
	} from '$lib/contants/const';
	import type { CameraState } from '$lib/types/camera';
	import type { MouseState } from '$lib/types/mouse';
	import type { Shape } from '$lib/types/shape';
	import { initCanvasKit, createWebGLSurface } from '$lib/canvakit/canvas';
	import { loadImageBinary } from '$lib/canvakit/image';
	import { createPaints, drawBackground, drawHoverBorder, drawSelectedBorder } from '$lib/canvakit/drawing';
	import { screenToWorld, getMousePosition } from '$lib/utils/coordinates';
	import { calculateViewport, isRectVisible } from '$lib/utils/viewport';
	import { findShapeAtPoint } from '$lib/utils/hit-test';
	import {
		getHoveredResizeCorner,
		getAnchorPoint,
		calculateDimensionsFromAnchor,
		calculatePositionFromAnchor,
		applyMinSizeConstraints,
		type ResizeCorner
	} from '$lib/utils/resize';

	let editor: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ck: CanvasKit;

	let canvasWidth: number;
	let canvasHeight: number;

	// UI state
	let canvasCursor = CURSOR_DEFAULT;
	let hoveredShapeIndex = INVALID_INDEX;
	let selectedShapeIndex = INVALID_INDEX;
	let hoveredResizeCorner: ResizeCorner | null = null;
	let resizingCorner: ResizeCorner | null = null;
	
	// Resize state - stores initial shape state when resize starts
	let resizeStartState: {
		shape: Shape;
		startMousePos: { x: number; y: number };
		aspectRatio: number;
	} | null = null;

	// Paint objects (reused for performance)
	let paints: ReturnType<typeof createPaints> | null = null;

	// Performance optimization: requestAnimationFrame throttling
	let animationFrameId: number | null = null;
	let needsRedraw = false;
	let hoverCheckTimeout: number | null = null;

	// Event handlers cleanup
	let cleanupEvents: (() => void) | null = null;

	$: centerX = canvasWidth ? canvasWidth / 2 : 0;
	$: centerY = canvasHeight ? canvasHeight / 2 : 0;

	let surface: Surface | null = null;
	let skCanvas: Canvas | null = null;

	let page: EditorPage = {
		width: 1920,
		height: 1080,
		backgroundColor: { r: 255, g: 255, b: 255, a: 1.0 }
	};

	let cameraState: CameraState = {
		zoom: DEFAULT_CAMERA_ZOOM,
		panX: 0,
		panY: 0,
		isPanning: false
	};

	let mouseState: MouseState = {
		isMouseDown: false,
		isDragging: false,
		lastMouseX: 0,
		lastMouseY: 0
	};

	let mock_data: Shape[] = [
		{
			x: 200,
			y: -200,
			width: 300,
			height: 200,
			ratio: 0,
			url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
			image: null
		},
		{
			x: -600,
			y: 100,
			width: 400,
			height: 300,
			ratio: 0,
			url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800',
			image: null
		},
		{
			x: 300,
			y: 200,
			width: 250,
			height: 180,
			ratio: 0,
			url: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=800',
			image: null
		},
		{
			x: -200,
			y: 400,
			width: 350,
			height: 250,
			ratio: 0,
			url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800',
			image: null
		},
		{
			x: 500,
			y: -400,
			width: 200,
			height: 150,
			ratio: 0,
			url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800',
			image: null
		},
		{
			x: -300,
			y: -500,
			width: 280,
			height: 200,
			ratio: 0,
			url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=800',
			image: null
		},
		{
			x: 100,
			y: 500,
			width: 320,
			height: 240,
			ratio: 0,
			url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800',
			image: null
		},
		{
			x: -500,
			y: 300,
			width: 180,
			height: 180,
			ratio: 0,
			url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
			image: null
		},
		{
			x: 600,
			y: 300,
			width: 400,
			height: 300,
			ratio: 0,
			url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800',
			image: null
		}
	];

	onMount(async () => {
		canvasWidth = editor.clientWidth;
		canvasHeight = editor.clientHeight;
		canvas.width = editor.clientWidth;
		canvas.height = editor.clientHeight;

		// Wait for reactive statements to update
		await tick();

		cameraState.panX = centerX;
		cameraState.panY = centerY;

		ck = await initCanvasKit();

		surface = createWebGLSurface(ck, canvas);
		skCanvas = surface?.getCanvas() ?? null;

		mock_data = await loadImageBinary(ck, mock_data);

		paints = createPaints(ck, page);

		cleanupEvents = bindEvents();
		drawScene();
	});

	onDestroy(() => {
		cleanupEvents?.();
		
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
		}
		
		if (hoverCheckTimeout !== null) {
			clearTimeout(hoverCheckTimeout);
		}

		selectedShapeIndex = INVALID_INDEX;
		hoveredShapeIndex = INVALID_INDEX;
		hoveredResizeCorner = null;
		resizingCorner = null;
		resizeStartState = null;
	});

	// ==================== Helper Functions ====================
	
	/**
	 * Updates cursor style based on current state
	 */
	const updateCursor = () => {
		if (cameraState.isPanning) {
			canvasCursor = mouseState.isMouseDown ? CURSOR_GRABBING : CURSOR_GRAB;
		} else if (hoveredResizeCorner !== null) {
			// Set resize cursors based on corner position
			switch (hoveredResizeCorner) {
				case 'top-left':
				case 'bottom-right':
					canvasCursor = 'nwse-resize';
					break;
				case 'top-right':
				case 'bottom-left':
					canvasCursor = 'nesw-resize';
					break;
			}
		} else if (hoveredShapeIndex !== INVALID_INDEX) {
			canvasCursor = mouseState.isDragging ? CURSOR_GRABBING : CURSOR_POINTER;
		} else {
			canvasCursor = CURSOR_DEFAULT;
		}
	};

	/**
	 * Validates and cleans up selected shape index
	 */
	const validateSelectedShape = () => {
		if (
			selectedShapeIndex !== INVALID_INDEX &&
			(selectedShapeIndex >= mock_data.length || !mock_data[selectedShapeIndex])
		) {
			selectedShapeIndex = INVALID_INDEX;
			hoveredResizeCorner = null;
		}
	};

	/**
	 * Checks if a shape index is valid
	 */
	const isValidShapeIndex = (index: number): boolean => {
		return index !== INVALID_INDEX && index < mock_data.length && mock_data[index] !== undefined;
	};

	/**
	 * Clears hover state
	 */
	const clearHoverState = () => {
		hoveredShapeIndex = INVALID_INDEX;
		hoveredResizeCorner = null;
		updateCursor();
		scheduleDraw();
	};

	/**
	 * Clears selection state
	 */
	const clearSelection = () => {
		selectedShapeIndex = INVALID_INDEX;
		hoveredResizeCorner = null;
		resizingCorner = null;
		resizeStartState = null;
		scheduleDraw();
	};


	// ==================== Rendering ====================
	
	/**
	 * Performance optimization: throttle draw calls using requestAnimationFrame
	 */
	const scheduleDraw = () => {
		if (!needsRedraw) {
			needsRedraw = true;
			animationFrameId = requestAnimationFrame(() => {
				needsRedraw = false;
				drawScene();
			});
		}
	};

	// ==================== Camera Controls ====================
	
	/**
	 * Handles camera panning
	 */
	const handlePanning = (event: MouseEvent) => {
		const { x: currentMouseX, y: currentMouseY } = getMousePosition(event, canvas);
		const deltaX = currentMouseX - mouseState.lastMouseX;
		const deltaY = currentMouseY - mouseState.lastMouseY;

		cameraState.panX += deltaX;
		cameraState.panY += deltaY;

		mouseState.lastMouseX = currentMouseX;
		mouseState.lastMouseY = currentMouseY;

		scheduleDraw();
	};

	const drawScene = () => {
		if (!skCanvas || !ck || !paints) return;
		
		skCanvas.clear(ck.Color(0, 0, 0, 1.0));
		skCanvas.save();

		skCanvas.translate(cameraState.panX, cameraState.panY);
		skCanvas.scale(cameraState.zoom, cameraState.zoom);
		
		// Calculate visible viewport for culling
		const viewport = calculateViewport(canvasWidth, canvasHeight, cameraState);
		
		// Draw background
		drawBackground(skCanvas, ck, page, paints.background);

		// Only draw shapes that are visible in viewport (viewport culling)
		for (const shape of mock_data) {
			if (!shape.image) continue;
			
			// Viewport culling - skip if shape is completely outside viewport
			if (!isRectVisible(shape.x, shape.y, shape.width, shape.height, viewport)) {
				continue;
			}
			
			const src = ck.XYWHRect(0, 0, shape.image.width(), shape.image.height());
			const dst = ck.XYWHRect(shape.x, shape.y, shape.width, shape.height);
			skCanvas.drawImageRect(shape.image, src, dst, paints.image);
		}

		// Draw hover effect (only if not selected)
		if (isValidShapeIndex(hoveredShapeIndex) && hoveredShapeIndex !== selectedShapeIndex) {
			const hoveredShape = mock_data[hoveredShapeIndex];
			drawHoverBorder(
				skCanvas,
				ck,
				hoveredShape.x,
				hoveredShape.y,
				hoveredShape.width,
				hoveredShape.height,
				paints.hover,
				cameraState.zoom
			);
		}

		// Validate and draw selected shape
		validateSelectedShape();
		if (isValidShapeIndex(selectedShapeIndex)) {
			const selectedShape = mock_data[selectedShapeIndex];
			drawSelectedBorder(
				skCanvas,
				ck,
				selectedShape.x,
				selectedShape.y,
				selectedShape.width,
				selectedShape.height,
				paints.tool,
				cameraState.zoom
			);
		}

		skCanvas.restore();
		surface?.flush();
	};

	/**
	 * Handles mouse wheel zoom
	 */
	const handleWheel = (event: WheelEvent) => {
		event.preventDefault();

		const { x: mouseX, y: mouseY } = getMousePosition(event, canvas);
		const zoomFactor = event.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR;
		const newZoom = Math.max(
			MIN_CAMERA_ZOOM,
			Math.min(MAX_CAMERA_ZOOM, cameraState.zoom * zoomFactor)
		);

		// Zoom towards mouse position - adjust pan to keep the point under mouse fixed
		const zoomChange = newZoom / cameraState.zoom;
		cameraState.panX = mouseX - (mouseX - cameraState.panX) * zoomChange;
		cameraState.panY = mouseY - (mouseY - cameraState.panY) * zoomChange;

		cameraState.zoom = newZoom;
		scheduleDraw();
	};

	// ==================== Mouse Event Handlers ====================
	
	/**
	 * Handles shape dragging
	 */
	const handleShapeDragging = (event: MouseEvent) => {
		event.preventDefault();
		
		const { x: currentMouseX, y: currentMouseY } = getMousePosition(event, canvas);
		const currentWorldPos = screenToWorld(currentMouseX, currentMouseY, cameraState);
		const lastWorldPos = screenToWorld(mouseState.lastMouseX, mouseState.lastMouseY, cameraState);
		
		const deltaX = currentWorldPos.x - lastWorldPos.x;
		const deltaY = currentWorldPos.y - lastWorldPos.y;
		
		const draggedShape = mock_data[hoveredShapeIndex];
		draggedShape.x += deltaX;
		draggedShape.y += deltaY;
		
		mouseState.lastMouseX = currentMouseX;
		mouseState.lastMouseY = currentMouseY;
		
		updateCursor();
		scheduleDraw();
	};

	// ==================== Resize Handlers ====================
	
	/**
	 * Handles shape resizing while maintaining aspect ratio
	 */
	const handleShapeResizing = (event: MouseEvent) => {
		if (!resizeStartState || !resizingCorner || !isValidShapeIndex(selectedShapeIndex)) {
			return;
		}

		event.preventDefault();
		
		const { x: currentMouseX, y: currentMouseY } = getMousePosition(event, canvas);
		const currentWorldPos = screenToWorld(currentMouseX, currentMouseY, cameraState);
		const shape = mock_data[selectedShapeIndex];
		const { shape: startShape, aspectRatio } = resizeStartState;

		// Get anchor point (opposite corner)
		const anchor = getAnchorPoint(resizingCorner, startShape);

		// Calculate new dimensions maintaining aspect ratio
		let { width: newWidth, height: newHeight } = calculateDimensionsFromAnchor(
			anchor,
			currentWorldPos,
			aspectRatio
		);

		// Apply minimum size constraints
		({ width: newWidth, height: newHeight } = applyMinSizeConstraints(
			newWidth,
			newHeight,
			aspectRatio
		));

		// Calculate new position from anchor point
		const { x: newX, y: newY } = calculatePositionFromAnchor(
			resizingCorner,
			anchor,
			newWidth,
			newHeight
		);

		// Update shape
		shape.x = newX;
		shape.y = newY;
		shape.width = newWidth;
		shape.height = newHeight;

		mouseState.lastMouseX = currentMouseX;
		mouseState.lastMouseY = currentMouseY;

		scheduleDraw();
	};

	/**
	 * Handles hover detection with throttling
	 */
	const handleHoverDetection = (event: MouseEvent) => {
		if (hoverCheckTimeout !== null) {
			return; // Skip if already scheduled
		}

		hoverCheckTimeout = window.setTimeout(() => {
			hoverCheckTimeout = null;
			
			if (!editor) return;
			
			const { x, y } = getMousePosition(event, editor);
			const worldPos = screenToWorld(x, y, cameraState);
			
			// First, check if mouse is over a resize corner of the selected shape
			let newHoveredResizeCorner: ResizeCorner | null = null;
			
			if (isValidShapeIndex(selectedShapeIndex)) {
				const selectedShape = mock_data[selectedShapeIndex];
				newHoveredResizeCorner = getHoveredResizeCorner(worldPos, selectedShape, cameraState.zoom);
			}
			
			// Only check for shape hover if not hovering over a resize corner
			let newHoveredIndex = INVALID_INDEX;
			if (newHoveredResizeCorner === null) {
				newHoveredIndex = findShapeAtPoint(worldPos, mock_data);
			}

			// Update hover states if changed
			let needsUpdate = false;
			
			if (newHoveredResizeCorner !== hoveredResizeCorner) {
				hoveredResizeCorner = newHoveredResizeCorner;
				needsUpdate = true;
			}
			
			if (newHoveredIndex !== hoveredShapeIndex) {
				hoveredShapeIndex = newHoveredIndex;
				needsUpdate = true;
			}

			if (needsUpdate) {
				updateCursor();
				scheduleDraw();
			}
		}, HOVER_CHECK_DELAY);
	};

	/**
	 * Handles mouse move events
	 */
	const handleMouseMove = (event: MouseEvent) => {
		// Handle camera panning
		if (cameraState.isPanning && mouseState.isMouseDown) {
			event.preventDefault();
			updateCursor();
			handlePanning(event);
			return;
		}

		// Handle shape resizing (priority over dragging)
		if (resizingCorner !== null && mouseState.isMouseDown) {
			handleShapeResizing(event);
			return;
		}

		// Handle shape dragging
		if (mouseState.isDragging && isValidShapeIndex(hoveredShapeIndex)) {
			handleShapeDragging(event);
			return;
		}

		// Handle hover detection
		handleHoverDetection(event);
	};

	/**
	 * Initializes mouse state for dragging
	 */
	const initializeMouseDrag = (x: number, y: number) => {
		mouseState.isMouseDown = true;
		mouseState.lastMouseX = x;
		mouseState.lastMouseY = y;
		updateCursor();
	};

	/**
	 * Handles mouse down events
	 */
	const handleMouseDown = (event: MouseEvent) => {
		event.preventDefault();
		const { x, y } = getMousePosition(event, canvas);

		if (cameraState.isPanning) {
			initializeMouseDrag(x, y);
			return; // Don't handle shape selection while panning
		}

		// Check if clicking on a resize corner
		if (hoveredResizeCorner !== null && isValidShapeIndex(selectedShapeIndex)) {
			const shape = mock_data[selectedShapeIndex];
			const worldPos = screenToWorld(x, y, cameraState);
			
			// Initialize resize state
			resizingCorner = hoveredResizeCorner;
			resizeStartState = {
				shape: { ...shape }, // Copy shape state
				startMousePos: worldPos,
				aspectRatio: shape.width / shape.height
			};
			
			mouseState.isMouseDown = true;
			mouseState.lastMouseX = x;
			mouseState.lastMouseY = y;
			updateCursor();
			return;
		}

		// Handle shape selection/dragging
		if (isValidShapeIndex(hoveredShapeIndex)) {
			mouseState.isDragging = true;
			initializeMouseDrag(x, y);
			// Clear resize corner hover when selection changes
			if (selectedShapeIndex !== hoveredShapeIndex) {
				hoveredResizeCorner = null;
			}
			selectedShapeIndex = hoveredShapeIndex;
		} else {
			clearSelection();
		}

		scheduleDraw();
	};

	/**
	 * Handles mouse up events
	 */
	const handleMouseUp = (event: MouseEvent) => {
		if (mouseState.isMouseDown) {
			event.preventDefault();
			mouseState.isMouseDown = false;
			mouseState.isDragging = false;
			resizingCorner = null;
			resizeStartState = null;
			updateCursor();
		}
	};

	/**
	 * Handles mouse leave events
	 */
	const handleMouseLeave = (event: MouseEvent) => {
		if (mouseState.isMouseDown) {
			mouseState.isMouseDown = false;
			mouseState.isDragging = false;
			resizingCorner = null;
			resizeStartState = null;
			updateCursor();
		}
		
		if (hoverCheckTimeout !== null) {
			clearTimeout(hoverCheckTimeout);
			hoverCheckTimeout = null;
		}
		
		clearHoverState();
	};

	// ==================== Keyboard Event Handlers ====================
	
	/**
	 * Checks if event should be ignored (e.g., typing in input field)
	 */
	const shouldIgnoreKeyboardEvent = (event: KeyboardEvent): boolean => {
		return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
	};

	/**
	 * Handles key down events
	 */
	const handleKeyDown = (event: KeyboardEvent) => {
		if (shouldIgnoreKeyboardEvent(event)) {
			return;
		}

		if ((event.code === 'Space' || event.key === ' ') && !cameraState.isPanning) {
			event.preventDefault();
			cameraState.isPanning = true;
			updateCursor();
		}

		if (event.code === 'Escape' || event.key === 'Escape') {
			clearSelection();
		}
	};

	/**
	 * Handles key up events
	 */
	const handleKeyUp = (event: KeyboardEvent) => {
		if (event.code === 'Space' || event.key === ' ') {
			event.preventDefault();
			cameraState.isPanning = false;
			updateCursor();
		}
	};

	// ==================== Window Event Handlers ====================
	
	/**
	 * Handles window resize events
	 */
	const handleResize = () => {
		canvasWidth = editor.clientWidth;
		canvasHeight = editor.clientHeight;
		canvas.width = canvasWidth;
		canvas.height = canvasHeight;
		scheduleDraw();
	};

	// ==================== Event Binding ====================
	
	/**
	 * Binds all event listeners and returns cleanup function
	 */
	const bindEvents = () => {
		// Window events
		window.addEventListener('resize', handleResize);
		window.addEventListener('mouseup', handleMouseUp);
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);

		// Canvas events
		canvas.addEventListener('wheel', handleWheel, { passive: false });
		canvas.addEventListener('mousemove', handleMouseMove);
		canvas.addEventListener('mousedown', handleMouseDown);
		canvas.addEventListener('mouseup', handleMouseUp);
		canvas.addEventListener('mouseleave', handleMouseLeave);

		// Return cleanup function
		return () => {
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('mouseup', handleMouseUp);
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
			canvas.removeEventListener('wheel', handleWheel);
			canvas.removeEventListener('mousemove', handleMouseMove);
			canvas.removeEventListener('mousedown', handleMouseDown);
			canvas.removeEventListener('mouseup', handleMouseUp);
			canvas.removeEventListener('mouseleave', handleMouseLeave);
		};
	};
</script>

<div class="flex">
	<div class="w-[200px]"></div>

	<div
		class="editor w-full h-screen overflow-hidden"
		style="cursor: {canvasCursor}"
		bind:this={editor}
	>
		<canvas id="canvas" bind:this={canvas}></canvas>
	</div>
</div>

<style>
</style>
