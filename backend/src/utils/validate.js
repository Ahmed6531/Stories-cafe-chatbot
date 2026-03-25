import { validationResult } from "express-validator";

export function validate(checks) {
  return [
    ...checks,
    (req, res, next) => {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            fields: result.array().map((e) => ({
              field: e.path,
              message: e.msg,
            })),
          },
        });
      }
      next();
    },
  ];
}
