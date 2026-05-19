// L9: Ambient type declarations for qrcode@1.5.x which ships no .d.ts.
// Covers the two methods used in this codebase.
// Must be a script file (no top-level import/export) so the declare module
// takes effect as a global ambient override.
declare module 'qrcode' {
  interface QRCodeRenderersOptions {
    width?: number
    margin?: number
    scale?: number
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
    color?: { dark?: string; light?: string }
  }
  function toDataURL(text: string, options?: QRCodeRenderersOptions): Promise<string>
  function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
    options?: QRCodeRenderersOptions
  ): Promise<void>
  const QRCode: {
    toDataURL: typeof toDataURL
    toCanvas: typeof toCanvas
  }
  export default QRCode
  export { toDataURL, toCanvas }
}
