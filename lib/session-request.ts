let pendingRequest: Promise<unknown> = Promise.resolve();

export function withSessionRequest<T>(request: () => Promise<T>) {
  // Tabs share session cookies. Wait until the previous response has applied
  // its cookies before starting another renewal or ending the session.
  if (navigator.locks) {
    return navigator.locks.request("pretriage-web-session", request);
  }

  const result = pendingRequest.then(request);
  pendingRequest = result.catch(() => undefined);
  return result;
}
