<script lang="ts">
	import { ARCHITECTURE_DATA } from '$lib/constants/architecture';
</script>

<div class="space-y-10 pb-6">
	<!-- Intro -->
	<div class="relative">
		<div
			class="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-sky-500 to-purple-600 rounded-full"
		></div>
		<p class="text-zinc-300 text-base leading-relaxed pl-4">
			{@html ARCHITECTURE_DATA.intro.replace(
				/\*\*(.*?)\*\*/g,
				'<span class="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-purple-400 font-bold">$1</span>'
			)}
		</p>
	</div>

	<!-- Features Grid -->
	<section class="mb-4">
		<h3 class="text-xl font-bold text-zinc-100 mb-6 flex items-center gap-3">
			<span class="p-2 rounded-lg bg-sky-500/10 text-sky-400">✨</span>
			<span class="bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent"
				>Key Features</span
			>
		</h3>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			{#each ARCHITECTURE_DATA.features.filter((f) => f.title !== '⚡ Real-time & Backend') as feature}
				<div
					class="group relative bg-zinc-900/40 rounded-xl p-5 border border-zinc-800/60 hover:border-sky-500/30 transition-all duration-300 hover:bg-zinc-900/60 hover:shadow-lg hover:shadow-sky-900/10"
				>
					<div
						class="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"
					></div>
					<h4
						class="relative text-zinc-100 font-semibold mb-4 text-sm tracking-wide uppercase border-b border-zinc-800/50 pb-2 group-hover:border-sky-500/30 transition-colors"
					>
						{feature.title}
					</h4>
					<ul class="relative space-y-3">
						{#each feature.items as item}
							<li class="text-xs text-zinc-400 leading-relaxed">
								<span
									class="text-sky-400 font-medium block mb-0.5 text-sm group-hover:text-sky-300 transition-colors"
									>{item.label}</span
								>
								{item.description}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>

	<!-- Real-time & Backend Highlight Card -->
	<section>
		<div
			class="group relative bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 rounded-2xl p-6 border border-zinc-800/60 hover:border-sky-500/40 transition-all duration-500 hover:shadow-2xl hover:shadow-sky-900/20 overflow-hidden"
		>
			<!-- Background gradient effect -->
			<div
				class="absolute inset-0 bg-gradient-to-br from-sky-500/5 via-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
			></div>

			<!-- Content -->
			<div class="relative z-10">
				<!-- Header -->
				<div class="flex items-center gap-3 mb-6">
					<div class="p-2.5 rounded-xl bg-gradient-to-br from-sky-500/20 to-purple-500/20">
						<span class="text-2xl">⚡</span>
					</div>
					<h3
						class="text-xl font-bold bg-gradient-to-r from-zinc-100 to-zinc-300 bg-clip-text text-transparent uppercase tracking-wide"
					>
						Real-time & Backend
					</h3>
				</div>

				<!-- Feature Cards -->
				<div class="space-y-4">
					{#each ARCHITECTURE_DATA.features.find((f) => f.title === '⚡ Real-time & Backend')?.items || [] as item}
						<div class="group/item">
							<h4
								class="text-sky-400 font-semibold mb-1.5 text-base group-hover/item:text-sky-300 transition-colors"
							>
								{item.label}
							</h4>
							<p class="text-zinc-400 text-sm leading-relaxed pl-0">
								{item.description}
							</p>
						</div>
					{/each}
				</div>
			</div>

			<!-- Decorative corner accent -->
			<div
				class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-sky-500/10 to-transparent rounded-bl-full opacity-50 group-hover:opacity-100 transition-opacity"
			></div>
		</div>
	</section>

	<!-- Architecture Diagram -->
	<section>
		<h3 class="text-xl font-bold text-zinc-100 mb-6 flex items-center gap-3">
			<span class="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">🏗️</span>
			<span class="bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent"
				>Architecture</span
			>
		</h3>

		<!-- Architecture Image -->
		<div
			class="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900/30 shadow-2xl mb-6 group hover:border-emerald-500/30 transition-all duration-300"
		>
			<div class="p-6 relative">
				<div
					class="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
				></div>
				<img
					src="/architect.png"
					alt="System Architecture Diagram"
					class="w-full h-auto rounded-lg relative z-10"
				/>
			</div>
		</div>

		<div class="bg-zinc-900/30 rounded-xl p-5 border border-zinc-800/50 backdrop-blur-sm">
			<h4 class="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
				<span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
				{ARCHITECTURE_DATA.architecture.protocol.title}
			</h4>
			<p class="text-xs text-zinc-400 mb-4 leading-relaxed">
				{@html ARCHITECTURE_DATA.architecture.protocol.description.replace(
					/\*\*(.*?)\*\*/g,
					'<span class="text-zinc-300 font-medium">$1</span>'
				)}
			</p>
			<ul class="space-y-2">
				{#each ARCHITECTURE_DATA.architecture.protocol.steps as step}
					<li class="text-xs text-zinc-400 flex gap-3 items-start">
						<span class="text-zinc-700 mt-1">➜</span>
						<span class="leading-relaxed">
							{@html step.replace(
								/\*\*(.*?)\*\*/g,
								'<span class="text-sky-400 font-medium bg-sky-950/30 px-1 rounded">$1</span>'
							)}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<!-- Performance -->
	<section>
		<h3 class="text-xl font-bold text-zinc-100 mb-6 flex items-center gap-3">
			<span class="p-2 rounded-lg bg-amber-500/10 text-amber-400">⚡</span>
			<span class="bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent"
				>Performance</span
			>
		</h3>
		<div class="grid gap-4">
			{#each ARCHITECTURE_DATA.performance as item}
				<div
					class="group p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/50 hover:border-amber-500/30 hover:bg-zinc-900/50 transition-all duration-300"
				>
					<h4 class="text-sm font-semibold text-zinc-200 mb-2 flex items-center gap-2">
						{item.title}
					</h4>
					<p
						class="text-xs text-zinc-400 leading-relaxed group-hover:text-zinc-300 transition-colors"
					>
						{@html item.content
							.replace(/\*\*(.*?)\*\*/g, '<span class="text-zinc-200 font-medium">$1</span>')
							.replace(
								/`(.*?)`/g,
								'<code class="bg-zinc-800/80 px-1.5 py-0.5 rounded text-amber-200/90 font-mono text-[10px] border border-zinc-700">$1</code>'
							)}
					</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Tech Stack -->
	<section>
		<h3 class="text-xl font-bold text-zinc-100 mb-6 flex items-center gap-3">
			<span class="p-2 rounded-lg bg-purple-500/10 text-purple-400">🛠️</span>
			<span class="bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent"
				>Tech Stack</span
			>
		</h3>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
			<!-- Frontend -->
			<div class="space-y-4">
				<h4 class="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-1">Frontend</h4>
				<div class="grid gap-2.5">
					{#each ARCHITECTURE_DATA.techStack.frontend as item}
						<a
							href={item.link || undefined}
							target="_blank"
							class="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/80 {item.link
								? 'hover:border-sky-500/40 hover:bg-zinc-800 hover:shadow-md hover:shadow-sky-900/10 cursor-pointer group'
								: ''} transition-all duration-200"
						>
							<span
								class="text-sm text-zinc-300 font-medium group-hover:text-sky-400 transition-colors"
								>{item.name}</span
							>
							{#if item.description}
								<span
									class="text-[10px] uppercase tracking-wide text-zinc-500 font-medium bg-zinc-950/50 px-2 py-0.5 rounded border border-zinc-800/50"
									>{item.description}</span
								>
							{/if}
						</a>
					{/each}
				</div>
			</div>

			<!-- Backend -->
			<div class="space-y-4">
				<h4 class="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-1">Backend</h4>
				<div class="grid gap-2.5">
					{#each ARCHITECTURE_DATA.techStack.backend as item}
						<a
							href={item.link || undefined}
							target="_blank"
							class="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/80 {item.link
								? 'hover:border-emerald-500/40 hover:bg-zinc-800 hover:shadow-md hover:shadow-emerald-900/10 cursor-pointer group'
								: ''} transition-all duration-200"
						>
							<span
								class="text-sm text-zinc-300 font-medium group-hover:text-emerald-400 transition-colors"
								>{item.name}</span
							>
							{#if item.description}
								<span
									class="text-[10px] uppercase tracking-wide text-zinc-500 font-medium bg-zinc-950/50 px-2 py-0.5 rounded border border-zinc-800/50"
									>{item.description}</span
								>
							{/if}
						</a>
					{/each}
				</div>
			</div>
		</div>
	</section>
</div>
