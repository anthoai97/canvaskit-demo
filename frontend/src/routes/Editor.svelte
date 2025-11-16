<script lang="ts">
	import { createWebGLSurface, initCanvasKit } from '$lib/canvakit/canvas';
	import {
		createPaints,
		drawBackground,
		drawHoverBorder,
		drawSelectedBorder
	} from '$lib/canvakit/drawing';
	import { loadImageBinary, drawImageShape } from '$lib/canvakit/image';
	import {
		CURSOR_GRAB,
		CURSOR_GRABBING,
		DEFAULT_CAMERA_ZOOM,
		HOVER_CHECK_DELAY,
		INVALID_INDEX,
		MAX_CAMERA_ZOOM,
		MIN_CAMERA_ZOOM,
		ZOOM_IN_FACTOR,
		ZOOM_OUT_FACTOR
	} from '$lib/contants/const';
	import type { CameraState } from '$lib/types/camera';
	import { StableWebSocket } from '$lib/ws';
	import {
		createSelectedShape,
		resetSelectedShape,
		type ResizeState,
		type RotationState,
		type SelectedShape
	} from '$lib/types/editor';
	import type { MouseState } from '$lib/types/mouse';
	import type { EditorPage } from '$lib/types/page';
	import type { ImageShape, Shape } from '$lib/types/shape';
	import { getMousePosition, screenToWorld } from '$lib/utils/coordinates';
	import { CURSOR_DEFAULT, getCursorStyle } from '$lib/utils/cursor';
	import { findShapeAtPoint } from '$lib/utils/hit-test';
	import { detectHover, updateHoverState } from '$lib/utils/hover-detection';
	import { createHoverState, resetHoverState, type HoverState } from '$lib/utils/hover-state';
	import { getCornerDirection, type ResizeCorner } from '$lib/utils/resize';
	import {
		calculateResize,
		calculateRotation,
		initializeResize,
		initializeRotation
	} from '$lib/utils/shape-operations';
	import { getShapeCenter } from '$lib/utils/transform';
	import { calculateViewport, isRectVisible } from '$lib/utils/viewport';
	import type { Canvas, CanvasKit, Paint, Surface, FontMgr } from 'canvaskit-wasm';
	import { onDestroy, onMount, tick } from 'svelte';
	import { loadFonts, preloadFonts } from '$lib/canvakit/font';
	import { drawTextShape } from '$lib/canvakit/text';

	let editor: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ck: CanvasKit;

	let canvasWidth: number;
	let canvasHeight: number;
	let devicePixelRatioValue = 1;

	// UI state
	let canvasCursor = CURSOR_DEFAULT;
	let hoverState: HoverState = createHoverState();
	let selectedShape: SelectedShape = createSelectedShape();
	let resizingCorner: ResizeCorner | null = null;
	let resizeStartState: ResizeState | null = null;
	let rotationStartState: RotationState | null = null;

	// Paint objects (reused for performance)
	let paints: ReturnType<typeof createPaints> | null = null;
	let lowOpacityPaint: Paint | null = null;
	let pageBounds: Float32Array | null = null;

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
	let fontMgr: FontMgr | null = null;

	let page: EditorPage = {
		width: 1920,
		height: 1080,
		background: {
			color: { r: 255, g: 255, b: 255, a: 1.0 }
		}
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

	let mock_data: Shape[] = [];

	// ==================== WebSocket state ====================
	let ws: StableWebSocket | null = null;
	let wsMessages: string[] = [];

	const setupWebSocket = () => {
		ws = new StableWebSocket();

		ws.addMessageListener((event) => {
			wsMessages = [...wsMessages.slice(-19), event.data];
		});
	};

	const sendTestMessage = () => {
		ws?.send(`hello from editor at ${new Date().toLocaleTimeString()}`);
	};

	onMount(async () => {
		canvasWidth = editor.clientWidth;
		canvasHeight = editor.clientHeight;

		// Handle HiDPI / Retina displays to keep rendering (especially text) sharp
		devicePixelRatioValue = window.devicePixelRatio || 1;
		canvas.style.width = `${canvasWidth}px`;
		canvas.style.height = `${canvasHeight}px`;
		canvas.width = canvasWidth * devicePixelRatioValue;
		canvas.height = canvasHeight * devicePixelRatioValue;

		// Wait for reactive statements to update
		await tick();

		cameraState.panX = centerX;
		cameraState.panY = centerY;

		ck = await initCanvasKit();

		// Start loading font data and build a FontMgr for Paragraph / text rendering
		preloadFonts();
		fontMgr = await loadFonts(ck);

		surface = createWebGLSurface(ck, canvas);
		skCanvas = surface?.getCanvas() ?? null;

		// Load initial shapes from backend API (or static test JSON for now)
		try {
			// TODO: switch to a real backend endpoint (e.g. /api/mock_data) later
			const response = await fetch('/test_data/stress_text_mock_data.json');
			if (response.ok) {
				const data = (await response.json()) as Shape[];
				mock_data = data;
			} else {
				console.error('Failed to fetch mock data', response.status);
			}
		} catch (error) {
			console.error('Error fetching mock data', error);
		}

		// Load images for image shapes
		mock_data = (await loadImageBinary(ck, mock_data as ImageShape[])) as Shape[];

		paints = createPaints(ck, page);

		// Initialize cached paint and bounds for performance
		lowOpacityPaint = new ck.Paint();
		lowOpacityPaint.setAlphaf(0.5); // 50% opacity
		pageBounds = ck.XYWHRect(-page.width / 2, -page.height / 2, page.width, page.height);

		cleanupEvents = bindEvents();
		drawScene();

		// Setup WebSocket connection for collaborative messaging / presence.
		// setupWebSocket();
	});

	onDestroy(() => {
		cleanupEvents?.();
		ws?.close();
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
		}

		if (hoverCheckTimeout !== null) {
			clearTimeout(hoverCheckTimeout);
		}

		resetSelectedShape(selectedShape);
		resetHoverState(hoverState);
		resizingCorner = null;
		resizeStartState = null;
		rotationStartState = null;
	});

	// ==================== Helper Functions ====================

	/**
	 * Updates cursor style based on current state
	 */
	const updateCursor = () => {
		// If hovering over rotate circle of selected shape, use grab cursor
		if (hoverState.isHoveringRotateCircle && isValidShapeIndex(selectedShape.index)) {
			canvasCursor = mouseState.isMouseDown ? CURSOR_GRABBING : CURSOR_GRAB;
			return;
		}

		let resizeDirection: ReturnType<typeof getCornerDirection> | null = null;
		let rotation: number | null = null;

		if (hoverState.resizeCorner !== null && isValidShapeIndex(selectedShape.index)) {
			const selectedShapeData = mock_data[selectedShape.index];
			rotation = selectedShapeData.rotate ?? null;
			resizeDirection = getCornerDirection(hoverState.resizeCorner, selectedShapeData, rotation);
		}

		canvasCursor = getCursorStyle({
			isPanning: cameraState.isPanning,
			isMouseDown: mouseState.isMouseDown,
			isDragging: mouseState.isDragging,
			hoveredResizeCorner: hoverState.resizeCorner,
			resizeDirection,
			hasHoveredShape: hoverState.shapeIndex !== INVALID_INDEX,
			rotation
		});
	};

	/**
	 * Validates and cleans up selected shape index
	 */
	const validateSelectedShape = () => {
		if (
			selectedShape.index !== INVALID_INDEX &&
			(selectedShape.index >= mock_data.length || !mock_data[selectedShape.index])
		) {
			resetSelectedShape(selectedShape);
			resetHoverState(hoverState);
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
		resetHoverState(hoverState);
		updateCursor();
		scheduleDraw();
	};

	/**
	 * Clears selection state
	 */
	const clearSelection = () => {
		resetSelectedShape(selectedShape);
		resetHoverState(hoverState);
		resizingCorner = null;
		resizeStartState = null;
		rotationStartState = null;
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

	// Draws the selected shape preview (full image at low opacity, outside page bounds).
	const drawSelectedShapePreview = () => {
		if (!skCanvas || !ck || !lowOpacityPaint) return;

		const selectedIndex = selectedShape.index;
		const hasSelectedShape = isValidShapeIndex(selectedIndex);
		if (!hasSelectedShape) return;

		const shape = mock_data[selectedIndex];
		if (shape.kind !== 'image' || !shape.image) return;

		let center: { x: number; y: number } | null = null;
		if (shape.rotate !== null && shape.rotate !== 0) {
			center = getShapeCenter(shape);
		}

		skCanvas.save();
		if (center) {
			skCanvas.rotate(shape.rotate!, center.x, center.y);
		}

		const src = ck.XYWHRect(0, 0, shape.image.width(), shape.image.height());
		const dst = ck.XYWHRect(shape.x, shape.y, shape.width, shape.height);
		skCanvas.drawImageRect(shape.image, src, dst, lowOpacityPaint);

		skCanvas.restore();
	};

	// Draws all shapes (images and text) within the page clip.
	const drawAllShapes = (viewport: ReturnType<typeof calculateViewport>) => {
		if (!skCanvas || !ck || !paints || !pageBounds || !fontMgr) return;

		// Clip to page bounds
		skCanvas.save();
		skCanvas.clipRect(pageBounds, ck.ClipOp.Intersect, true);

		for (let i = 0; i < mock_data.length; i++) {
			const shape = mock_data[i];

			// Viewport culling - skip if shape is completely outside viewport
			if (!isRectVisible(shape.x, shape.y, shape.width, shape.height, viewport)) {
				continue;
			}

			// Images
			if (shape.kind === 'image') {
				if (!shape.image) continue;

				skCanvas.save();
				if (shape.rotate !== null && shape.rotate !== 0) {
					const center = getShapeCenter(shape);
					skCanvas.rotate(shape.rotate, center.x, center.y);
				}

				drawImageShape(ck, skCanvas, shape, paints.image);
				skCanvas.restore();
			}

			// Text
			if (shape.kind === 'text') {
				skCanvas.save();
				if (shape.rotate !== null && shape.rotate !== 0) {
					const center = getShapeCenter(shape);
					skCanvas.rotate(shape.rotate, center.x, center.y);
				}
				drawTextShape(ck, skCanvas, fontMgr, shape);
				skCanvas.restore();
			}
		}

		// Restore clipping so borders can extend beyond page bounds if needed
		skCanvas.restore();
	};

	// Draws hover and selection borders on top of all shapes.
	const drawShapeOverlays = () => {
		if (!skCanvas || !ck || !paints) return;

		// Hover border (when not selected)
		if (isValidShapeIndex(hoverState.shapeIndex) && hoverState.shapeIndex !== selectedShape.index) {
			const hoveredShape = mock_data[hoverState.shapeIndex];

			skCanvas.save();
			if (hoveredShape.rotate !== null && hoveredShape.rotate !== 0) {
				const center = getShapeCenter(hoveredShape);
				skCanvas.rotate(hoveredShape.rotate, center.x, center.y);
			}

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

			skCanvas.restore();
		}

		// Selected border
		const selectedIndex = selectedShape.index;
		const hasSelectedShape = isValidShapeIndex(selectedIndex);
		if (!hasSelectedShape || selectedShape.rendered === true) return;

		const shape = mock_data[selectedIndex];
		let center: { x: number; y: number } | null = null;

		if (shape.rotate !== null && shape.rotate !== 0) {
			center = getShapeCenter(shape);
		}

		skCanvas.save();
		if (center) {
			skCanvas.rotate(shape.rotate!, center.x, center.y);
		}

		drawSelectedBorder(
			skCanvas,
			ck,
			shape.x,
			shape.y,
			shape.width,
			shape.height,
			paints.tool,
			cameraState.zoom
		);

		skCanvas.restore();
	};

	const drawScene = () => {
		if (!skCanvas || !ck || !paints || !lowOpacityPaint || !pageBounds || !fontMgr) return;

		skCanvas.clear(ck.Color(0, 0, 0, 1.0));
		skCanvas.save();

		// First scale by devicePixelRatio so all world/screen math can stay in CSS pixels
		skCanvas.scale(devicePixelRatioValue, devicePixelRatioValue);

		// Then apply camera pan/zoom in logical (CSS) pixels
		skCanvas.translate(cameraState.panX, cameraState.panY);
		skCanvas.scale(cameraState.zoom, cameraState.zoom);

		// Calculate visible viewport for culling
		const viewport = calculateViewport(canvasWidth, canvasHeight, cameraState);

		// Draw background
		drawBackground(skCanvas, ck, page, paints.background);

		// Validate selected shape before drawing
		validateSelectedShape();

		// Draw selected shape preview (full image with low opacity)
		drawSelectedShapePreview();

		// Draw all shapes inside page bounds
		drawAllShapes(viewport);

		// Draw hover + selection borders on top
		drawShapeOverlays();

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

		const draggedShape = mock_data[hoverState.shapeIndex];
		draggedShape.x += deltaX;
		draggedShape.y += deltaY;

		mouseState.lastMouseX = currentMouseX;
		mouseState.lastMouseY = currentMouseY;

		updateCursor();
		scheduleDraw();
	};

	// ==================== Resize Handlers ====================

	/**
	 * Handles shape rotation
	 */
	const handleShapeRotation = (event: MouseEvent) => {
		// Only rotate if we have rotation state and a valid selected shape
		if (!rotationStartState || !isValidShapeIndex(selectedShape.index)) {
			// Clear rotation state if shape is no longer valid
			if (!isValidShapeIndex(selectedShape.index)) {
				rotationStartState = null;
			}
			return;
		}

		event.preventDefault();

		const { x: currentMouseX, y: currentMouseY } = getMousePosition(event, canvas);
		const currentWorldPos = screenToWorld(currentMouseX, currentMouseY, cameraState);

		// Ensure we're rotating the selected shape
		const shape = mock_data[selectedShape.index];
		if (!shape) {
			rotationStartState = null;
			return;
		}

		const shapeCenter = getShapeCenter(shape);
		shape.rotate = calculateRotation(rotationStartState, currentWorldPos, shapeCenter);

		mouseState.lastMouseX = currentMouseX;
		mouseState.lastMouseY = currentMouseY;

		scheduleDraw();
	};

	/**
	 * Handles shape resizing while maintaining aspect ratio
	 */
	const handleShapeResizing = (event: MouseEvent) => {
		if (!resizeStartState || !resizingCorner || !isValidShapeIndex(selectedShape.index)) {
			return;
		}

		event.preventDefault();

		const { x: currentMouseX, y: currentMouseY } = getMousePosition(event, canvas);
		const currentWorldPos = screenToWorld(currentMouseX, currentMouseY, cameraState);
		const shape = mock_data[selectedShape.index];
		const rotation = shape.rotate ?? null;

		// Calculate new dimensions and position
		const { x, y, width, height } = calculateResize(
			resizeStartState,
			resizingCorner,
			currentWorldPos,
			rotation
		);

		// Update shape
		shape.x = x;
		shape.y = y;
		shape.width = width;
		shape.height = height;

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

			// Detect what the mouse is hovering over
			const newHoverState = detectHover(
				worldPos,
				mock_data,
				selectedShape.index,
				cameraState.zoom,
				isValidShapeIndex
			);

			// Update hover state if changed
			const needsUpdate = updateHoverState(hoverState, newHoverState);

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

		// Handle shape rotation (highest priority)
		if (rotationStartState !== null && mouseState.isMouseDown) {
			handleShapeRotation(event);
			return;
		}

		// Handle shape resizing (priority over dragging)
		if (resizingCorner !== null && mouseState.isMouseDown) {
			handleShapeResizing(event);
			return;
		}

		// Handle shape dragging
		if (mouseState.isDragging && isValidShapeIndex(hoverState.shapeIndex)) {
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

		// Check if clicking on rotate circle (highest priority)
		if (hoverState.isHoveringRotateCircle && isValidShapeIndex(selectedShape.index)) {
			const shape = mock_data[selectedShape.index];
			const worldPos = screenToWorld(x, y, cameraState);
			rotationStartState = initializeRotation(shape, worldPos);

			mouseState.isMouseDown = true;
			mouseState.lastMouseX = x;
			mouseState.lastMouseY = y;
			updateCursor();
			return;
		}

		// Check if clicking on a resize corner
		if (hoverState.resizeCorner !== null && isValidShapeIndex(selectedShape.index)) {
			const shape = mock_data[selectedShape.index];
			const worldPos = screenToWorld(x, y, cameraState);

			resizingCorner = hoverState.resizeCorner;
			resizeStartState = initializeResize(shape, worldPos);

			mouseState.isMouseDown = true;
			mouseState.lastMouseX = x;
			mouseState.lastMouseY = y;
			updateCursor();
			return;
		}

		// Handle shape selection/dragging
		// Directly detect shape at click point for immediate selection
		const worldPos = screenToWorld(x, y, cameraState);
		const clickedShapeIndex = findShapeAtPoint(worldPos, mock_data);

		if (isValidShapeIndex(clickedShapeIndex)) {
			mouseState.isDragging = true;
			initializeMouseDrag(x, y);
			// Clear resize corner hover when selection changes
			if (selectedShape.index !== INVALID_INDEX && selectedShape.index !== clickedShapeIndex) {
				resetHoverState(hoverState);
			}
			selectedShape.index = clickedShapeIndex;
			selectedShape.rendered = false;
		} else {
			clearSelection();
		}

		scheduleDraw();
	};

	/**
	 * Handles mouse up events
	 */
	const handleMouseUp = (event: MouseEvent) => {
		// Clear rotation state
		if (rotationStartState !== null) {
			rotationStartState = null;
		}
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
			rotationStartState = null;
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

		// Recompute DPR on resize in case the window moved between screens
		devicePixelRatioValue = window.devicePixelRatio || 1;

		canvas.style.width = `${canvasWidth}px`;
		canvas.style.height = `${canvasHeight}px`;
		canvas.width = canvasWidth * devicePixelRatioValue;
		canvas.height = canvasHeight * devicePixelRatioValue;

		// Inform CanvasKit surface about the new backing-store size (if supported)
		const maybeSurface: any = surface;
		if (maybeSurface && typeof maybeSurface.resize === 'function') {
			maybeSurface.resize(canvasWidth * devicePixelRatioValue, canvasHeight * devicePixelRatioValue);
		}

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
	<div class="w-[260px] p-4 space-y-2 text-sm bg-zinc-900 text-zinc-100">
		<div class="font-semibold">WebSocket debug</div>
		<button
			class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs"
			on:click={sendTestMessage}
		>
			Send test message
		</button>

		<div class="mt-2 max-h-64 overflow-auto rounded bg-black/40 p-2 text-[11px] leading-snug">
			{#if wsMessages.length === 0}
				<div class="text-zinc-500">No messages yet</div>
			{:else}
				{#each wsMessages as m, i (i)}
					<div>{m}</div>
				{/each}
			{/if}
		</div>
	</div>

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
