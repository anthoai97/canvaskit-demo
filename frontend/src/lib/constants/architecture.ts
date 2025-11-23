export interface TechStackItem {
	name: string;
	description?: string;
	link?: string;
}

export interface FeatureItem {
	title: string;
	items: { label: string; description: string }[];
}

export interface ProtocolSection {
	title: string;
	description: string;
	steps: string[];
}

export interface ArchitectureSection {
	diagram: string;
	protocol: ProtocolSection;
}

export interface PerformanceItem {
	title: string;
	content: string;
}

export interface ArchitectureData {
	intro: string;
	features: FeatureItem[];
	techStack: {
		frontend: TechStackItem[];
		backend: TechStackItem[];
	};
	architecture: ArchitectureSection;
	performance: PerformanceItem[];
}

export const ARCHITECTURE_DATA: ArchitectureData = {
	intro:
		'A fast, WebSocket-driven web graphics editor demo using **CanvasKit-WASM (Skia)**, designed to utilize WebGL and WebAssembly for advanced rendering, keyframe animation, and high-quality video output.',
	features: [
		{
			title: '🎨 Rich Graphics Editor',
			items: [
				{
					label: 'High-Performance Rendering',
					description:
						'Powered by CanvasKit (WebAssembly version of Skia), providing native-like drawing performance.'
				},
				{
					label: 'Shape Manipulation',
					description: 'Create, move, resize, and rotate shapes, text, and images with precision.'
				},
				{
					label: 'Multi-page Support',
					description: 'Seamless switching between multiple pages within a document.'
				},
				{
					label: 'Zoom & Pan',
					description: 'Infinite canvas navigation with smooth camera controls.'
				}
			]
		},
		{
			title: '🎬 Animation & Video Export',
			items: [
				{
					label: 'Animation Engine',
					description: 'Support for animated properties on shapes (position, scale, rotation, etc.).'
				},
				{
					label: 'Video Recording',
					description:
						'Export your canvas animations directly to video files (WebM/MP4) with synchronized audio.'
				},
				{
					label: 'Off-screen Rendering',
					description:
						'Uses dedicated off-screen surfaces for rendering video frames to ensure high quality without affecting the UI.'
				}
			]
		},
		{
			title: '⚡ Real-time & Backend',
			items: [
				{
					label: 'Binary WebSocket Protocol',
					description:
						'Custom binary protocol for efficient bi-directional communication, optimizing the transfer of JSON data alongside binary assets.'
				},
				{
					label: 'Multiplayer Sync',
					description:
						'Real-time broadcast of updates to all connected clients, enabling collaborative editing with automatic conflict resolution.'
				},
				{
					label: 'Persistence',
					description: 'Saves documents, pages, and assets to a SQLite database.'
				},
				{
					label: 'Thumbnail Generation',
					description:
						'Automatically generates and caches thumbnails for pages using a background rendering process.'
				}
			]
		}
	],
	techStack: {
		frontend: [
			{ name: 'SvelteKit', description: 'Svelte 5 Framework', link: 'https://kit.svelte.dev/' },
			{
				name: 'CanvasKit-WASM',
				description: 'Skia Graphics Engine - WebGL',
				link: 'https://skia.org/docs/user/modules/canvaskit/'
			},
			{ name: 'Mediabunny', description: 'Video Recording', link: 'https://mediabunny.dev/' },
			{ name: 'Tailwind CSS', description: 'Utility-first Styling' }
		],
		backend: [
			{
				name: 'FastAPI',
				description: 'High-performance Python API',
				link: 'https://fastapi.tiangolo.com/'
			},
			{ name: 'SQLite', description: 'Database via SQLAlchemy' },
			{ name: 'Websockets', description: 'Real-time Communication' },
			{ name: 'Python 3.x', description: 'Server Language' }
		]
	},
	architecture: {
		diagram:
			'+-----------------------------------------------------------+\\n|                  Client A (Browser)                       |\\n|   +----------------+       +------------------------+     |\\n|   |  SvelteKit UI  | ----> |   CanvasKit Engine     |     |\\n|   +----------------+       | (WASM Graphics Core)   |     |\\n|           |                +------------------------+     |\\n|           | (1) User Action                               |\\n|           v                                               |\\n|   +-------------------+                                   |\\n|   | WebSocket Client  |                                   |\\n|   +---------+---------+                                   |\\n|             |                                             |\\n|             | (2) Send Update                             |\\n+-------------+---------------------------------------------+\\n              |\\n              v\\n+-----------------------------------------------------------+\\n|                   Server (Backend / Python)               |\\n|                                                           |\\n|   +---------------------------------------------------+   |\\n|   |              WebSocket Manager                    |   |\\n|   |  - Receive updates from clients                   |   |\\n|   |  - Broadcast to all connected clients             |   |\\n|   |  - Manage multiplayer sessions                    |   |\\n|   +------------------------+--------------------------+   |\\n|                            |                              |\\n|                            | (3) Persist                  |\\n|                            v                              |\\n|   +---------------------------------------------------+   |\\n|   |              SQLite Database                      |   |\\n|   |  - Documents, Pages, Assets                       |   |\\n|   +---------------------------------------------------+   |\\n|                            |                              |\\n|                            | (4) Broadcast                |\\n+----------------------------+------------------------------+\\n              |                            |\\n              v                            v\\n+---------------------------+  +---------------------------+\\n|     Client B (Browser)    |  |     Client C (Browser)    |\\n|   +-------------------+   |  |   +-------------------+   |\\n|   | WebSocket Client  |   |  |   | WebSocket Client  |   |\\n|   +---------+---------+   |  |   +---------+---------+   |\\n|             |             |  |             |             |\\n|             | (5) Receive |  |             | (5) Receive |\\n|             v             |  |             v             |\\n|   +-------------------+   |  |   +-------------------+   |\\n|   |  SvelteKit UI     |   |  |   |  SvelteKit UI     |   |\\n|   |  (Auto-Update)    |   |  |   |  (Auto-Update)    |   |\\n|   +-------------------+   |  |   +-------------------+   |\\n+---------------------------+  +---------------------------+',
		protocol: {
			title: 'Real-time Multiplayer Sync Protocol',
			description:
				'The project uses a **Binary WebSocket Protocol** with real-time broadcast for multiplayer collaboration:',
			steps: [
				'**Message Format**: Binary frames with 4-byte header (JSON length) + UTF-8 JSON payload + optional binary blobs.',
				'**Update Events**: Shape modifications, page changes, and asset uploads are sent as structured events.',
				'**Broadcast Mechanism**: Server receives updates from any client and broadcasts to all connected clients in the same session.',
				'**Sync Flow**: (1) User edits → (2) Client sends update → (3) Server persists to DB → (4) Server broadcasts → (5) All clients receive and apply changes.',
				'**Conflict Resolution**: Last-write-wins strategy with server timestamp authority.',
				'**Binary Optimization**: Images and assets are transferred as raw bytes (no Base64), reducing overhead by ~33%.'
			]
		}
	},
	performance: [
		{
			title: '🚀 WebAssembly (WASM)',
			content:
				'By using **CanvasKit**, the application bypasses the standard HTML5 Canvas 2D API limitations. It uses **Skia**, the same graphics engine that powers Google Chrome, compiled to WebAssembly.'
		},
		{
			title: '📦 Binary Data Transfer',
			content:
				"Traditional REST APIs often struggle with mixed content. This project's **WebSocket Binary Protocol** eliminates Base64 encoding overhead (which increases size by ~33%) by streaming raw bytes."
		},
		{
			title: '🎞️ Dedicated Rendering Pipelines',
			content:
				'Uses a separate Surface and Canvas to render frames at target resolutions (720p/1080p/2K) independent of the screen resolution.'
		}
	]
};
