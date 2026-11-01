export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, 'NOT_FOUND', what)
export const badRequest = (msg: string) => new HttpError(400, 'BAD_REQUEST', msg)
export const forbidden = (msg = 'Admin only') => new HttpError(403, 'FORBIDDEN', msg)
