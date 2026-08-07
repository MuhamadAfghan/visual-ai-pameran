import { spawn } from "node:child_process";

const CAPTURE_TIMEOUT_MS = 15_000;

/**
 * Reads the pixel dimensions of a JPEG buffer from its SOF marker.
 * Used to normalize detection bboxes against the analyzed frame size.
 */
export function readJpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // SOF0–SOF15 carry frame dimensions; skip DHT(c4)/JPG(c8)/DAC(cc) + RSTn/markers without length.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // standalone markers, no length field
      continue;
    }
    i += 2 + buf.readUInt16BE(i + 2); // skip this segment
  }
  return null;
}

/**
 * Captures a single JPEG frame from an RTSP stream (or local file) using ffmpeg.
 * Requires ffmpeg to be installed and available in PATH.
 *
 * @throws Error if ffmpeg is not found, stream is unreachable, or timeout exceeded
 */
export function captureRtspFrame(rtspUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    // -rtsp_transport is an RTSP-demuxer option; passing it for a local file
    // input makes ffmpeg abort with "Option rtsp_transport not found".
    const isRtsp = /^rtsps?:\/\//i.test(rtspUrl);
    const inputArgs = isRtsp ? ["-rtsp_transport", "tcp"] : [];

    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-loglevel", "error",
        ...inputArgs,
        "-i", rtspUrl,
        "-vframes", "1",
        "-f", "image2",
        "-vcodec", "mjpeg",
        "-q:v", "2",
        "pipe:1"
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ffmpeg.kill();
      reject(new Error(`RTSP capture timeout after ${CAPTURE_TIMEOUT_MS}ms: ${rtspUrl}`));
    }, CAPTURE_TIMEOUT_MS);

    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    ffmpeg.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        const detail = stderrChunks.length > 0
          ? Buffer.concat(stderrChunks).toString().trim().split("\n").at(-1)
          : `exit code ${code}`;
        reject(new Error(`ffmpeg: ${detail}`));
      }
    });

    ffmpeg.on("error", (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(new Error(`ffmpeg process error: ${err.message}`));
    });
  });
}
