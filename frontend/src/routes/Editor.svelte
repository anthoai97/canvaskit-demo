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
	import { captureThumbnail } from '$lib/editor/thumbnail-capture';
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

	// ==================== DOM References ====================
	let editor: HTMLDivElement;
	let canvas: HTMLCanvasElement;

	// ==================== CanvasKit State ====================
	let ck: CanvasKit;
	let surface: Surface | null = null;
	let skCanvas: Canvas | null = null;
	let fontMgr: FontMgr | null = null;

	// ==================== Canvas Dimensions ====================
	let canvasWidth: number;
	let canvasHeight: number;
	let devicePixelRatioValue = 1;

	$: centerX = canvasWidth ? canvasWidth / 2 : 0;
	$: centerY = canvasHeight ? canvasHeight / 2 : 0;

	// ==================== Document & Page State ====================
	let document: EditorDocument | null = null;
	let currentPageIndex = 0;
	let page: EditorPage | null = null;
	let shapes: Shape[] = [];

	// ==================== UI State ====================
	let canvasCursor = 'default';
	let hoverState = { shapeIndex: INVALID_INDEX, resizeCorner: null, isHoveringRotateCircle: false };
	let selectedShape = { index: INVALID_INDEX, rendered: false };
	let resizingCorner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | null = null;
	let resizeStartState: any = null;
	let rotationStartState: any = null;

	// ==================== Camera & Mouse State ====================
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

	// ==================== Rendering Resources ====================
	let paints: ReturnType<typeof createPaints> | null = null;
	let lowOpacityPaint: Paint | null = null;
	let pageBounds: Float32Array | null = null;

	// ==================== Animation State ====================
	let animationFrameId: number | null = null;
	let loadingAnimationId: number | null = null;
	let needsRedraw = false;
	let hoverCheckTimeout: { value: number | null } = { value: null };
	let isAutoPlaying = false;
	let wasAnimating = false;

	// ==================== Component State ====================
	let isLoading = true;
	let isInitialized = false;
	let cleanupEvents: (() => void) | null = null;
	let shapesHash: string = ''; // Track shapes state for thumbnail capture
	let isCapturingThumbnail = false;
	let thumbnailCaptureTimeout: number | null = null;
	let initialThumbnailTriggered = false; // Track if initial capture has been triggered for current page
	let backgroundThumbnailQueue: number[] = []; // Queue of page indices to capture thumbnails for
	let isProcessingBackgroundThumbnails = false;
	let backgroundThumbnailsStarted = false; // Track if background processing has been started

	// ==================== WebSocket State ====================
	let ws: StableWebSocket | null = null;
	let wsMessages: string[] = [];

	// ==================== Canvas Utilities ====================

	/**
	 * Updates canvas dimensions based on container size and device pixel ratio
	 */
	const updateCanvasDimensions = () => {
		canvasWidth = editor.clientWidth;
		canvasHeight = editor.clientHeight;
		devicePixelRatioValue = window.devicePixelRatio || 1;

		canvas.style.width = `${canvasWidth}px`;
		canvas.style.height = `${canvasHeight}px`;
		canvas.width = canvasWidth * devicePixelRatioValue;
		canvas.height = canvasHeight * devicePixelRatioValue;

		// Inform CanvasKit surface about the new backing-store size (if supported)
		if (surface && typeof (surface as any).resize === 'function') {
			(surface as any).resize(
				canvasWidth * devicePixelRatioValue,
				canvasHeight * devicePixelRatioValue
			);
		}
	};

	/**
	 * Creates a loading render context
	 */
	const createLoadingContext = (): LoadingRenderContext => {
		return {
			skCanvas: skCanvas!,
			ck: ck!,
			canvasWidth,
			canvasHeight,
			devicePixelRatio: devicePixelRatioValue,
			surface: surface!
		};
	};

	// ==================== Animation Helpers ====================

	/**
	 * Checks if shapes have animations
	 */
	const hasAnimations = (shapesToCheck: Shape[]): boolean => {
		return shapesToCheck.some((shape) => shape.animation && shape.animation.type !== 'none');
	};

	/**
	 * Starts animations for shapes
	 */
	const startShapeAnimations = (shapesToAnimate: Shape[], startTime: number = performance.now()) => {
		for (const shape of shapesToAnimate) {
			if (shape.animation && shape.animation.type !== 'none') {
				shape.animationStart = startTime;
			}
		}
	};

	// ==================== Page Management ====================

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

		// Reset initial capture flag for new page
		initialThumbnailTriggered = false;

		// Reset shapes hash to trigger reactive statement
		shapesHash = '';

		// Reset camera to center
		cameraState.panX = centerX;
		cameraState.panY = centerY;
		
		// Clear selection
		resetSelectedShape(selectedShape);
		resetHoverState(hoverState);

		// Handle animations for auto-play mode
		if (isAutoPlaying) {
			if (hasAnimations(loadedShapes)) {
				startShapeAnimations(loadedShapes);
				wasAnimating = true;
			} else {
				wasAnimating = false;
				// No animations on this page, advance to next page immediately
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

	/**
	 * Switches to a specific page by index
	 */
	const switchToPage = (index: number) => {
		if (document && index >= 0 && index < document.pages.length) {
			currentPageIndex = index;
			// loadPage will be called by the reactive statement
		}
	};

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
		
		
		// Restore original toggle logic
		if (isAutoPlaying) {
			// Stop auto-play
			isAutoPlaying = false;
			wasAnimating = false;
		} else {
			// Start auto-play
			startShapeAnimations(shapes);
			isAutoPlaying = true;
			wasAnimating = true; // Assume we're starting animations
			scheduleDraw();
		}
	};

	// ==================== WebSocket ====================

	const setupWebSocket = () => {
		ws = new StableWebSocket();

		ws.addMessageListener((event) => {
			wsMessages = [...wsMessages.slice(-19), event.data];
		});
	};

	// ==================== Initialization ====================

	/**
	 * Initializes the CanvasKit context and canvas
	 */
	const initializeCanvas = async () => {
		ck = await initCanvasKit();
		surface = createWebGLSurface(ck, canvas);
		skCanvas = surface?.getCanvas() ?? null;
	};

	/**
	 * Initializes fonts for text rendering
	 */
	const initializeFonts = async () => {
		preloadFonts();
		fontMgr = await loadFonts(ck);
	};

	/**
	 * Loads the initial document
	 */
	const initializeDocument = async () => {
		document = await loadDocument('/test_data/beautiful_mock_data.json');

		if (!document || document.pages.length === 0) {
			console.error('Document data not loaded');
			document = createDefaultDocument();
			currentPageIndex = 0;
		}
		
		// Reset background thumbnail processing flag when new document loads
		backgroundThumbnailsStarted = false;
	};

	onMount(async () => {
		updateCanvasDimensions();
		await tick();

		cameraState.panX = centerX;
		cameraState.panY = centerY;

		await initializeCanvas();

		// Start loading animation
		isLoading = true;
		startLoadingAnimation();

		await initializeFonts();
		await initializeDocument();

		// Stop loading animation
		isLoading = false;

		await tick();

		// Load the first page
		if (document && document.pages.length > 0) {
			await loadPage(0);
		}

		if (!page) {
			console.error('Page not available after document load');
			return;
		}

		// Initialize cached paint for performance
		lowOpacityPaint = new ck.Paint();
		lowOpacityPaint.setAlphaf(0.5); // 50% opacity

		// Mark as initialized so reactive statements can run
		isInitialized = true;

		cleanupEvents = bindEvents();
		drawScene();

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
		if (thumbnailCaptureTimeout !== null) {
			clearTimeout(thumbnailCaptureTimeout);
		}

		resetSelectedShape(selectedShape);
		resetHoverState(hoverState);
		resizingCorner = null;
		resizeStartState = null;
		rotationStartState = null;
	});

	// ==================== Selection & Hover Helpers ====================

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
	 * Clears hover state
	 */
	const clearHoverState = () => {
		resetHoverState(hoverState);
		updateCursorStyle();
		scheduleDraw();
	};

	/**
	 * Updates cursor style based on current state
	 */
	const updateCursorStyle = () => {
		const context = createEventHandlerContext();
		updateCursor(context);
	};

	// ==================== Event Handler Context ====================

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
				// Trigger reactivity by reassigning shapes array
				shapes = [...shapes];
				if (updateShapesHash()) {
					scheduleThumbnailCapture();
				}
			},
			onShapeResize: (shapeIndex: number, x: number, y: number, width: number, height: number) => {
				const shape = shapes[shapeIndex];
				shape.x = x;
				shape.y = y;
				shape.width = width;
				shape.height = height;
				// Trigger reactivity by reassigning shapes array
				shapes = [...shapes];
				if (updateShapesHash()) {
					scheduleThumbnailCapture();
				}
			},
			onShapeRotate: (shapeIndex: number, rotation: number) => {
				const shape = shapes[shapeIndex];
				shape.rotate = rotation;
				// Trigger reactivity by reassigning shapes array
				shapes = [...shapes];
				if (updateShapesHash()) {
					scheduleThumbnailCapture();
				}
			},
			onSelectionChange: (shapeIndex: number) => {
				selectedShape.index = shapeIndex;
				selectedShape.rendered = false;
			},
			onSelectionClear: clearSelection
		};
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
			isValidShapeIndex,
		};
	};

	/**
	 * Starts the loading animation loop
	 */
	const startLoadingAnimation = () => {
		if (loadingAnimationId !== null) return;

		const animate = () => {
			if (!isLoading || !skCanvas || !ck || !surface) {
				loadingAnimationId = null;
				return;
			}

			drawLoadingScreen(createLoadingContext(), performance.now());
			loadingAnimationId = requestAnimationFrame(animate);
		};

		loadingAnimationId = requestAnimationFrame(animate);
	};

	/**
	 * Main scene drawing function
	 */
	const drawScene = () => {
		// Show loading screen if still loading
		if (isLoading) {
			if (skCanvas && ck && surface) {
				drawLoadingScreen(createLoadingContext(), performance.now());
			}
			return;
		}

		if (!skCanvas || !ck || !paints || !lowOpacityPaint || !pageBounds || !fontMgr || !page) return;

		validateSelectedShape();

		try {
			const renderContext = createRenderContext();
			const isAnimating = renderScene(renderContext, scheduleDraw);

			// Check if animations just completed (was animating, now not animating)
			const animationsJustCompleted = wasAnimating && !isAnimating;

			if (isAutoPlaying && animationsJustCompleted) {
				// Animations just completed, advance to next page
				if (document && document.pages.length > 0) {
					const nextPageIndex = (currentPageIndex + 1) % document.pages.length;
					switchToPage(nextPageIndex);
				}
			}

		
			wasAnimating = isAnimating;
		} catch (error) {
			console.error('Error rendering scene:', error);
		}
	};

	// ==================== Event Handlers ====================

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

	const handleResize = () => {
		updateCanvasDimensions();
		scheduleDraw();
	};

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

	// ==================== Render Callbacks ====================

	/**
	 * Generates a hash of shapes state for change detection
	 * Returns true if the hash changed, false otherwise
	 */
	const updateShapesHash = (): boolean => {
		const shapesData = JSON.stringify(
			shapes.map((s) => ({
				x: s.x,
				y: s.y,
				width: s.width,
				height: s.height,
				rotate: s.rotate,
				kind: s.kind,
				...(s.kind === 'image' ? { url: s.url } : {}),
				...(s.kind === 'text' ? { text: s.text, fontSize: s.fontSize } : {})
			}))
		);
		
		const hashChanged = shapesData !== shapesHash;
		shapesHash = shapesData;
		
		return hashChanged;
	};

	/**
	 * Captures thumbnail for a specific page
	 * @param targetPage - The page to capture thumbnail for
	 * @param targetShapes - The shapes for that page
	 * @returns Promise that resolves to the data URL string, or null if capture fails
	 */
	const captureThumbnailForPage = async (
		targetPage: EditorPage,
		targetShapes: Shape[]
	): Promise<string | null> => {
		// Validate required resources
		if (!ck || !fontMgr) {
			return null;
		}

		// Create paints and bounds for the target page
		const targetPaints = createPaints(ck, targetPage);
		const targetPageBounds = ck.XYWHRect(
			-targetPage.width / 2,
			-targetPage.height / 2,
			targetPage.width,
			targetPage.height
		);

		return captureThumbnail({
			ck,
			page: targetPage,
			pageBounds: targetPageBounds,
			shapes: targetShapes,
			paints: targetPaints,
			fontMgr
		});
	};

	/**
	 * Captures the current canvas render as a thumbnail data URL
	 * @returns Promise that resolves to the data URL string, or null if capture fails
	 */
	const captureThumbnailLocal = async (): Promise<string | null> => {
		// Validate required resources
		if (!ck || !page || !pageBounds || !paints || !fontMgr) {
			return null;
		}

		return captureThumbnail({
			ck,
			page,
			pageBounds,
			shapes,
			paints,
			fontMgr
		});
	};

	/**
	 * Captures thumbnail and stores it in the page object
	 */
	const captureAndStoreThumbnail = async () => {
		// Don't capture if already capturing
		if (isCapturingThumbnail || !page || !document) {
			return;
		}

		// Store references to avoid closure issues
		const currentPage = page;
		const currentDocument = document;

		// Wait for next render frame to ensure content is rendered
		requestAnimationFrame(() => {
			requestAnimationFrame(async () => {
				if (!currentPage || !currentDocument) return;

				isCapturingThumbnail = true;
				try {
					const dataUrl = await captureThumbnailLocal();
					console.log('Thumbnail captured:', dataUrl);
					if (dataUrl) {
						// Find the page in document.pages array and update it
						const pageIndex = currentDocument.pages.findIndex((p) => p.id === currentPage.id);
						if (pageIndex !== -1) {
							// Create new page object with thumbnail
							const updatedPage = { ...currentPage, thumbnailUrl: dataUrl };
							// Create new pages array with updated page
							const updatedPages = [...currentDocument.pages];
							updatedPages[pageIndex] = updatedPage;
							// Create new document with updated pages
							document = { ...currentDocument, pages: updatedPages };
							// Update local page reference
							page = updatedPage;
							
							console.log('Thumbnail captured and stored for page:', currentPage.id);
						}
					}
				} catch (error) {
					console.error('Error capturing thumbnail:', error);
				} finally {
					isCapturingThumbnail = false;
				}
			});
		});
	};

	/**
	 * Schedules thumbnail capture with appropriate delay based on whether thumbnail exists
	 */
	const scheduleThumbnailCapture = () => {
		if (!page || !isInitialized) {
			console.log('scheduleThumbnailCapture: Skipping - page:', !!page, 'isInitialized:', isInitialized);
			return;
		}

		// Clear any existing timeout
		if (thumbnailCaptureTimeout !== null) {
			clearTimeout(thumbnailCaptureTimeout);
		}

		// Determine delay: 500ms if no thumbnail exists, 1000ms if thumbnail exists (longer delay to ensure user completed action)
		const delay = page.thumbnailUrl ? 1000 : 500;

		console.log('scheduleThumbnailCapture: Scheduling capture with delay', delay, 'ms, hasThumbnail:', !!page.thumbnailUrl);

		thumbnailCaptureTimeout = window.setTimeout(() => {
			console.log('scheduleThumbnailCapture: Executing capture now');
			captureAndStoreThumbnail();
			thumbnailCaptureTimeout = null;
		}, delay);
	};

	/**
	 * Processes background thumbnail queue for all pages
	 * Runs asynchronously without blocking the main render
	 */
	const processBackgroundThumbnails = async () => {
		if (!document || !ck || !fontMgr || isProcessingBackgroundThumbnails) {
			return;
		}

		isProcessingBackgroundThumbnails = true;

		try {
			// Find all pages that need thumbnails
			const pagesNeedingThumbnails: number[] = [];
			for (let i = 0; i < document.pages.length; i++) {
				const p = document.pages[i];
				if (!p.thumbnailUrl && p.shapes.length > 0) {
					pagesNeedingThumbnails.push(i);
				}
			}

			console.log(`Found ${pagesNeedingThumbnails.length} pages needing thumbnails`);

			// Process pages one at a time with delays to avoid blocking
			for (const pageIndex of pagesNeedingThumbnails) {
				// Check if we should pause to avoid blocking main render
				// Yield to main thread between pages
				await new Promise<void>((resolve) => {
					// Use requestIdleCallback if available for better performance
					const processPage = async () => {
						await captureThumbnailForPageIndex(pageIndex);
						// Small delay between pages to yield to main thread
						setTimeout(resolve, 150);
					};

					if ('requestIdleCallback' in window) {
						(window as any).requestIdleCallback(
							processPage,
							{ timeout: 2000 }
						);
					} else {
						// Fallback: use setTimeout with longer delay to avoid blocking
						setTimeout(processPage, 300);
					}
				});
			}
		} catch (error) {
			console.error('Error processing background thumbnails:', error);
		} finally {
			isProcessingBackgroundThumbnails = false;
		}
	};

	/**
	 * Captures thumbnail for a specific page by index
	 */
	const captureThumbnailForPageIndex = async (pageIndex: number) => {
		if (!document || !ck || pageIndex < 0 || pageIndex >= document.pages.length) {
			return;
		}

		const targetPage = document.pages[pageIndex];
		if (!targetPage || targetPage.thumbnailUrl) {
			return; // Already has thumbnail
		}

		try {
			// Load images for the page if needed
			const loadedShapes = await loadPageImages(ck, targetPage);

			// Capture thumbnail
			const dataUrl = await captureThumbnailForPage(targetPage, loadedShapes);

			if (dataUrl && document) {
				// Update the page in document
				const updatedPage = { ...targetPage, thumbnailUrl: dataUrl };
				const updatedPages = [...document.pages];
				updatedPages[pageIndex] = updatedPage;
				document = { ...document, pages: updatedPages };

				console.log(`Thumbnail captured for page ${pageIndex + 1}/${document.pages.length}:`, targetPage.id);
			}
		} catch (error) {
			console.error(`Error capturing thumbnail for page ${pageIndex}:`, error);
		}
	};

	// Watch for shape changes and schedule thumbnail capture
	// This reactive statement runs when page, shapes, shapesHash, or isInitialized changes
	$: if (isInitialized && page && shapes.length > 0 && shapesHash !== '') {
		const currentHash = JSON.stringify(
			shapes.map((s) => ({
				x: s.x,
				y: s.y,
				width: s.width,
				height: s.height,
				rotate: s.rotate,
				kind: s.kind,
				...(s.kind === 'image' ? { url: s.url } : {}),
				...(s.kind === 'text' ? { text: s.text, fontSize: s.fontSize } : {})
			}))
		);

		// Schedule capture if shapes changed
		if (currentHash !== shapesHash) {
			console.log('Reactive statement: Shapes changed, scheduling capture');
			shapesHash = currentHash;
			scheduleThumbnailCapture();
		}
	}

	// Start background thumbnail processing when document is loaded (only once)
	$: if (isInitialized && document && document.pages.length > 0 && !backgroundThumbnailsStarted && !isProcessingBackgroundThumbnails) {
		backgroundThumbnailsStarted = true;
		
		// Use requestIdleCallback to start processing when browser is idle
		// This ensures it doesn't block the main render flow
		if ('requestIdleCallback' in window) {
			(window as any).requestIdleCallback(
				() => {
					processBackgroundThumbnails();
				},
				{ timeout: 3000 }
			);
		} else {
			// Fallback: start after a delay to let main render complete
			setTimeout(() => {
				processBackgroundThumbnails();
			}, 2000);
		}
	}

	
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
								<span class="wrap-break-word">{m}</span>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>
		<!-- Animation Controls -->
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
								class="relative w-32 h-24 rounded border-2 transition-all overflow-hidden {currentPageIndex === i
									? 'border-pink-500 scale-105'
									: 'border-zinc-300 hover:border-zinc-400'}"
								on:click={() => switchToPage(i)}
								on:keydown={(e) => e.key === 'Enter' && switchToPage(i)}
							>
								<!-- Page Thumbnail Preview -->
								{#if p.thumbnailUrl}
									<img
										src={p.thumbnailUrl}
										alt="Page {i + 1} thumbnail"
										class="w-full h-full object-contain rounded"
									/>
								{:else}
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
								{/if}
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
