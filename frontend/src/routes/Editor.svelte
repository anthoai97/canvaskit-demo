<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import CanvasKitInit from 'canvaskit-wasm';
	import type { Canvas, CanvasKit, Surface } from 'canvaskit-wasm';
	import type { EditorPage } from '$lib/types/page';
	import { rgbaToCanvasKitColor } from '$lib/types/color';
	import { DEFAULT_CAMERA_ZOOM, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM } from '$lib/contants/const';
	import type { CameraState } from '$lib/types/camera';
	import type { MouseState } from '$lib/types/mouse';

	let editor: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ck: CanvasKit;

	let canvasCursor = 'default';

	let canvasWidth: number;
	let canvasHeight: number;

	let cleanupEvents: (() => void) | null = null;
	let animationFrameId: number | null = null;

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

	onMount(async () => {
		canvasWidth = editor.clientWidth;
		canvasHeight = editor.clientHeight;
		canvas.width = editor.clientWidth;
		canvas.height = editor.clientHeight;

		// Wait for reactive statements to update
		await tick();

		cameraState.panX = centerX;
		cameraState.panY = centerY;

		ck = await CanvasKitInit({
			locateFile: (file) => `node_modules/canvaskit-wasm/bin/${file}`
		});

		surface = ck.MakeWebGLCanvasSurface(canvas);
		skCanvas = surface?.getCanvas() ?? null;

		cleanupEvents = bindEvents();
		drawScene();
	});

	onDestroy(() => {
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
		}
		if (cleanupEvents) {
			cleanupEvents();
		}
	});

	// const scheduleDraw = () => {
	// 	// Cancel any pending animation frame
	// 	if (animationFrameId !== null) {
	// 		cancelAnimationFrame(animationFrameId);
	// 	}
	// 	// Schedule draw for next frame
	// 	animationFrameId = requestAnimationFrame(() => {
	// 		animationFrameId = null;
	// 		drawScene();
	// 	});
	// };

	const handlePanning = (event: MouseEvent) => {
		// Get current mouse position relative to canvas
		const rect = canvas.getBoundingClientRect();
		const currentMouseX = event.clientX - rect.left;
		const currentMouseY = event.clientY - rect.top;

		// Calculate the delta (how much the mouse moved)
		const deltaX = currentMouseX - mouseState.lastMouseX;
		const deltaY = currentMouseY - mouseState.lastMouseY;

		// Update camera position by adding the delta
		cameraState.panX += deltaX;
		cameraState.panY += deltaY;

		// Update last mouse position for next move event
		mouseState.lastMouseX = currentMouseX;
		mouseState.lastMouseY = currentMouseY;

		// Schedule redraw using requestAnimationFrame for smooth rendering
		// scheduleDraw();
		drawScene();
	};

	// const drawScene = () => {
	// 	const surface = ck.MakeWebGLCanvasSurface(canvas);
	// 	const skCanvas = surface?.getCanvas();

	// 	skCanvas?.clear(ck.Color(0, 0, 0, 1.0));

	// 	const draw = (canvas: Canvas) => {
	// 		canvas.save();

	// 		canvas.translate(cameraState.panX, cameraState.panY);
	// 		canvas.scale(cameraState.zoom, cameraState.zoom);
	// 		const paint = new ck.Paint();
	// 		paint.setColor(rgbaToCanvasKitColor(ck, page.backgroundColor));
	// 		const bg_x = -page.width / 2;
	// 		const bg_y = -page.height / 2;
	// 		const bg_width = page.width;
	// 		const bg_height = page.height;
	// 		canvas.drawRect(ck.XYWHRect(bg_x, bg_y, bg_width, bg_height), paint);

	// 		// Draw other elements in world space
	// 		paint.setColor(ck.Color(0, 0, 255, 1.0));
	// 		canvas.drawCircle(100, 100, 50, paint);

	// 		canvas.restore();
	// 	};

	// 	surface?.drawOnce((canvas: Canvas) => draw(canvas));
	// };

	const drawScene = () => {
		skCanvas?.clear(rgbaToCanvasKitColor(ck, { r: 0, g: 0, b: 0, a: 1.0 })); // black background

		// Apply translation for panning
		skCanvas?.save();
		skCanvas?.translate(cameraState.panX, cameraState.panY);
		const paint = new ck.Paint();
		paint.setColor(ck.Color(0, 0, 255, 1.0));
		// Draw a few shapes
		skCanvas?.drawCircle(100, 100, 40, paint);
		skCanvas?.drawRect(ck.XYWHRect(200, 200, 80, 80), paint);

		skCanvas?.restore();
		surface?.flush();
	};

	const handleWheel = (event: WheelEvent) => {
		event.preventDefault();

		// Get mouse position relative to canvas
		const rect = canvas.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;

		// Calculate zoom factor (zoom in/out)
		const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
		const newZoom = Math.max(
			MIN_CAMERA_ZOOM,
			Math.min(MAX_CAMERA_ZOOM, cameraState.zoom * zoomFactor)
		);

		// Zoom towards mouse position
		// Adjust pan to keep the point under mouse fixed
		const zoomChange = newZoom / cameraState.zoom;
		cameraState.panX = mouseX - (mouseX - cameraState.panX) * zoomChange;
		cameraState.panY = mouseY - (mouseY - cameraState.panY) * zoomChange;

		cameraState.zoom = newZoom;
		// scheduleDraw();
		drawScene();
	};

	const handleMouseMove = (event: MouseEvent) => {
		if (cameraState.isPanning && mouseState.isMouseDown) {
			event.preventDefault();
			canvasCursor = 'grabbing';
			handlePanning(event);
		}
	};

	const handleMouseDown = (event: MouseEvent) => {
		if (cameraState.isPanning) {
			event.preventDefault();
			mouseState.isMouseDown = true;

			// Store the initial mouse position when starting to drag
			const rect = canvas.getBoundingClientRect();
			mouseState.lastMouseX = event.clientX - rect.left;
			mouseState.lastMouseY = event.clientY - rect.top;

			canvasCursor = 'grabbing';
		}
	};

	const handleMouseUp = (event: MouseEvent) => {
		if (mouseState.isMouseDown) {
			event.preventDefault();
			mouseState.isMouseDown = false;
			if (cameraState.isPanning) {
				canvasCursor = 'grab';
			}
		}
	};

	const handleMouseLeave = (event: MouseEvent) => {
		// Stop dragging if mouse leaves canvas
		if (mouseState.isMouseDown) {
			mouseState.isMouseDown = false;
			if (cameraState.isPanning) {
				canvasCursor = 'grab';
			}
		}
	};

	const handleKeyDown = (event: KeyboardEvent) => {
		// Only handle if not typing in an input field
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
			return;
		}

		if ((event.code === 'Space' || event.key === ' ') && !cameraState.isPanning) {
			event.preventDefault();
			cameraState.isPanning = true;
			canvasCursor = 'grab';
		}
	};

	const handleKeyUp = (event: KeyboardEvent) => {
		if (event.code === 'Space' || event.key === ' ') {
			event.preventDefault();
			cameraState.isPanning = false;
			canvasCursor = 'default';
		}
	};

	const handleResize = () => {
		canvas.width = editor.clientWidth;
		canvas.height = editor.clientHeight;

		// Update the reactive variables so centerX and centerY recalculate
		canvasWidth = editor.clientWidth;
		canvasHeight = editor.clientHeight;

		// Re-center the page after resize
		// Wait for reactive update, then recalculate pan
		drawScene();
	};

	const bindEvents = () => {
		window.addEventListener('resize', handleResize);

		// Zoom with mouse wheel
		canvas.addEventListener('wheel', handleWheel, { passive: false });
		canvas.addEventListener('mousemove', handleMouseMove);
		canvas.addEventListener('mousedown', handleMouseDown);
		canvas.addEventListener('mouseup', handleMouseUp);
		canvas.addEventListener('mouseleave', handleMouseLeave);

		// Also listen for mouseup on window in case mouse is released outside canvas
		window.addEventListener('mouseup', handleMouseUp);

		// Pan with keyboard - attach to window so it works globally
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);

		// Return cleanup function
		return () => {
			window.removeEventListener('resize', handleResize);
			canvas.removeEventListener('wheel', handleWheel);
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
			canvas.removeEventListener('mousemove', handleMouseMove);
			canvas.removeEventListener('mousedown', handleMouseDown);
			canvas.removeEventListener('mouseup', handleMouseUp);
			canvas.removeEventListener('mouseleave', handleMouseLeave);
			window.removeEventListener('mouseup', handleMouseUp);
		};
	};
</script>

<div class="editor w-full h-screen overflow-hidden cursor-{canvasCursor}" bind:this={editor}>
	<canvas id="canvas" bind:this={canvas}></canvas>
</div>

<style>
</style>
