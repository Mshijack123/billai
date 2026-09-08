import { toPng } from 'html-to-image';
import html2canvas from 'html2canvas';

export interface CaptureOptions {
  backgroundColor?: string;
  width?: string;
  padding?: string;
  color?: string;
  pixelRatio?: number;
}

/**
 * Robustly captures an HTML element into a PNG base64 data URI.
 * Uses html-to-image with skipFonts: true to prevent "font is undefined" errors
 * caused by external stylesheet/font-face parsing.
 * Falls back to html2canvas if html-to-image encounters an error.
 */
export async function captureElementToPng(
  element: HTMLElement,
  options: CaptureOptions = {}
): Promise<string> {
  const {
    backgroundColor = '#ffffff',
    width = '1000px',
    padding,
    color,
    pixelRatio = 2
  } = options;

  // Short delay to ensure dynamic elements have completed painting
  await new Promise(resolve => setTimeout(resolve, 300));

  try {
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio,
      skipFonts: true, // CRITICAL: Skips CSS rule font normalization which causes "font is undefined"
      backgroundColor,
      cacheBust: true,
      style: {
        transform: 'none',
        scale: '1',
        margin: '0',
        position: 'relative',
        boxShadow: 'none',
        width,
        height: 'auto',
        left: '0',
        top: '0',
        display: 'block',
        visibility: 'visible',
        opacity: '1',
        ...(padding ? { padding } : {}),
        ...(color ? { color } : {})
      }
    });

    if (dataUrl && dataUrl.length > 100) {
      return dataUrl;
    }
    throw new Error('Generated image is empty');
  } catch (err) {
    console.warn('html-to-image failed or threw error, falling back to html2canvas:', err);
    const canvas = await html2canvas(element, {
      scale: pixelRatio,
      useCORS: true,
      backgroundColor,
      logging: false,
      windowWidth: 1200
    });
    const fallbackDataUrl = canvas.toDataURL('image/png');
    if (!fallbackDataUrl || fallbackDataUrl.length < 100) {
      throw new Error('Image generation failed with both renderers');
    }
    return fallbackDataUrl;
  }
}
