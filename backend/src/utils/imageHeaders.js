// Ensure uploaded images can be embedded by the frontend when COEP is enabled.
export function setUploadedImageHeaders(res) {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}
