export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function errorResponse(error: unknown, requestId: string): Response {
  const known = error instanceof HttpError;
  return Response.json({ error: {
    code: known ? error.code : "INTERNAL_ERROR",
    message: known ? error.message : "Terjadi gangguan. Silakan coba kembali.",
    requestId,
  } }, { status: known ? error.status : 500 });
}
