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
		'A high-performance web graphics editor built with **CanvasKit-WASM (Skia)** and **SvelteKit**, powered by a **WebSocket-based** backend. Designed as a modern WebGL and WebAssembly application, the project showcases how to implement a professional, real-time design environment with advanced rendering, keyframe animation, and high-quality video export.',
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
			{ name: 'Tailwind CSS', description: 'Utility-first Styling' },
		],
		backend: [
			{ name: 'FastAPI', description: 'High-performance Python API', link: 'https://fastapi.tiangolo.com/' },
			{ name: 'SQLite', description: 'Database via SQLAlchemy' },
			{ name: 'Websockets', description: 'Real-time Communication' },
			{ name: 'Python 3.x', description: 'Server Language' }
		]
	},
	architecture: {
		diagram: '+-----------------------------------------------------------+\\n|                  Client (Frontend / Browser)              |\\n|                                                           |\\n|   +----------------+       +------------------------+     |\\n|   |  SvelteKit UI  | ----> |   CanvasKit Engine     |     |\\n|   +----------------+       | (WASM Graphics Core)   |     |\\n|           |                +-----------+------------+     |\\n|           |                            |                  |\\n|           v                            v                  |\\n|   +----------------+       +------------------------+     |\\n|   | WebSocket Client|      |     Video Recorder     |     |\\n|   +-------+--------+       +------------------------+     |\\n|           |                            |                  |\\n|           v                            v                  |\\n|   +-------------------------------------------------+     |\\n|   |                 SQLite Database                 |     |\\n|   +-------------------------------------------------+     |\\n|                                                           |\\n|                   Server (Backend / Python)               |\\n+-----------------------------------------------------------+',
		protocol: {
			title: 'Communication Protocol',
			description:
				'The project uses a custom **Binary WebSocket Protocol** to handle complex data structures efficiently:',
			steps: [
				'**Header**: 4 bytes indicating the length of the JSON metadata.',
				'**JSON Payload**: UTF-8 encoded JSON string containing event details and document structure.',
				'**Blobs**: Sequence of binary blobs (images, audio) with their lengths, allowing single-message transfer.'
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
