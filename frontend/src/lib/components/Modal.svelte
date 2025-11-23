<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let title: string = '';
	export let isOpen: boolean = false;

	const dispatch = createEventDispatcher();

	function close() {
		dispatch('close');
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isOpen) {
			close();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
		role="dialog"
		aria-modal="true"
	>
		<!-- Backdrop -->
		<div
			class="fixed inset-0 bg-zinc-950/90 backdrop-blur-md transition-opacity"
			on:click={close}
			on:keydown={(e) => e.key === 'Enter' && close()}
			role="button"
			tabindex="0"
			aria-label="Close modal"
		></div>

		<!-- Modal Panel -->
		<div
			class="relative w-full max-w-3xl transform overflow-hidden rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl shadow-black/80 transition-all flex flex-col max-h-[85vh] ring-1 ring-white/5"
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between px-6 py-5 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80 sticky top-0 z-10"
			>
				<h3 class="text-base font-semibold text-zinc-100 tracking-tight">{title}</h3>
				<button
					type="button"
					class="rounded-lg p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all focus:outline-none focus:ring-2 focus:ring-sky-500"
					on:click={close}
				>
					<span class="sr-only">Close</span>
					<svg
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="px-6 py-6 overflow-y-auto text-zinc-300 text-sm leading-relaxed custom-scrollbar">
				<slot />
			</div>

			<!-- Footer (Optional) -->
			<div
				class="px-6 py-4 bg-zinc-900/95 border-t border-zinc-800 flex justify-end sticky bottom-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-zinc-900/75"
			>
				<button
					type="button"
					class="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold rounded-lg shadow-sm transition-all hover:shadow-md active:scale-95"
					on:click={close}
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}

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
