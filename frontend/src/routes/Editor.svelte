<script lang="ts">
	import { createWebGLSurface, initCanvasKit } from '$lib/canvakit/canvas';
	import { createPaints } from '$lib/canvakit/drawing';
	import { loadFonts, preloadFonts } from '$lib/canvakit/font';
	import { DEFAULT_CAMERA_ZOOM, INVALID_INDEX } from '$lib/contants/const';
	import { StableWebSocket } from '$lib/ws';
	import { resetSelectedShape } from '$lib/types/editor';
	import { resetHoverState } from '$lib/utils/hover-state';
	import type { EditorDocument, EditorPage } from '$lib/types/page';
	import type { Shape } from '$lib/types/shape';
	import type { Canvas, CanvasKit, Paint, Surface, FontMgr } from 'canvaskit-wasm';
	import { onDestroy, onMount, tick } from 'svelte';
	import { loadDocument, createDefaultDocument, loadPageImages } from '$lib/editor/document-loader';
	import { drawScene as renderScene, type RenderContext } from '$lib/editor/scene-renderer';
	import { drawLoadingScreen, type LoadingRenderContext } from '$lib/editor/loading-renderer';
	import {
		handleWheel,
		handleMouseMove,
		handleMouseDown,
		handleMouseUp,
		handleMouseLeave,
		handleKeyDown,
		handleKeyUp,
		updateCursor,
		type EventHandlerContext
	} from '$lib/editor/event-handlers';

	let editor: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ck: CanvasKit;

	let canvasWidth: number;
	let canvasHeight: number;
	let devicePixelRatioValue = 1;

	// UI state
	let canvasCursor = 'default';
	let hoverState = { shapeIndex: INVALID_INDEX, resizeCorner: null, isHoveringRotateCircle: false };
	let selectedShape = { index: INVALID_INDEX, rendered: false };
	let resizingCorner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | null = null;
	let resizeStartState: any = null;
	let rotationStartState: any = null;

	// Paint objects (reused for performance)
	let paints: ReturnType<typeof createPaints> | null = null;
	let lowOpacityPaint: Paint | null = null;
	let pageBounds: Float32Array | null = null;

	// Performance optimization: requestAnimationFrame throttling
	let animationFrameId: number | null = null;
	let needsRedraw = false;
	let hoverCheckTimeout: { value: number | null } = { value: null };

	// Auto-play mode: automatically advance to next page after animations complete
	let isAutoPlaying = false;
	let wasAnimating = false;

	// Loading state
	let isLoading = true;

	// Event handlers cleanup
	let cleanupEvents: (() => void) | null = null;

	$: centerX = canvasWidth ? canvasWidth / 2 : 0;
	$: centerY = canvasHeight ? canvasHeight / 2 : 0;

	let surface: Surface | null = null;
	let skCanvas: Canvas | null = null;
	let fontMgr: FontMgr | null = null;

	// Multi-page support
	let document: EditorDocument | null = null;
	let currentPageIndex = 0;
	let page: EditorPage | null = null;
	let shapes: Shape[] = [];

	let cameraState = {
		zoom: DEFAULT_CAMERA_ZOOM,
		panX: 0,
		panY: 0,
		isPanning: false
	};

	let mouseState = {
		isMouseDown: false,
		isDragging: false,
		lastMouseX: 0,
		lastMouseY: 0
	};

	/**
	 * Loads and switches to a specific page
	 */
	const loadPage = async (pageIndex: number) => {
		if (!document || !ck || pageIndex < 0 || pageIndex >= document.pages.length) return;

		const newPage = document.pages[pageIndex];
		if (!newPage) return;

		// Load images for the new page if needed
		const loadedShapes = await loadPageImages(ck, newPage);
		newPage.shapes = loadedShapes;

		page = newPage;
		shapes = loadedShapes;

		// Update paints and bounds for new page
		paints = createPaints(ck, page);
		pageBounds = ck.XYWHRect(-page.width / 2, -page.height / 2, page.width, page.height);

		// Reset camera to center
		cameraState.panX = centerX;
		cameraState.panY = centerY;
		clearSelection();
		
		// Check if new page has animations (for auto-play mode)
		if (isAutoPlaying) {
			const hasAnimations = loadedShapes.some(
				(shape) => shape.animation && shape.animation.type !== 'none'
			);
			if (hasAnimations) {
				// Start animations on the new page
				const now = performance.now();
				for (const shape of loadedShapes) {
					if (shape.animation && shape.animation.type !== 'none') {
						shape.animationStart = now;
					}
				}
				wasAnimating = true;
			} else {
				// No animations on this page, advance to next page immediately
				wasAnimating = false;
				// Use setTimeout to avoid calling switchToPage during loadPage
				setTimeout(() => {
					if (document && document.pages.length > 0) {
						const nextPageIndex = (currentPageIndex + 1) % document.pages.length;
						switchToPage(nextPageIndex);
					}
				}, 0);
			}
		} else {
			wasAnimating = false;
		}
		
		scheduleDraw();
	};

	// Track if we're initialized to prevent reactive statement from running too early
	let isInitialized = false;

	// Reactive: Update current page when index changes (only after initialization)
	$: if (
		isInitialized &&
		document &&
		document.pages.length > 0 &&
		ck &&
		currentPageIndex >= 0 &&
		currentPageIndex < document.pages.length
	) {
		loadPage(currentPageIndex);
	}

	/**
	 * Toggles auto-play mode: starts animations and auto-advance if stopped, stops if playing
	 */
	const toggleAutoPlay = () => {
		if (isAutoPlaying) {
			// Stop auto-play
			isAutoPlaying = false;
			wasAnimating = false;
		} else {
			// Start auto-play
			const now = performance.now();
			for (const shape of shapes) {
				if (shape.animation && shape.animation.type !== 'none') {
					// Reset animation start time to replay the animation
					shape.animationStart = now;
				}
			}
			isAutoPlaying = true;
			wasAnimating = true; // Assume we're starting animations
			scheduleDraw();
		}
	};

	// ==================== Page Management ====================

	/**
	 * Switches to a specific page by index
	 */
	const switchToPage = (index: number) => {
		if (document && index >= 0 && index < document.pages.length) {
			currentPageIndex = index;
			// loadPage will be called by the reactive statement
		}
	};

	// ==================== WebSocket state ====================
	let ws: StableWebSocket | null = null;
	let wsMessages: string[] = [];

	const setupWebSocket = () => {
		ws = new StableWebSocket();

		ws.addMessageListener((event) => {
			wsMessages = [...wsMessages.slice(-19), event.data];
		});
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

		

		surface = createWebGLSurface(ck, canvas);
		skCanvas = surface?.getCanvas() ?? null;

		// Start loading animation
		isLoading = true;
		startLoadingAnimation();

		// Start loading font data and build a FontMgr for Paragraph / text rendering
		preloadFonts();
		fontMgr = await loadFonts(ck);

		// Load initial document from backend API (or static test JSON for now)
		// TODO: switch to a real backend endpoint (e.g. /api/document) later
		document = await loadDocument('/test_data/beautiful_mock_data.json');

		// Ensure document is loaded before proceeding
		if (!document || document.pages.length === 0) {
			console.error('Document data not loaded');
			document = createDefaultDocument();
			currentPageIndex = 0;
		}

		// Stop loading animation
		isLoading = false;

		// Wait for reactive statement to set page
		await tick();

		// Load the first page (reactive statement will handle it, but we ensure it happens)
		if (document && document.pages.length > 0) {
			await loadPage(0);
		}

		if (!page) {
			console.error('Page not available after document load');
			return;
		}

		// Initialize cached paint for performance (lowOpacityPaint is created in loadPage via createPaints)
		lowOpacityPaint = new ck.Paint();
		lowOpacityPaint.setAlphaf(0.5); // 50% opacity

		// Mark as initialized so reactive statements can run
		isInitialized = true;

		cleanupEvents = bindEvents();
		drawScene();

		// Setup WebSocket connection for collaborative messaging / presence.
		setupWebSocket();
	});

	onDestroy(() => {
		cleanupEvents?.();
		ws?.close();
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
		}
		if (loadingAnimationId !== null) {
			cancelAnimationFrame(loadingAnimationId);
		}

		if (hoverCheckTimeout.value !== null) {
			clearTimeout(hoverCheckTimeout.value);
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
	const updateCursorStyle = () => {
		const context = createEventHandlerContext();
		updateCursor(context);
	};

	/**
	 * Creates event handler context
	 */
	const createEventHandlerContext = (): EventHandlerContext => {
		return {
			canvas,
			editor,
			shapes,
			cameraState,
			mouseState,
			hoverState,
			selectedShape,
			resizingCorner,
			resizeStartState,
			rotationStartState,
			isValidShapeIndex,
			onCursorUpdate: (cursor: string) => {
				canvasCursor = cursor;
			},
			onScheduleDraw: scheduleDraw,
			onPanning: (deltaX: number, deltaY: number) => {
				cameraState.panX += deltaX;
				cameraState.panY += deltaY;
			},
			onShapeDrag: (shapeIndex: number, deltaX: number, deltaY: number) => {
				const draggedShape = shapes[shapeIndex];
				draggedShape.x += deltaX;
				draggedShape.y += deltaY;
			},
			onShapeResize: (shapeIndex: number, x: number, y: number, width: number, height: number) => {
				const shape = shapes[shapeIndex];
				shape.x = x;
				shape.y = y;
				shape.width = width;
				shape.height = height;
			},
			onShapeRotate: (shapeIndex: number, rotation: number) => {
				const shape = shapes[shapeIndex];
				shape.rotate = rotation;
			},
			onSelectionChange: (shapeIndex: number) => {
				selectedShape.index = shapeIndex;
				selectedShape.rendered = false;
			},
			onSelectionClear: clearSelection
		};
	};

	/**
	 * Clears hover state
	 */
	const clearHoverState = () => {
		resetHoverState(hoverState);
		updateCursorStyle();
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

	/**
	 * Checks if a shape index is valid
	 */
	const isValidShapeIndex = (index: number): boolean => {
		return index !== INVALID_INDEX && index < shapes.length && shapes[index] !== undefined;
	};

	/**
	 * Validates and cleans up selected shape index
	 */
	const validateSelectedShape = () => {
		if (
			selectedShape.index !== INVALID_INDEX &&
			(selectedShape.index >= shapes.length || !shapes[selectedShape.index])
		) {
			resetSelectedShape(selectedShape);
			resetHoverState(hoverState);
		}
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

	// ==================== Rendering ====================

	/**
	 * Creates render context for scene rendering
	 */
	const createRenderContext = (): RenderContext => {
		if (!skCanvas || !ck || !paints || !lowOpacityPaint || !pageBounds || !fontMgr || !page) {
			throw new Error('Render context not ready');
		}

		return {
			skCanvas,
			ck,
			paints,
			lowOpacityPaint,
			pageBounds,
			fontMgr,
			page,
			shapes,
			selectedShape,
			hoverState,
			cameraState,
			canvasWidth,
			canvasHeight,
			devicePixelRatio: devicePixelRatioValue,
			surface,
			isValidShapeIndex
		};
	};

	/**
	 * Starts the loading animation loop
	 */
	let loadingAnimationId: number | null = null;
	const startLoadingAnimation = () => {
		if (loadingAnimationId !== null) return;

		const animate = () => {
			if (!isLoading || !skCanvas || !ck || !surface) {
				loadingAnimationId = null;
				return;
			}

			drawLoadingScreen(
				{
					skCanvas,
					ck,
					canvasWidth,
					canvasHeight,
					devicePixelRatio: devicePixelRatioValue,
					surface
				},
				performance.now()
			);

			loadingAnimationId = requestAnimationFrame(animate);
		};

		loadingAnimationId = requestAnimationFrame(animate);
	};

	const drawScene = () => {
		// Show loading screen if still loading
		if (isLoading) {
			if (skCanvas && ck && surface) {
				drawLoadingScreen(
					{
						skCanvas,
						ck,
						canvasWidth,
						canvasHeight,
						devicePixelRatio: devicePixelRatioValue,
						surface
					},
					performance.now()
				);
			}
			return;
		}

		if (!skCanvas || !ck || !paints || !lowOpacityPaint || !pageBounds || !fontMgr || !page) return;

		// Validate selected shape before drawing
		validateSelectedShape();

		try {
			const renderContext = createRenderContext();
			const isAnimating = renderScene(renderContext, scheduleDraw);

			// Check if animations just completed (was animating, now not animating)
			if (isAutoPlaying && wasAnimating && !isAnimating) {
				// Animations just completed, advance to next page
				if (document && document.pages.length > 0) {
					const nextPageIndex = (currentPageIndex + 1) % document.pages.length;
					switchToPage(nextPageIndex);
					// loadPage will handle starting animations on the new page
				}
			} else {
				wasAnimating = isAnimating;
			}
		} catch (error) {
			console.error('Error rendering scene:', error);
		}
	};

	// ==================== Event Handlers ====================

	/**
	 * Wraps event handlers to use extracted modules
	 */
	const handleWheelEvent = (event: WheelEvent) => {
		handleWheel(event, createEventHandlerContext());
	};

	const handleMouseMoveEvent = (event: MouseEvent) => {
		handleMouseMove(event, createEventHandlerContext(), hoverCheckTimeout);
	};

	const handleMouseDownEvent = (event: MouseEvent) => {
		handleMouseDown(event, createEventHandlerContext());
	};

	const handleMouseUpEvent = (event: MouseEvent) => {
		handleMouseUp(event, createEventHandlerContext());
	};

	const handleMouseLeaveEvent = (event: MouseEvent) => {
		handleMouseLeave(event, createEventHandlerContext(), hoverCheckTimeout);
	};

	const handleKeyDownEvent = (event: KeyboardEvent) => {
		handleKeyDown(event, createEventHandlerContext());
	};

	const handleKeyUpEvent = (event: KeyboardEvent) => {
		handleKeyUp(event, createEventHandlerContext());
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
			maybeSurface.resize(
				canvasWidth * devicePixelRatioValue,
				canvasHeight * devicePixelRatioValue
			);
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
		window.addEventListener('mouseup', handleMouseUpEvent);
		window.addEventListener('keydown', handleKeyDownEvent);
		window.addEventListener('keyup', handleKeyUpEvent);

		// Canvas events
		canvas.addEventListener('wheel', handleWheelEvent, { passive: false });
		canvas.addEventListener('mousemove', handleMouseMoveEvent);
		canvas.addEventListener('mousedown', handleMouseDownEvent);
		canvas.addEventListener('mouseup', handleMouseUpEvent);
		canvas.addEventListener('mouseleave', handleMouseLeaveEvent);

		// Return cleanup function
		return () => {
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('mouseup', handleMouseUpEvent);
			window.removeEventListener('keydown', handleKeyDownEvent);
			window.removeEventListener('keyup', handleKeyUpEvent);
			canvas.removeEventListener('wheel', handleWheelEvent);
			canvas.removeEventListener('mousemove', handleMouseMoveEvent);
			canvas.removeEventListener('mousedown', handleMouseDownEvent);
			canvas.removeEventListener('mouseup', handleMouseUpEvent);
			canvas.removeEventListener('mouseleave', handleMouseLeaveEvent);
		};
	};
</script>

<div class="flex h-screen">
	<div class="w-[280px] flex flex-col justify-between overflow-hidden px-5 py-5">
		<!-- WebSocket Debug -->
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<h3 class="text-xs block font-medium text-zinc-400 uppercase">WebSocket</h3>
				{#if wsMessages.length > 0}
					<span
						class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-400 font-medium"
					>
						{wsMessages.length}
					</span>
				{/if}
			</div>

			<!-- Messages Display -->
			<div class="space-y-1">
				<div class="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Messages</div>
				<div
					class="max-h-64 overflow-y-auto rounded-lg bg-zinc-950/50 border border-zinc-800 p-3 space-y-1.5"
				>
					{#if wsMessages.length === 0}
						<div class="text-xs text-zinc-600 italic text-center py-4">No messages yet</div>
					{:else}
						{#each wsMessages as m, i (i)}
							<div
								class="text-[11px] font-mono text-zinc-300 bg-zinc-900/50 rounded px-2 py-1.5 border-l-2 border-zinc-700 hover:border-zinc-600 transition-colors"
							>
								<span class="text-zinc-500 text-[10px] mr-2">#{i + 1}</span>
								<span class="break-words">{m}</span>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>
		<!-- Export Controls -->
		<div class="mb-4">
			<h3 class="block text-xs font-medium text-zinc-400 uppercase mb-2">Animation</h3>
			<button
				class="w-full px-3 py-2 rounded-md {isAutoPlaying
					? 'bg-red-600 hover:bg-red-500 active:bg-red-700'
					: 'bg-sky-600 hover:bg-sky-500 active:bg-sky-700'} text-xs font-medium text-white transition-colors duration-150 shadow-sm hover:shadow"
				on:click={toggleAutoPlay}
			>
				{isAutoPlaying ? 'Stop Auto-Play' : 'Play All Animations'}
			</button>
		</div>
	</div>

	<div class="flex flex-col flex-1 overflow-hidden">
		<!-- Main Canvas Area -->
		<div
			class="editor flex-1 overflow-hidden bg-zinc-100"
			style="cursor: {canvasCursor}"
			bind:this={editor}
		>
			<canvas id="canvas" bind:this={canvas}></canvas>
		</div>

		<!-- Timeline/Page View -->
		<div class="h-[120px] bg-white border-t border-zinc-200 flex flex-col">
			<!-- Timeline Header with Playhead -->
			<div class="relative flex-1 flex items-center px-4">
				<!-- Play/Stop Toggle Button -->
				<button
					class="w-10 h-10 rounded bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center mr-4 transition-colors"
					on:click={toggleAutoPlay}
					title={isAutoPlaying ? 'Stop auto-play' : 'Play animations'}
				>
					{#if isAutoPlaying}
						<!-- Stop Icon -->
						<svg class="w-5 h-5 text-zinc-700" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
								clip-rule="evenodd"
							/>
						</svg>
					{:else}
						<!-- Play Icon -->
						<svg class="w-5 h-5 text-zinc-700 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
								clip-rule="evenodd"
							/>
						</svg>
					{/if}
				</button>

				<!-- Page Thumbnails -->
				<div class="flex-1 flex items-center gap-3 overflow-x-auto p-2">
					{#if document}
						{#each document.pages as p, i (p.id)}
							<button
								class="relative w-32 h-24 rounded border-2 transition-all {currentPageIndex === i
									? 'border-pink-500 scale-105'
									: 'border-zinc-300 hover:border-zinc-400'}"
								on:click={() => switchToPage(i)}
								on:keydown={(e) => e.key === 'Enter' && switchToPage(i)}
							>
								<!-- Page Thumbnail Preview -->
								<div
									class="w-full h-full rounded bg-white flex items-center justify-center text-xs text-zinc-400"
									style="background-color: rgb({p.background.color.r}, {p.background.color.g}, {p
										.background.color.b})"
								>
									{#if p.shapes.length === 0}
										<span>Page {i + 1}</span>
									{:else}
										<span class="text-zinc-600">{p.shapes.length} shapes</span>
									{/if}
								</div>
							</button>
						{/each}
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
</style>
