const errorHandler = (err, req, res, next) => {
  console.error("Unhandled error:", err);

  const statusCode = err.statusCode || err.status || 500;

  const message =
    err.publicMessage ||
    err.message ||
    "An unexpected server error occurred.";

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === "development" && {
        details: err.stack,
      }),
    },
  });
};

export default errorHandler;