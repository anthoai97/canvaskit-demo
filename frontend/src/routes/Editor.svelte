<script lang="ts">
	import { getPageMaxAnimationDuration, startShapeAnimations } from '$lib/canvakit/animation';
	import { createWebGLSurface, initCanvasKit } from '$lib/canvakit/canvas';
	import { createPaints, drawSelectedBorder } from '$lib/canvakit/drawing';
	import { loadFonts, preloadFonts } from '$lib/canvakit/font';
	import { TextEditor } from '$lib/editor/text/TextEditor';
	import { drawTextShape, calculateFitFontSize } from '$lib/canvakit/text';
	import { getShapeCenter } from '$lib/utils/transform';
	import {
		DEFAULT_CAMERA_ZOOM,
		INVALID_INDEX,
		MAX_CAMERA_ZOOM,
		MIN_CAMERA_ZOOM
	} from '$lib/constants/const';
	import { CanvasKitWebSocket, type BinaryMessage } from '$lib/ws';
	import { env } from '$env/dynamic/public';
	import { resetSelectedShape, type ResizeState, type RotationState } from '$lib/types/editor';
	import { resetHoverState } from '$lib/utils/hover-state';
	import type { EditorDocument, EditorPage } from '$lib/types/page';
	import type { Shape, TextShape } from '$lib/types/shape';
	import type { Canvas, CanvasKit, Paint, Surface, FontMgr } from 'canvaskit-wasm';
	import { onDestroy, onMount, tick } from 'svelte';
	import { createDefaultDocument, loadPageImages } from '$lib/editor/document-loader';
	import { loadSkImage } from '$lib/canvakit/image';
	import { calculateViewport, isRectVisible } from '$lib/utils/viewport';
	import type { ImageShape } from '$lib/types/shape';
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
	import {
		generateShapesHash,
		captureThumbnailLocal,
		updatePageThumbnail,
		scheduleBackgroundThumbnailProcessing,
		getThumbnailCaptureDelay
	} from '$lib/editor/thumbnail-manager';
	import { VideoRecorder } from '$lib/utils/video-recorder';
	import { debounce } from '$lib/utils/index';
	import Modal from '$lib/components/Modal.svelte';
	import ArchitectureContent from '$lib/components/ArchitectureContent.svelte';

	type ExportResolution = '720p' | '1080p' | '2k';

	// ==================== DOM References ====================
	let editor: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let overlayCanvas: HTMLCanvasElement;
	let audioElement: HTMLAudioElement;

	// ==================== Recording State ====================
	let audioBlob: Blob | null = null;
	let audioOptions: { url: string; name: string }[] = [];
	let selectedAudioUrl: string = '';
	let isRecording = false;
	let isExporting = false;
	const recorder = new VideoRecorder();
	let exportResolution: ExportResolution = '1080p';
	let recordingTimeSec = 0;
	let recordingLastTimestamp: number | null = null;
	let recordingDocument: EditorDocument | null = null;
	let recordingPageIndex = 0;
	let recordingPageStartTimestamp: number | null = null;
	let exportProgress = 0; // Export progress percentage (0-100)
	let exportCurrentPage = 0;
	let exportTotalPages = 0;

	// ==================== CanvasKit State ====================
	let ck: CanvasKit;
	let surface: Surface | null = null;
	let skCanvas: Canvas | null = null;
	let fontMgr: FontMgr | null = null;

	// Recording Surface State
	let recordingCanvas: HTMLCanvasElement;
	let recordingSurface: Surface | null = null;
	let recordingSkCanvas: Canvas | null = null;

	// Overlay Canvas State
	let overlaySurface: Surface | null = null;
	let overlaySkCanvas: Canvas | null = null;

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
	let resizeStartState: ResizeState | null = null;
	let rotationStartState: RotationState | null = null;
	let clipboard: Shape | null = null;
	let history: Shape[][] = [];

	// ==================== Camera & Mouse State ====================
	const INITIAL_PAGE_VIEW_RATIO = 0.7;

	const calculateInitialZoom = (page: EditorPage | null) => {
		if (!page || !canvasWidth || !canvasHeight) {
			return DEFAULT_CAMERA_ZOOM;
		}

		const widthScale = (canvasWidth * INITIAL_PAGE_VIEW_RATIO) / page.width;
		const heightScale = (canvasHeight * INITIAL_PAGE_VIEW_RATIO) / page.height;
		const fitZoom = Math.min(widthScale, heightScale);

		if (!Number.isFinite(fitZoom) || fitZoom <= 0) {
			return DEFAULT_CAMERA_ZOOM;
		}

		return Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, fitZoom));
	};

	let isInitialZoomSet = false;

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

	// ==================== Transformation State ====================
	let transformingShapeIndex: number = INVALID_INDEX;
	let transformationType: 'drag' | 'resize' | 'rotate' | null = null;
	let activeTextEditor: TextEditor | null = null;

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

	// ==================== Thumbnail State ====================
	let shapesHash: string = '';
	let isCapturingThumbnail = false;
	let thumbnailCaptureTimeout: number | null = null;
	let backgroundThumbnailsStarted = false;

	// ==================== WebSocket State ====================
	let ws: CanvasKitWebSocket | null = null;
	let wsMessages: string[] = [];
	let documentResolve: (doc: EditorDocument) => void;
	const documentPromise = new Promise<EditorDocument>((resolve) => {
		documentResolve = resolve;
	});

	// Lazy Loading State
	const loadingImageUrls = new Set<string>();

	const loadImageForShape = async (shape: ImageShape) => {
		if (loadingImageUrls.has(shape.url)) return;
		loadingImageUrls.add(shape.url);

		const image = await loadSkImage(ck, shape.url);
		loadingImageUrls.delete(shape.url);

		if (image) {
			shape.image = image;
			shape.ratio = image.width() / image.height();
			// Trigger update
			shapes = [...shapes];
			scheduleDraw();
			scheduleThumbnailCapture();
		}
	};

	const checkVisibleImages = () => {
		if (!ck || !page || !shapes) return;

		const viewport = calculateViewport(canvasWidth, canvasHeight, cameraState);

		shapes.forEach((shape) => {
			if (shape.kind === 'image' && !shape.image) {
				// Check visibility
				if (isRectVisible(shape.x, shape.y, shape.width, shape.height, viewport)) {
					loadImageForShape(shape);
				}
			}
		});
	};

	// Debounced sender: wait 50ms before sending.
	// If another update comes for the same shape (or any shape in this simple impl), restart timer.
	const debouncedSendShapeUpdate = debounce((shape: Shape) => {
		if (!shape.id) return;

		const baseData = {
			id: shape.id,
			x: shape.x,
			y: shape.y,
			width: shape.width,
			height: shape.height,
			rotate: shape.rotate
		};

		// Add text-specific fields if it's a text shape
		const data =
			shape.kind === 'text'
				? {
						...baseData,
						text: shape.text,
						fontSize: shape.fontSize,
						fontFamily: shape.fontFamily,
						fontWeight: shape.fontWeight,
						fontStyle: shape.fontStyle,
						fontColor: shape.fontColor,
						fontOpacity: shape.fontOpacity
					}
				: baseData;

		ws?.send({
			event: 'shape_update',
			data
		});
	}, 150);

	// ==================== Document Actions ====================

	const loadDocument = (id: string) => {
		if (ws) {
			// Update URL
			const url = new URL(window.location.href);
			url.searchParams.set('doc', id);
			window.history.pushState({}, '', url);

			isLoading = true;
			startLoadingAnimation();
			ws.send({ event: 'load_document', document_id: id });
		}
	};

	// ==================== Canvas Utilities ====================

	/**
	 * Updates canvas dimensions based on container size and device pixel ratio
	 */
	const updateCanvasDimensions = () => {
		canvasWidth = editor.clientWidth;
		canvasHeight = editor.clientHeight;
		devicePixelRatioValue = window.devicePixelRatio || 1;

		// Update main canvas
		canvas.style.width = `${canvasWidth}px`;
		canvas.style.height = `${canvasHeight}px`;
		canvas.width = canvasWidth * devicePixelRatioValue;
		canvas.height = canvasHeight * devicePixelRatioValue;

		// Update overlay canvas
		overlayCanvas.style.width = `${canvasWidth}px`;
		overlayCanvas.style.height = `${canvasHeight}px`;
		overlayCanvas.width = canvasWidth * devicePixelRatioValue;
		overlayCanvas.height = canvasHeight * devicePixelRatioValue;

		// Inform CanvasKit surface about the new backing-store size (if supported)
		if (surface && typeof (surface as any).resize === 'function') {
			(surface as any).resize(
				canvasWidth * devicePixelRatioValue,
				canvasHeight * devicePixelRatioValue
			);
		}

		if (overlaySurface && typeof (overlaySurface as any).resize === 'function') {
			(overlaySurface as any).resize(
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

	// ==================== Page Management ====================

	/**
	 * Loads and switches to a specific page
	 */
	const loadPage = async (pageIndex: number) => {
		if (!document || !ck || pageIndex < 0 || pageIndex >= document.pages.length) return;

		const newPage = document.pages[pageIndex];
		if (!newPage) return;

		// Initialize shapes with null images if needed (lazy loading)
		newPage.shapes = newPage.shapes.map((s) => {
			if (s.kind === 'image' && !s.image) {
				return { ...s, image: null };
			}
			return s;
		});

		page = newPage;
		shapes = newPage.shapes;

		// Update paints and bounds for new page
		paints = createPaints(ck, page);
		pageBounds = ck.XYWHRect(-page.width / 2, -page.height / 2, page.width, page.height);

		// Reset shapes hash to trigger reactive statement
		shapesHash = '';

		// Reset camera to center
		cameraState.panX = centerX;
		cameraState.panY = centerY;
		if (!isInitialZoomSet) {
			cameraState.zoom = calculateInitialZoom(page);
			isInitialZoomSet = true;
		}

		// Clear selection
		resetSelectedShape(selectedShape);
		resetHoverState(hoverState);

		// Handle animations for auto-play mode
		if (isAutoPlaying) {
			if (hasAnimations(newPage.shapes)) {
				startShapeAnimations(newPage.shapes);
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
	$: if (isInitialized && currentPageIndex >= 0) {
		loadPage(currentPageIndex);
		// Schedule thumbnail capture for the newly loaded page
		// This ensures all pages get thumbnails when they become active
		scheduleThumbnailCapture();
	}

	/**
	 * Toggles auto-play mode: starts animations and auto-advance if stopped, stops if playing
	 */
	const toggleAutoPlay = () => {
		if (isAutoPlaying) {
			isAutoPlaying = false;
			wasAnimating = false;
			// Pause audio if playing
			if (audioElement && !audioElement.paused) {
				audioElement.pause();
				audioElement.currentTime = 0; // Reset to beginning
			}
		} else {
			startShapeAnimations(shapes);
			isAutoPlaying = true;
			wasAnimating = true;
			scheduleDraw();
			// Play audio if available
			if (audioElement && selectedAudioUrl) {
				audioElement.currentTime = 0; // Start from beginning
				audioElement.play().catch((err) => console.error('Audio play failed:', err));
			}
		}
	};

	// ==================== WebSocket ====================

	const setupWebSocket = () => {
		ws = new CanvasKitWebSocket({
			onConnected: () => {
				console.log('Connected to WS, requesting document and audio...');
				// Get doc ID from URL or default to '1'
				const urlParams = new URLSearchParams(window.location.search);
				const docId = urlParams.get('doc') || '1';

				ws?.send({ event: 'load_document', document_id: docId });
				ws?.send({ event: 'load_audio' });
			}
		});

		ws.addMessageListener((message: BinaryMessage) => {
			// Filter out ping/pong events
			if (
				message.json === 'pong' ||
				message.json?.event === 'pong' ||
				message.json?.event === 'ping'
			) {
				return;
			}

			let displayMsg = JSON.stringify(message.json);
			if (displayMsg.length > 100) {
				displayMsg = displayMsg.substring(0, 100) + '...';
			}
			displayMsg += message.blobs.length ? ` + ${message.blobs.length} blobs` : '';

			wsMessages = [...wsMessages.slice(-19), `[IN] ${displayMsg}`];

			if (message.json.event === 'document_loaded_binary') {
				const docData = message.json.data;

				// Images now use URLs directly - no blob processing needed
				// The frontend will load images from URLs when needed

				documentResolve(docData);

				// If editor is already initialized, reload the document
				if (isInitialized) {
					document = docData;
					// Reset background thumbnails flag to allow regeneration for new document
					backgroundThumbnailsStarted = false;
					if (document && document.pages.length > 0) {
						currentPageIndex = 0;
						loadPage(0).then(() => {
							isLoading = false;
						});
					} else {
						isLoading = false;
					}
				}
			} else if (message.json.event === 'audio_loaded') {
				const data = message.json.data;
				audioOptions = data.map((item: { url: string }, index: number) => {
					let url = item.url;
					if (env.PUBLIC_API_URL && !url.startsWith('http')) {
						// Remove leading slash if present to avoid double slashes if base has one
						// Actually new URL handles this if base is valid
						try {
							url = new URL(url, env.PUBLIC_API_URL).toString();
						} catch (e) {
							console.error('Error constructing audio URL:', e);
						}
					}
					return {
						url: url,
						name: `Audio ${index + 1} (${item.url.split('/').pop()})`
					};
				});

				// Automatically select the first audio item if available
				if (audioOptions.length > 0) {
					selectedAudioUrl = audioOptions[0].url;
					// Fetch the audio blob
					fetch(selectedAudioUrl)
						.then((response) => response.blob())
						.then((blob) => {
							audioBlob = blob;
						})
						.catch((error) => {
							console.error('Failed to fetch default audio:', error);
							audioBlob = null;
						});
				}
			} else if (message.json.event === 'shape_updated') {
				const updatedShape = message.json.data;
				if (updatedShape && updatedShape.id) {
					const index = shapes.findIndex((s) => s.id === updatedShape.id);
					if (index !== -1) {
						// Update shape properties
						const shape = shapes[index];
						shape.x = updatedShape.x;
						shape.y = updatedShape.y;
						shape.width = updatedShape.width;
						shape.height = updatedShape.height;
						shape.rotate = updatedShape.rotate;

						// Trigger reactivity
						shapes = [...shapes];
						scheduleDraw();
					}
				}
			} else if (message.json.event === 'shape_created') {
				const newShape = message.json.data;
				if (newShape && newShape.id) {
					// Check if we already have this shape (optimistic update)
					// Actually, for other clients, we just add it.
					const exists = shapes.some((s) => s.id === newShape.id);
					if (!exists) {
						// Load image if needed
						if (newShape.kind === 'image' && newShape.url) {
							loadSkImage(ck, newShape.url).then((image) => {
								if (image) {
									newShape.image = image;
									newShape.ratio = image.width() / image.height();
									shapes = [...shapes, newShape];
									scheduleDraw();
									scheduleThumbnailCapture();
								}
							});
						} else {
							shapes = [...shapes, newShape];
							scheduleDraw();
							scheduleThumbnailCapture();
						}
					}
				}
			} else if (message.json.event === 'shape_created_ack') {
				const realShape = message.json.data;
				const tempId = message.json.temp_id;

				if (realShape && tempId) {
					const index = shapes.findIndex((s) => s.id === tempId);
					if (index !== -1) {
						// Update ID from temp to real
						const shape = shapes[index];
						shape.id = realShape.id;
						// Update other props just in case backend sanitized something
						shape.x = realShape.x;
						shape.y = realShape.y;

						shapes = [...shapes];
					}
				}
			} else if (message.json.event === 'page_state_synced') {
				const syncedShapes = message.json.shapes;
				const pageId = message.json.page_id;

				if (page && page.id === pageId && syncedShapes) {
					// Full sync of shapes
					// We need to be careful not to break image references if possible,
					// but since this is a full sync, we might need to reload images if they are new.
					// However, for existing images, we can try to preserve the object if ID matches.

					const newShapes = syncedShapes.map((s: any) => {
						// Try to find existing shape to preserve image object
						const existing = shapes.find((ex) => ex.id === s.id);
						if (existing && existing.kind === 'image' && existing.image) {
							s.image = existing.image;
						} else if (s.kind === 'image' && s.url) {
							// Load image if missing
							loadSkImage(ck, s.url).then((image) => {
								if (image) {
									// We can't easily update 's' here as it's already in the array.
									// We'd need to find it in 'shapes' again.
									const target = shapes.find((sh) => sh.id === s.id);
									if (target && target.kind === 'image') {
										target.image = image;
										target.ratio = image.width() / image.height();
										scheduleDraw();
										scheduleThumbnailCapture();
									}
								}
							});
						}
						return s;
					});

					shapes = newShapes;
					scheduleDraw();
					scheduleThumbnailCapture();
				}
			}
		});

		ws.addSendListener((data: any) => {
			// Filter out ping events
			if (data === 'ping' || data?.event === 'ping') {
				return;
			}

			let displayMsg = JSON.stringify(data);
			if (displayMsg.length > 100) {
				displayMsg = displayMsg.substring(0, 100) + '...';
			}
			wsMessages = [...wsMessages.slice(-19), `[OUT] ${displayMsg}`];
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

		// Initialize overlay canvas
		overlaySurface = createWebGLSurface(ck, overlayCanvas);
		overlaySkCanvas = overlaySurface?.getCanvas() ?? null;
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
		try {
			document = await documentPromise;
		} catch (error) {
			console.error('Error loading document from WS:', error);
			document = null;
		}

		if (!document || document.pages.length === 0) {
			console.error('Document data not loaded');
			document = createDefaultDocument();
			currentPageIndex = 0;
		}

		// Reset background thumbnail processing flag when new document loads
		backgroundThumbnailsStarted = false;
	};

	/**
	 * Initializes cached resources for performance
	 */
	const initializeCachedResources = () => {
		if (!ck) return;
		lowOpacityPaint = new ck.Paint();
		lowOpacityPaint.setAlphaf(0.5);
	};

	/**
	 * Main initialization function
	 */
	const initializeEditor = async () => {
		updateCanvasDimensions();
		await tick();

		cameraState.panX = centerX;
		cameraState.panY = centerY;

		await initializeCanvas();
		isLoading = true;
		startLoadingAnimation();

		await initializeFonts();

		setupWebSocket();

		await initializeDocument();
		isLoading = false;

		await tick();

		if (document && document.pages.length > 0) {
			await loadPage(0);
		}

		if (!page) {
			console.error('Page not available after document load');
			return;
		}

		initializeCachedResources();
		isInitialized = true;

		cleanupEvents = bindEvents();
		drawScene();
	};

	const getExportSize = (resolution: ExportResolution) => {
		switch (resolution) {
			case '720p':
				return { width: 1280, height: 720 };
			case '2k':
				return { width: 2560, height: 1440 };
			case '1080p':
			default:
				return { width: 1920, height: 1080 };
		}
	};

	const handleAudioSelect = async (event: Event) => {
		const target = event.target as HTMLSelectElement;
		selectedAudioUrl = target.value;
		if (selectedAudioUrl) {
			try {
				const response = await fetch(selectedAudioUrl);
				audioBlob = await response.blob();
			} catch (error) {
				console.error('Failed to fetch audio:', error);
				audioBlob = null;
			}
		} else {
			audioBlob = null;
		}
	};

	const finishRecording = async () => {
		if (!isRecording) return;

		// Stop recording loop immediately
		isRecording = false;
		isExporting = true;

		try {
			// Stop Recording
			const blob = await recorder.stop(recordingTimeSec);
			recordingLastTimestamp = null;

			// Reset progress tracking
			exportProgress = 0;
			exportCurrentPage = 0;
			exportTotalPages = 0;

			// Clean up recording surface
			if (recordingSurface) {
				recordingSurface.delete();
				recordingSurface = null;
				recordingSkCanvas = null;
			}

			// Stop animation if it was playing
			if (isAutoPlaying) toggleAutoPlay();

			// Download the file
			const url = URL.createObjectURL(blob);
			const a = window.document.createElement('a');
			a.href = url;
			// Determine extension based on MIME type (usually webm or mp4)
			const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
			a.download = `canvas-export.${ext}`;
			window.document.body.appendChild(a);
			a.click();
			window.document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} finally {
			isExporting = false;
		}
	};

	const toggleRecording = async () => {
		if (isRecording) {
			await finishRecording();
		} else {
			if (!page || !ck) return;

			// Setup recording canvas
			const { width, height } = getExportSize(exportResolution);
			recordingCanvas.width = width;
			recordingCanvas.height = height;

			// Initialize recording surface
			recordingSurface = createWebGLSurface(ck, recordingCanvas);
			if (!recordingSurface) {
				console.error('Failed to create recording surface');
				return;
			}
			recordingSkCanvas = recordingSurface.getCanvas();

			// Prepare & start recorder
			recordingTimeSec = 0;
			recordingLastTimestamp = null;

			// Snapshot document for independent recording
			recordingDocument = {
				...document,
				pages: document!.pages.map((p) => {
					// Use current shapes state if this is the active page
					const pageShapes = page && p.id === page.id ? shapes : p.shapes;

					return {
						...p,
						shapes: pageShapes.map((s) => ({
							...s,
							// Clear ID to avoid any potential conflicts during export/render
							id: undefined
						}))
					};
				})
			};

			console.log('Recording document:', recordingDocument.pages);

			recordingPageIndex = 0;
			recordingPageStartTimestamp = null;

			// Initialize progress tracking
			exportProgress = 0;
			exportCurrentPage = 1;
			exportTotalPages = recordingDocument.pages.length;

			await recorder.prepare(recordingCanvas, width, height, audioBlob || undefined);
			await recorder.start();
			isRecording = true;
			recordLoop();
		}
	};

	onMount(initializeEditor);

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

		// Cleanup overlay
		if (overlaySurface) {
			overlaySurface.delete();
		}

		resetSelectedShape(selectedShape);
		resetHoverState(hoverState);
		resizingCorner = null;
		resizeStartState = null;
		rotationStartState = null;
		if (activeTextEditor) {
			activeTextEditor.stop();
			activeTextEditor = null;
		}
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

	const stopTextEditing = () => {
		if (!activeTextEditor) return;
		activeTextEditor.stop();
	};

	/**
	 * Clears selection state
	 */
	const clearSelection = () => {
		stopTextEditing();
		resetSelectedShape(selectedShape);
		resetHoverState(hoverState);
		resizingCorner = null;
		resizeStartState = null;
		rotationStartState = null;
		scheduleDraw();
	};

	// ==================== Drag and Drop Helpers ====================

	/**
	 * Clears the overlay canvas
	 */
	const clearOverlay = () => {
		if (!overlaySkCanvas || !ck) return;
		overlaySkCanvas.clear(ck.TRANSPARENT);
		overlaySurface?.flush();
	};

	/**
	 * Renders the transforming shape on the overlay canvas
	 */
	const renderTransformingShapeOnOverlay = () => {
		if (!overlaySkCanvas || !ck || !paints || !fontMgr) return;
		if (transformingShapeIndex === INVALID_INDEX) return;

		const shape = shapes[transformingShapeIndex];
		if (!shape) return;

		clearOverlay();

		overlaySkCanvas.save();

		// Apply camera transformations (same as main canvas)
		overlaySkCanvas.scale(devicePixelRatioValue, devicePixelRatioValue);
		overlaySkCanvas.translate(cameraState.panX, cameraState.panY);
		overlaySkCanvas.scale(cameraState.zoom, cameraState.zoom);

		// Apply shape rotation if needed
		if (shape.rotate !== null && shape.rotate !== 0) {
			const center = getShapeCenter(shape);
			overlaySkCanvas.rotate(shape.rotate, center.x, center.y);
		}

		// Render based on shape type
		if (shape.kind === 'image' && shape.image) {
			const src = ck.XYWHRect(0, 0, shape.image.width(), shape.image.height());
			const dst = ck.XYWHRect(shape.x, shape.y, shape.width, shape.height);

			if (overlaySkCanvas.drawImageRectOptions) {
				overlaySkCanvas.drawImageRectOptions(
					shape.image,
					src,
					dst,
					ck.FilterMode.Linear,
					ck.MipmapMode.Linear,
					paints.image
				);
			} else {
				overlaySkCanvas.drawImageRect(shape.image, src, dst, paints.image);
			}
		} else if (shape.kind === 'text') {
			drawTextShape(ck, overlaySkCanvas, fontMgr, shape);
		}

		overlaySkCanvas.restore();

		// Draw selection borders for resize and rotate operations
		// This shows the resize handles and rotate circle during transformation
		if (transformationType === 'resize' || transformationType === 'rotate') {
			overlaySkCanvas.save();

			// Apply camera transformations
			overlaySkCanvas.scale(devicePixelRatioValue, devicePixelRatioValue);
			overlaySkCanvas.translate(cameraState.panX, cameraState.panY);
			overlaySkCanvas.scale(cameraState.zoom, cameraState.zoom);

			// Apply rotation if needed
			if (shape.rotate !== null && shape.rotate !== 0) {
				const center = getShapeCenter(shape);
				overlaySkCanvas.rotate(shape.rotate, center.x, center.y);
			}

			// Draw selection border with handles
			drawSelectedBorder(
				overlaySkCanvas,
				ck,
				shape.x,
				shape.y,
				shape.width,
				shape.height,
				paints.tool,
				cameraState.zoom
			);

			overlaySkCanvas.restore();
		}

		overlaySurface?.flush();
	};

	/**
	 * Updates cursor style based on current state
	 */
	const updateCursorStyle = () => {
		const context = createEventHandlerContext();
		updateCursor(context);
	};

	/**
	 * Checks if text editing is currently active
	 */
	const isTextEditing = (): boolean => {
		return activeTextEditor !== null;
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
			isTextEditing,
			onCursorUpdate: (cursor: string) => {
				canvasCursor = cursor;
			},
			onScheduleDraw: scheduleDraw,
			onPanning: (deltaX: number, deltaY: number) => {
				cameraState.panX += deltaX;
				cameraState.panY += deltaY;
			},
			onShapeDrag: (shapeIndex: number, deltaX: number, deltaY: number) => {
				if (transformationType !== 'drag') {
					addToHistory();
				}
				const draggedShape = shapes[shapeIndex];
				draggedShape.x += deltaX;
				draggedShape.y += deltaY;

				// Set transformation state
				transformingShapeIndex = shapeIndex;
				transformationType = 'drag';

				// Render on overlay
				renderTransformingShapeOnOverlay();

				// Trigger reactivity by reassigning shapes array
				shapes = [...shapes];
				debouncedSendShapeUpdate(draggedShape);
				if (updateShapesHash()) {
					scheduleThumbnailCapture();
				}
			},
			onShapeResize: (shapeIndex: number, x: number, y: number, width: number, height: number) => {
				if (transformationType !== 'resize') {
					addToHistory();
				}
				const shape = shapes[shapeIndex];

				// Apply resize dimensions
				shape.x = x;
				shape.y = y;
				shape.width = width;
				shape.height = height;

				// Auto-fit font size for text shapes
				if (shape.kind === 'text' && ck && fontMgr) {
					const newFontSize = calculateFitFontSize(ck, fontMgr, shape.text, width, height);
					shape.fontSize = newFontSize;
				}

				// Set transformation state
				transformingShapeIndex = shapeIndex;
				transformationType = 'resize';

				// Render on overlay
				renderTransformingShapeOnOverlay();

				// Trigger reactivity by reassigning shapes array
				shapes = [...shapes];
				debouncedSendShapeUpdate(shape);
				if (updateShapesHash()) {
					scheduleThumbnailCapture();
				}
			},
			onShapeRotate: (shapeIndex: number, rotation: number) => {
				if (transformationType !== 'rotate') {
					addToHistory();
				}
				const shape = shapes[shapeIndex];
				shape.rotate = rotation;

				// Set transformation state
				transformingShapeIndex = shapeIndex;
				transformationType = 'rotate';

				// Render on overlay
				renderTransformingShapeOnOverlay();

				// Trigger reactivity by reassigning shapes array
				shapes = [...shapes];
				debouncedSendShapeUpdate(shape);
				if (updateShapesHash()) {
					scheduleThumbnailCapture();
				}
			},
			onSelectionChange: (shapeIndex: number) => {
				stopTextEditing();
				selectedShape.index = shapeIndex;
				selectedShape.rendered = false;
			},
			onSelectionClear: clearSelection,
			onResizingCornerChange: (
				corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | null
			) => {
				resizingCorner = corner;
			},
			onResizeStartStateChange: (state: ResizeState | null) => {
				resizeStartState = state;
			},
			onRotationStartStateChange: (state: RotationState | null) => {
				rotationStartState = state;
			},
			onTransformEnd: () => {
				if (transformingShapeIndex !== INVALID_INDEX) {
					transformingShapeIndex = INVALID_INDEX;
					transformationType = null;
					clearOverlay();
					scheduleDraw(); // Redraw main canvas with all shapes
				}
			},
			onCopy: () => {
				if (selectedShape.index !== INVALID_INDEX) {
					const shape = shapes[selectedShape.index];
					// Deep copy the shape data
					const copy = JSON.parse(JSON.stringify(shape));

					// Restore the image object reference for image shapes
					// JSON.stringify destroys the WASM Image object methods
					if (shape.kind === 'image' && shape.image) {
						copy.image = shape.image;
					}

					clipboard = copy;
				}
			},
			onPaste: () => {
				if (clipboard) {
					addToHistory();
					// Deep copy the clipboard data
					const newShape = JSON.parse(JSON.stringify(clipboard));

					// Restore the image object reference
					if (clipboard.kind === 'image' && clipboard.image) {
						newShape.image = clipboard.image;
					}

					newShape.id = Date.now() + Math.floor(Math.random() * 1000);
					newShape.x += 20;
					newShape.y += 20;

					shapes = [...shapes, newShape];

					// Select the new shape
					selectedShape.index = shapes.length - 1;
					selectedShape.rendered = false;

					scheduleDraw();
					scheduleThumbnailCapture();
					debouncedSendShapeUpdate(newShape);

					// Send create event to backend
					if (ws && page) {
						ws.send({
							event: 'shape_create',
							page_id: page.id,
							temp_id: newShape.id,
							data: {
								kind: newShape.kind,
								x: newShape.x,
								y: newShape.y,
								width: newShape.width,
								height: newShape.height,
								rotate: newShape.rotate,
								// Include other properties
								...(newShape.kind === 'text'
									? {
											text: newShape.text,
											fontSize: newShape.fontSize,
											fontFamily: newShape.fontFamily,
											fontWeight: newShape.fontWeight,
											fontStyle: newShape.fontStyle,
											fontColor: newShape.fontColor,
											fontOpacity: newShape.fontOpacity
										}
									: {
											url: newShape.url,
											ratio: newShape.ratio
										}),
								animation: newShape.animation
							}
						});
					}
				}
			},
			onUndo: () => {
				if (history.length > 0) {
					const previousShapes = history.pop();
					if (previousShapes) {
						// Restore shapes
						shapes = previousShapes;

						// Clear selection to avoid issues with invalid indices
						selectedShape.index = INVALID_INDEX;
						selectedShape.rendered = false;
						resetHoverState(hoverState);

						scheduleDraw();
						scheduleThumbnailCapture();

						// Sync with backend
						if (ws && page) {
							ws.send({
								event: 'sync_page_shapes',
								page_id: page.id,
								shapes: shapes.map((s) => ({
									id: s.id,
									kind: s.kind,
									x: s.x,
									y: s.y,
									width: s.width,
									height: s.height,
									rotate: s.rotate,
									// Include other properties
									...(s.kind === 'text'
										? {
												text: s.text,
												fontSize: s.fontSize,
												fontFamily: s.fontFamily,
												fontWeight: s.fontWeight,
												fontStyle: s.fontStyle,
												fontColor: s.fontColor,
												fontOpacity: s.fontOpacity
											}
										: {
												url: s.url,
												ratio: s.ratio
											}),
									animation: s.animation
								}))
							});
						}
					}
				}
			},
			onDelete: () => {
				if (selectedShape.index !== INVALID_INDEX) {
					addToHistory();

					// Remove the shape from the array
					shapes = shapes.filter((_, index) => index !== selectedShape.index);

					// Clear selection
					selectedShape.index = INVALID_INDEX;
					selectedShape.rendered = false;
					resetHoverState(hoverState);

					scheduleDraw();
					scheduleThumbnailCapture();

					// Sync with backend
					if (ws && page) {
						ws.send({
							event: 'sync_page_shapes',
							page_id: page.id,
							shapes: shapes.map((s) => ({
								id: s.id,
								kind: s.kind,
								x: s.x,
								y: s.y,
								width: s.width,
								height: s.height,
								rotate: s.rotate,
								// Include other properties
								...(s.kind === 'text'
									? {
											text: s.text,
											fontSize: s.fontSize,
											fontFamily: s.fontFamily,
											fontWeight: s.fontWeight,
											fontStyle: s.fontStyle,
											fontColor: s.fontColor,
											fontOpacity: s.fontOpacity
										}
									: {
											url: s.url,
											ratio: s.ratio
										}),
								animation: s.animation
							}))
						});
					}
				}
			},
			onShapeDoubleClick: (shapeIndex: number, worldX: number, worldY: number) => {
				const shape = shapes[shapeIndex];

				if (shape.kind !== 'text' || !ck || !fontMgr || !editor) {
					return;
				}

				// Stop existing editor if any before starting a new session
				if (activeTextEditor) {
					activeTextEditor.stop();
				}

				// Ensure the shape is selected so handles appear while editing
				selectedShape.index = shapeIndex;
				selectedShape.rendered = false;

				// Capture state for undo before mutating text
				addToHistory();

				const textShape: TextShape = shape;

				// Calculate click position relative to shape's top-left corner
				const relativeX = worldX - textShape.x;
				const relativeY = worldY - textShape.y;

				const newTextEditor = new TextEditor(
					ck,
					fontMgr,
					textShape,
					editor,
					cameraState,
					{
						onUpdate: (updatedText: string) => {
							textShape.text = updatedText;
							shapes = [...shapes];
							scheduleDraw();
							if (updateShapesHash()) {
								scheduleThumbnailCapture();
							}
							// Sync text changes to backend
							debouncedSendShapeUpdate(textShape);
						},
						onStop: () => {
							activeTextEditor = null;
							scheduleDraw();
						},
						onCursorMove: () => {
							scheduleDraw();
						}
					},
					relativeX,
					relativeY
				);

				activeTextEditor = newTextEditor;
				scheduleDraw();
			},
			onStopTextEditing: () => {
				console.log('[Editor] onStopTextEditing');
				stopTextEditing();
			}
		};
	};
	/**
	 * Adds current state to history
	 */
	const addToHistory = () => {
		// Deep copy shapes
		const shapesCopy = shapes.map((shape) => {
			const copy = JSON.parse(JSON.stringify(shape));
			if (shape.kind === 'image' && shape.image) {
				copy.image = shape.image;
			}
			return copy;
		});

		history.push(shapesCopy);

		// Limit to 30 items
		if (history.length > 30) {
			history.shift();
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
			isPlaying: isAutoPlaying,
			transformingShapeIndex
		};
	};

	/**
	 * Starts the loading animation loop
	 */
	const startLoadingAnimation = () => {
		if (loadingAnimationId !== null) return;

		const animate = () => {
			if (!isLoading) {
				loadingAnimationId = null;
				return;
			}

			// Just draw once per frame if needed, though it is static now.
			if (skCanvas && ck && surface) {
				drawLoadingScreen(createLoadingContext(), performance.now());
			}
			// Keep the loop running to prevent other draws from overwriting it while loading
			loadingAnimationId = requestAnimationFrame(animate);
		};

		loadingAnimationId = requestAnimationFrame(animate);
	};

	const recordLoop = async () => {
		if (!isRecording || !recordingDocument) return;

		const now = performance.now();
		const page = recordingDocument.pages[recordingPageIndex];

		// 1. Ensure images loaded
		// We can check if shapes with kind='image' have 'image' property
		const needsLoad = page.shapes.some((s) => s.kind === 'image' && !s.image);
		if (needsLoad) {
			// Load images
			const loaded = await loadPageImages(ck, page);
			page.shapes = loaded;
		}

		// 2. Initialize Page (Start Animations)
		if (recordingPageStartTimestamp === null) {
			recordingPageStartTimestamp = now;
			startShapeAnimations(page.shapes, now);
		}

		// 3. Frame Throttling - Only capture frames at 30 FPS
		const TARGET_FPS = 30;
		const FRAME_INTERVAL = 1000 / TARGET_FPS; // ~33.33ms between frames

		if (recordingLastTimestamp === null) {
			recordingLastTimestamp = now;
		}

		const timeSinceLastFrame = now - recordingLastTimestamp;

		// Only draw and capture if enough time has passed for the next frame
		if (timeSinceLastFrame >= FRAME_INTERVAL) {
			// Draw & Capture
			drawRecordingFrame(page, now);
			recordingLastTimestamp = now;
		}

		// 4. Check for Page Switch
		const timeOnPage = now - recordingPageStartTimestamp;
		const maxDuration = getPageMaxAnimationDuration(page);

		// Wait at least 2s for static pages, or max animation time + 500ms buffer for animated pages
		const requiredTime = maxDuration === 0 ? 2000 : maxDuration + 500;

		// Calculate progress
		// Progress per page = 100 / total pages
		// Progress within page = (timeOnPage / requiredTime) * (100 / total pages)
		const progressPerPage = 100 / exportTotalPages;
		const pageProgress = Math.min((timeOnPage / requiredTime) * progressPerPage, progressPerPage);
		const completedPagesProgress = recordingPageIndex * progressPerPage;
		exportProgress = Math.min(Math.round(completedPagesProgress + pageProgress), 100);
		exportCurrentPage = recordingPageIndex + 1;

		if (timeOnPage > requiredTime) {
			const nextIndex = recordingPageIndex + 1;
			if (nextIndex >= recordingDocument.pages.length) {
				await finishRecording();
				return;
			} else {
				recordingPageIndex = nextIndex;
				recordingPageStartTimestamp = null;
				// Loop continues to next page
			}
		}

		requestAnimationFrame(recordLoop);
	};

	/**
	 * Draws a frame for the video recording
	 */
	const drawRecordingFrame = (targetPage: EditorPage, now: number): boolean => {
		if (!isRecording || !recordingSurface || !recordingSkCanvas || !ck || !fontMgr) return false;

		const exportWidth = recordingCanvas.width || targetPage.width;
		const exportHeight = recordingCanvas.height || targetPage.height;
		const zoom = exportWidth / targetPage.width;

		// Clear the recording canvas explicitly before drawing
		recordingSkCanvas.clear(ck.Color(0, 0, 0, 1.0));

		// Calculate page bounds for this specific page
		const targetPageBounds = ck.XYWHRect(
			-targetPage.width / 2,
			-targetPage.height / 2,
			targetPage.width,
			targetPage.height
		);

		// Create paints for this specific page (background color might differ)
		const recordingPaints = createPaints(ck, targetPage);

		const recordingContext: RenderContext = {
			skCanvas: recordingSkCanvas,
			ck,
			paints: recordingPaints,
			lowOpacityPaint: lowOpacityPaint!, // Assuming initialized
			pageBounds: targetPageBounds,
			fontMgr,
			page: targetPage,
			shapes: targetPage.shapes,
			surface: recordingSurface,
			canvasWidth: exportWidth,
			canvasHeight: exportHeight,
			devicePixelRatio: 1,
			cameraState: {
				panX: exportWidth / 2,
				panY: exportHeight / 2,
				zoom,
				isPanning: false
			},
			// Disable overlays in export
			selectedShape: { index: INVALID_INDEX, rendered: false },
			hoverState: { shapeIndex: INVALID_INDEX, resizeCorner: null, isHoveringRotateCircle: false },
			isValidShapeIndex: () => false,
			isPlaying: true
		};

		recordingSkCanvas.save();
		// Pass empty callback to avoid triggering main scene redraw
		const isAnimating = renderScene(recordingContext, () => {}, now);
		recordingSkCanvas.restore();

		// Clean up recording paints
		Object.values(recordingPaints).forEach((p) => p.delete());

		// Capture frame for encoder with constant frame rate (30 FPS)
		// Frame throttling is handled in recordLoop to ensure we capture at exactly 30 FPS
		const FRAME_DURATION = 1 / 30; // 0.0333 seconds per frame

		const frameTimestamp = recordingTimeSec;
		recordingTimeSec += FRAME_DURATION;

		recorder
			.captureFrame(frameTimestamp, FRAME_DURATION)
			.catch((err) => console.error('captureFrame error:', err));

		return isAnimating;
	};

	/**
	 * Main scene drawing function
	 */
	const drawScene = () => {
		// Show loading screen if still loading
		if (isLoading) {
			if (skCanvas && ck && surface) {
				drawLoadingScreen(createLoadingContext(), performance.now());
				// Continue animation loop if loading
				requestAnimationFrame(drawScene);
			}
			return;
		}

		if (!skCanvas || !ck || !paints || !lowOpacityPaint || !pageBounds || !fontMgr || !page) return;

		validateSelectedShape();

		try {
			const baseContext = createRenderContext();
			const now = performance.now();

			// Check for visible images to lazy load
			checkVisibleImages();

			// Always render the main scene
			const isAnimating = renderScene(baseContext, scheduleDraw, now);
			const animationsJustCompleted = wasAnimating && !isAnimating;

			if (isAutoPlaying && animationsJustCompleted && document && document.pages.length > 0) {
				const nextPageIndex = (currentPageIndex + 1) % document.pages.length;

				switchToPage(nextPageIndex);
			}

			wasAnimating = isAnimating;

			// Draw text editor overlay on top
			drawTextEditorOverlay();
		} catch (error) {
			console.error('Error rendering scene:', error);
		}
	};

	$: if (activeTextEditor && cameraState) {
		activeTextEditor.updateLayout(cameraState);
	}

	const drawTextEditorOverlay = () => {
		if (!activeTextEditor || !skCanvas || !ck || !cameraState) return;

		const cursorRect = activeTextEditor.getCursorRect();

		if (cursorRect) {
			skCanvas.save();

			// Apply camera transformations
			skCanvas.scale(devicePixelRatioValue, devicePixelRatioValue);
			skCanvas.translate(cameraState.panX, cameraState.panY);
			skCanvas.scale(cameraState.zoom, cameraState.zoom);

			if (selectedShape.index !== INVALID_INDEX) {
				const shape = shapes[selectedShape.index];

				if (shape.kind === 'text') {
					const center = getShapeCenter(shape);

					// Apply shape rotation
					if (shape.rotate) {
						skCanvas.translate(center.x, center.y);
						skCanvas.rotate(shape.rotate, 0, 0);
						skCanvas.translate(-center.x, -center.y);
					}

					// Translate to shape position (top-left)
					skCanvas.translate(shape.x, shape.y);

					// Draw cursor
					const paint = new ck.Paint();
					paint.setColor(ck.WHITE); // Black cursor
					paint.setStyle(ck.PaintStyle.Fill);

					// Cursor rect is [left, top, right, bottom]
					// We might want to make it a bit wider or ensure it's visible
					skCanvas.drawRect(cursorRect, paint);
					paint.delete();
				}
			}

			skCanvas.restore();
		}

		// Flush to ensure cursor is visible
		if (surface) {
			surface.flush();
		}
	};

	// ==================== Event Handlers ====================

	const createEventContext = () => createEventHandlerContext();

	const handleWheelEvent = (event: WheelEvent) => handleWheel(event, createEventContext());
	const handleMouseMoveEvent = (event: MouseEvent) =>
		handleMouseMove(event, createEventContext(), hoverCheckTimeout);
	const handleMouseDownEvent = (event: MouseEvent) => handleMouseDown(event, createEventContext());
	const handleMouseUpEvent = (event: MouseEvent) => handleMouseUp(event, createEventContext());
	const handleMouseLeaveEvent = (event: MouseEvent) =>
		handleMouseLeave(event, createEventContext(), hoverCheckTimeout);
	const handleKeyDownEvent = (event: KeyboardEvent) => handleKeyDown(event, createEventContext());
	const handleKeyUpEvent = (event: KeyboardEvent) => handleKeyUp(event, createEventContext());

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
	 * Updates shapes hash and returns true if it changed
	 */
	const updateShapesHash = (): boolean => {
		const newHash = generateShapesHash(shapes);
		const hashChanged = newHash !== shapesHash;
		shapesHash = newHash;
		return hashChanged;
	};

	/**
	 * Captures thumbnail and stores it in the page object
	 */
	const captureAndStoreThumbnail = async () => {
		if (isCapturingThumbnail || !page || !document || !ck || !fontMgr) {
			return;
		}

		const currentPage = page;
		const currentDocument = document;

		// Wait for next render frame to ensure content is rendered
		requestAnimationFrame(() => {
			requestAnimationFrame(async () => {
				if (!currentPage || !currentDocument || !ck || !fontMgr) return;

				isCapturingThumbnail = true;
				try {
					const thumbnailContext = {
						ck,
						page: currentPage,
						pageBounds: pageBounds!,
						shapes,
						paints: paints!,
						fontMgr
					};

					const dataUrl = await captureThumbnailLocal(thumbnailContext);
					if (dataUrl) {
						const { document: updatedDocument, page: updatedPage } = updatePageThumbnail(
							currentDocument,
							currentPage,
							dataUrl
						);
						document = updatedDocument;
						page = updatedPage;
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
			return;
		}

		if (thumbnailCaptureTimeout !== null) {
			clearTimeout(thumbnailCaptureTimeout);
		}

		const delay = getThumbnailCaptureDelay(!!page.thumbnailUrl);
		thumbnailCaptureTimeout = window.setTimeout(() => {
			captureAndStoreThumbnail();
			thumbnailCaptureTimeout = null;
		}, delay);
	};

	// Watch for shape changes and schedule thumbnail capture
	$: if (isInitialized && page && shapes.length > 0) {
		const currentHash = generateShapesHash(shapes);
		if (currentHash !== shapesHash) {
			shapesHash = currentHash;
			scheduleThumbnailCapture();
		}
	}

	// Start background thumbnail processing when document is loaded or when pages change
	$: if (isInitialized && document && document.pages.length > 0 && ck && fontMgr) {
		// Check if there are pages needing thumbnails
		const pagesNeedingThumbnails = document.pages.filter(
			(p) => !p.thumbnailUrl && p.shapes.length > 0
		);

		// Only trigger background processing if there are pages that need thumbnails
		// and we haven't started processing yet, or if new pages were added
		if (pagesNeedingThumbnails.length > 0 && !backgroundThumbnailsStarted) {
			backgroundThumbnailsStarted = true;
			scheduleBackgroundThumbnailProcessing(ck, fontMgr, document, (updatedDocument) => {
				document = updatedDocument;
				// Reset flag after processing completes to allow re-processing if needed
				backgroundThumbnailsStarted = false;
			});
		}
	}

	// Architecture Modal
	let showArchitectureModal = false;
</script>

<div class="flex h-screen">
	<div class="w-[280px] flex flex-col justify-between overflow-y-auto px-5 py-5 custom-scrollbar">
		<!-- WebSocket Debug -->
		<div class="space-y-3">
			<button
				class="w-full px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded border border-zinc-700 transition-colors mb-10 h-[36px]"
				on:click={() => (showArchitectureModal = true)}
			>
				Architecture & Tech Stack
			</button>
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
					class="max-h-64 overflow-y-auto rounded-lg bg-zinc-950/50 border border-zinc-800 p-3 space-y-1.5 custom-scrollbar"
				>
					{#if wsMessages.length === 0}
						<div class="text-xs text-zinc-600 italic text-center py-4">No messages yet</div>
					{:else}
						{#each wsMessages.reverse() as m, i (i)}
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

			<!-- Multiplayer Note -->
			<div
				class="text-[12px] text-zinc border border-sky-800/30 rounded px-2 py-1.5 leading-relaxed"
			>
				💡 <span class="text-zinc-700"
					>Open two browser tabs to observe the multiplayer update and synchronization event.</span
				>
			</div>
		</div>
		<div class="mb-4">
			<h3 class="block text-xs font-medium text-zinc-400 uppercase mb-2">Actions</h3>

			<div class="mb-2">
				<div class="text-xs text-zinc-500 mb-1">Load Document</div>
				<div class="flex gap-1">
					<button
						class="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] rounded border border-zinc-700 transition-colors"
						on:click={() => loadDocument('1')}
					>
						Doc 1
					</button>
					<!-- <button
						class="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] rounded border border-zinc-700 transition-colors"
						on:click={() => loadDocument('2')}
					>
						Doc 2
					</button> -->
				</div>
			</div>

			<div class="mb-2">
				<label class="text-xs text-zinc-500 block mb-1">
					Audio Track (Optional)
					<select
						class="mt-1 text-xs w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-300 focus:border-sky-500 focus:outline-none h-[36px]"
						value={selectedAudioUrl}
						on:change={handleAudioSelect}
					>
						<option value="">Select audio...</option>
						{#each audioOptions as option}
							<option value={option.url}>{option.name}</option>
						{/each}
					</select>
				</label>
			</div>

			<div class="mb-3">
				<div class="text-xs text-zinc-500 mb-1">Resolution</div>
				<div class="flex flex-wrap gap-1">
					<button
						type="button"
						class="px-2 py-1 rounded text-[11px] border transition-colors w-[56px] {exportResolution ===
						'720p'
							? 'bg-sky-600 text-white border-sky-500'
							: 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-sky-500'}"
						on:click={() => (exportResolution = '720p')}
					>
						720p
					</button>
					<button
						type="button"
						class="px-2 py-1 rounded text-[11px] border transition-colors w-[56px] {exportResolution ===
						'1080p'
							? 'bg-sky-600 text-white border-sky-500'
							: 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-sky-500'}"
						on:click={() => (exportResolution = '1080p')}
					>
						1080p
					</button>
					<button
						type="button"
						class="px-2 py-1 rounded text-[11px] border transition-colors w-[56px] {exportResolution ===
						'2k'
							? 'bg-sky-600 text-white border-sky-500'
							: 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-sky-500'}"
						on:click={() => (exportResolution = '2k')}
					>
						2K
					</button>
				</div>
			</div>

			<button
				class="w-full px-3 py-2 rounded-md flex items-center justify-center gap-2 h-[36px] {isRecording ||
				isExporting
					? 'bg-zinc-600 cursor-not-allowed opacity-80'
					: 'bg-sky-600 hover:bg-sky-500 active:bg-sky-700'} text-xs font-medium text-white transition-colors duration-150 shadow-sm hover:shadow"
				on:click={toggleRecording}
				disabled={isRecording || isExporting}
			>
				{#if isRecording || isExporting}
					<svg
						class="animate-spin h-4 w-4 text-white"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
					>
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
					<span>
						{#if isExporting}
							Saving...
						{:else}
							Exporting... {exportProgress}% (Page {exportCurrentPage}/{exportTotalPages})
						{/if}
					</span>
				{:else}
					Export Canvas to Video
				{/if}
			</button>

			<!-- Progress Bar -->
			{#if isRecording}
				<div class="w-full mt-2 bg-zinc-800 rounded-full h-2 overflow-hidden">
					<div
						class="bg-sky-500 h-full transition-all duration-300 ease-out"
						style="width: {exportProgress}%"
					></div>
				</div>
				<div class="text-xs text-zinc-400 mt-1 text-center">
					Page {exportCurrentPage} of {exportTotalPages} • {exportProgress}% complete
				</div>
			{/if}
		</div>
	</div>

	<div class="flex flex-col flex-1 overflow-hidden">
		<!-- Main Canvas Area -->
		<div
			class="editor flex-1 overflow-hidden bg-zinc-100 relative"
			style="cursor: {canvasCursor}"
			bind:this={editor}
		>
			<canvas id="canvas" bind:this={canvas}></canvas>
			<!-- Overlay canvas for drag and drop rendering -->
			<canvas
				bind:this={overlayCanvas}
				class="absolute top-0 left-0 w-full h-full"
				style="pointer-events: none;"
			></canvas>
		</div>

		<!-- Hidden Recording Canvas -->
		<canvas
			bind:this={recordingCanvas}
			class="fixed top-0 left-0 opacity-0 pointer-events-none -z-50"
		></canvas>

		<!-- Hidden Audio Element -->
		<audio bind:this={audioElement} src={selectedAudioUrl} preload="auto" class="hidden"></audio>

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
								class="relative w-32 h-24 rounded border-2 transition-all overflow-hidden {currentPageIndex ===
								i
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

<Modal
	title="Architecture & Tech Stack"
	isOpen={showArchitectureModal}
	on:close={() => (showArchitectureModal = false)}
>
	<ArchitectureContent />
</Modal>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 6px;
	}

	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}

	.custom-scrollbar::-webkit-scrollbar-thumb {
		background-color: rgba(63, 63, 70, 0.5); /* zinc-700 with opacity */
		border-radius: 3px;
	}

	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background-color: rgba(82, 82, 91, 0.8); /* zinc-600 with opacity */
	}
</style>
