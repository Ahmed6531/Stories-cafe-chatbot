import { jest } from "@jest/globals";
import { setUploadedImageHeaders } from "../imageHeaders.js";

describe("setUploadedImageHeaders", () => {
  it("allows uploaded images to be embedded cross-origin", () => {
    const res = {
      setHeader: jest.fn(),
    };

    setUploadedImageHeaders(res);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Cross-Origin-Resource-Policy",
      "cross-origin"
    );
  });
});
