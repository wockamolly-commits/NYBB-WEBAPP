type RequestOriginInput = {
  headers: Pick<Headers, "get">;
  origin: string;
};

/** Reject browser requests initiated by another site before changing a session. */
export function isCrossSiteRequest({ headers, origin }: RequestOriginInput): boolean {
  const requestOrigin = headers.get("origin");
  return (
    headers.get("sec-fetch-site") === "cross-site" ||
    Boolean(requestOrigin && requestOrigin !== origin)
  );
}
