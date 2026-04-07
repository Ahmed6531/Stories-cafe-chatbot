export function errorHandler(err, req, res, next) {
  let status = 500;
  let code = "INTERNAL_ERROR";

  if (err.name === "JsonWebTokenError") {
    status = 401;
    code = "INVALID_TOKEN";
  } else if (err.name === "TokenExpiredError") {
    status = 401;
    code = "TOKEN_EXPIRED";
  } else if (err.name === "ValidationError") {
    status = 400;
    code = "VALIDATION_ERROR";
  } else if (err.status || err.statusCode) {
    status = err.status ?? err.statusCode;
    code = err.code ?? "INTERNAL_ERROR";
  }

  const body = {
    error: {
      code,
      message: err.message || "An unexpected error occurred",
    },
  };

  if (process.env.NODE_ENV !== "production") {
    body.error.stack = err.stack;
  }

  res.status(status).json(body);
}
