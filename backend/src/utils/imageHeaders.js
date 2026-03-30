<<<<<<< HEAD
=======
// Ensure uploaded images can be embedded by the frontend when COEP is enabled.
>>>>>>> dev
export function setUploadedImageHeaders(res) {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}
