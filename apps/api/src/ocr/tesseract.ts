/**
 * Tier 2 — self-hosted Tesseract (plan.md §16: "₹0, ~2 s").
 *
 * The worker is created lazily and then reused: starting one costs about a
 * second and loads a language model, which is far too much to pay per upload.
 * A Tesseract worker handles exactly one recognition at a time, so calls are
 * serialised through a promise chain instead of racing on shared state.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import { logger } from '../config/logger';

const LANGUAGE = process.env.OCR_LANG ?? 'eng';

/**
 * Where the ~5 MB language model is cached. Left to itself tesseract.js drops
 * `eng.traineddata` into the process's working directory, which means a stray
 * blob in the repo and a re-download for every different cwd.
 */
const CACHE_PATH =
  process.env.OCR_CACHE_PATH ??
  join(
    dirname(createRequire(import.meta.url).resolve('tesseract.js/package.json')),
    '..',
    '.cache',
    'tesseract',
  );

let worker: Promise<Worker> | null = null;
let tail: Promise<unknown> = Promise.resolve();

function getWorker(): Promise<Worker> {
  worker ??= (async () => {
    mkdirSync(CACHE_PATH, { recursive: true });
    return createWorker(LANGUAGE, undefined, { cachePath: CACHE_PATH });
  })().catch((err: unknown) => {
    worker = null; // a failed start must not poison every later upload
    throw err;
  });
  return worker;
}

/** Queue a job behind whatever is already running, success or failure. */
function serialise<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job);
  tail = run.catch(() => undefined);
  return run;
}

export interface Recognition {
  text: string;
  /** Mean per-page confidence, 0–1. */
  confidence: number;
}

export async function recognize(images: readonly Buffer[]): Promise<Recognition> {
  if (images.length === 0) return { text: '', confidence: 0 };

  const texts: string[] = [];
  const confidences: number[] = [];

  for (const image of images) {
    const { data } = await serialise(async () => {
      const w = await getWorker();
      return w.recognize(image);
    });
    texts.push(data.text);
    confidences.push(data.confidence / 100);
  }

  const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  return { text: texts.join('\n'), confidence: mean };
}

/** Release the worker — graceful shutdown, and between test files. */
export async function shutdownOcr(): Promise<void> {
  const pending = worker;
  worker = null;
  if (!pending) return;
  try {
    await (await pending).terminate();
  } catch (err) {
    logger.warn({ err }, 'ocr worker did not terminate cleanly');
  }
}
