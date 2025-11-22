import {
    Output,
    Mp4OutputFormat,
    CanvasSource,
    AudioBufferSource,
    BufferTarget,
    QUALITY_HIGH,
    QUALITY_MEDIUM
} from 'mediabunny';

export class VideoRecorder {
    private output: Output | null = null;
    private target: BufferTarget | null = null;
    private videoSource: CanvasSource | null = null;
    private audioSource: AudioBufferSource | null = null;
    private audioBuffer: AudioBuffer | null = null;

    /**
     * Prepares the recording.
     */
    async prepare(canvas: HTMLCanvasElement, width: number, height: number, audioFile?: Blob) {
        // 1. Decode Audio (if any)
        this.audioBuffer = null;
        if (audioFile) {
            const audioContext = new AudioContext();
            const arrayBuffer = await audioFile.arrayBuffer();
            this.audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            audioContext.close();
        }


        // 2. Initialize MediaBunny Output
        this.target = new BufferTarget();
        this.output = new Output({
            format: new Mp4OutputFormat(),
            target: this.target
        });

        // 3. Setup Video Track with CanvasSource
        // Note: We don't start a "stream" here. We will feed frames manually.
        const videoConfig = {
            codec: 'avc' as const,
            bitrate: QUALITY_HIGH,
            width: width,
            height: height,
            // keyFrameInterval: 2 // Optional, default is 5s
        };

        this.videoSource = new CanvasSource(canvas, videoConfig);
        this.output.addVideoTrack(this.videoSource);

        // 4. Setup Audio Track (if any)
        if (this.audioBuffer) {
            const audioConfig = {
                codec: 'aac' as const,
                bitrate: QUALITY_MEDIUM,
                sampleRate: this.audioBuffer.sampleRate,
                numberOfChannels: this.audioBuffer.numberOfChannels
            };
            this.audioSource = new AudioBufferSource(audioConfig);
            this.output.addAudioTrack(this.audioSource);
        }
    }

    /**
     * Starts the encoding process.
     */
    async start() {
        if (!this.output) return;
        await this.output.start();
    }

    /**
     * Captures a frame from the canvas at the given timestamp.
     * @param timestamp Time in seconds
     * @param duration Duration of this frame in seconds
     */
    async captureFrame(timestamp: number, duration: number) {
        if (!this.videoSource) return;
        await this.videoSource.add(timestamp, duration);
    }

    async stop(duration?: number): Promise<Blob> {
        if (!this.output) return new Blob([], { type: 'video/mp4' });

        // Add audio if available, trimmed to duration
        if (this.audioSource && this.audioBuffer) {
            let bufferToAdd = this.audioBuffer;

            if (duration !== undefined && duration > 0) {
                const sampleRate = this.audioBuffer.sampleRate;
                const targetLength = Math.floor(duration * sampleRate);

                if (targetLength < this.audioBuffer.length) {
                    const newBuffer = new AudioBuffer({
                        length: targetLength,
                        numberOfChannels: this.audioBuffer.numberOfChannels,
                        sampleRate: sampleRate
                    });

                    for (let i = 0; i < this.audioBuffer.numberOfChannels; i++) {
                        const oldData = this.audioBuffer.getChannelData(i);
                        const newData = newBuffer.getChannelData(i);
                        newData.set(oldData.subarray(0, targetLength));
                    }
                    bufferToAdd = newBuffer;
                }
            }

            await this.audioSource.add(bufferToAdd).catch((e) => console.error('Audio encoding error:', e));
        }

        await this.output.finalize();
        const buffer = this.target?.buffer ?? new ArrayBuffer(0);
        const blob = new Blob([buffer], { type: 'video/mp4' });

        this.cleanup();
        return blob;
    }

    private cleanup() {
        this.output = null;
        this.target = null;
        this.videoSource = null;
        this.audioSource = null;
        this.audioBuffer = null;
    }
}
