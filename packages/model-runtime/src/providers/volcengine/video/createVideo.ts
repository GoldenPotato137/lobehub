import createDebug from 'debug';

import type { CreateVideoOptions } from '../../../core/openaiCompatibleFactory';
import type { CreateVideoPayload, CreateVideoResponse } from '../../../types/video';

const log = createDebug('lobe-video:volcengine');

const IMAGE_INLINE_FETCH_TIMEOUT_MS = 60_000;

const inlineImageUrlAsBase64 = async (url: string): Promise<string> => {
  if (!/^https?:\/\//.test(url)) return url;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_INLINE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) throw new Error(`fetch image failed with status ${response.status}`);

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
    const bytes = Buffer.from(await response.arrayBuffer());

    log('Inlined image as base64: %s (%d bytes, %s)', url, bytes.byteLength, contentType);

    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch (error) {
    log('Failed to inline image %s, falling back to URL: %O', url, error);
    return url;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Volcengine video generation implementation
 * API docs: https://www.volcengine.com/docs/232791/1399051
 */
export async function createVolcengineVideo(
  payload: CreateVideoPayload,
  options: CreateVideoOptions,
): Promise<CreateVideoResponse> {
  const { model, params } = payload;
  const {
    prompt,
    imageUrl,
    imageUrls,
    endImageUrl,
    aspectRatio,
    duration,
    generateAudio,
    webSearch,
    watermark,
    seed,
    resolution,
    cameraFixed,
  } = params;

  log('Creating video with Volcengine API - model: %s, params: %O', model, params);

  const baseURL = options.baseURL || 'https://ark.cn-beijing.volces.com/api/v3';

  const [inlinedImageUrl, inlinedImageUrls, inlinedEndImageUrl] = await Promise.all([
    imageUrl ? inlineImageUrlAsBase64(imageUrl) : Promise.resolve(imageUrl),
    imageUrls
      ? Promise.all(imageUrls.map((url) => inlineImageUrlAsBase64(url)))
      : Promise.resolve(imageUrls),
    endImageUrl ? inlineImageUrlAsBase64(endImageUrl) : Promise.resolve(endImageUrl),
  ]);

  // Build content array
  const content: Record<string, unknown>[] = [{ text: prompt, type: 'text' }];

  if (inlinedImageUrl) {
    content.push({ image_url: { url: inlinedImageUrl }, role: 'first_frame', type: 'image_url' });
  }

  if (inlinedImageUrls && inlinedImageUrls.length > 0) {
    if (inlinedImageUrls.length === 1 && inlinedEndImageUrl) {
      content.push({
        image_url: { url: inlinedImageUrls[0] },
        role: 'first_frame',
        type: 'image_url',
      });
    } else {
      inlinedImageUrls.forEach((url) =>
        content.push({ image_url: { url }, role: 'reference_image', type: 'image_url' }),
      );
    }
  }

  if (inlinedEndImageUrl) {
    content.push({
      image_url: { url: inlinedEndImageUrl },
      role: 'last_frame',
      type: 'image_url',
    });
  }

  // Build request body
  const body: Record<string, unknown> = {
    content,
    model,
    watermark: watermark ?? false,
    ...(webSearch && { tools: [{ type: 'web_search' }] }),
  };

  if (aspectRatio !== undefined) body.ratio = aspectRatio;
  if (duration !== undefined) body.duration = duration;
  if (generateAudio !== undefined) body.generate_audio = generateAudio;
  if (seed !== undefined && seed !== null) body.seed = seed;
  if (resolution !== undefined) body.resolution = resolution;
  if (cameraFixed !== undefined) body.camera_fixed = cameraFixed;
  if (payload.callbackUrl) body.callback_url = payload.callbackUrl;

  log('Volcengine video API request body: %s', JSON.stringify(body, null, 2));

  const response = await fetch(`${baseURL}/contents/generations/tasks`, {
    body: JSON.stringify(body),
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const errorText = await response.text();
    log('Volcengine video API error: %s %s', response.status, errorText);
    throw new Error(`Volcengine video API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  log('Volcengine video API response: %O', data);

  if (!data?.id) {
    throw new Error('Invalid response: missing task id');
  }

  return { inferenceId: data.id, useWebhook: true };
}
