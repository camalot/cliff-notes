import type {
  RenderRequest,
  RenderResponse,
  RepoInspectRequest,
  RepoInspectResponse,
  RandomCommitRequest,
  RandomCommitResponse,
  ErrorResponse,
} from "@cliff-notes/shared";
import { getProjectId } from "./project-id";

const API_BASE = "/api";
export const PROJECT_ID_HEADER = "X-Project-Id";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function post<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [PROJECT_ID_HEADER]: getProjectId(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: string | undefined;
    let message = `Request failed: ${res.status}`;
    try {
      const data = (await res.json()) as ErrorResponse;
      message = data.error ?? message;
      detail = data.detail;
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(message, res.status, detail);
  }
  return (await res.json()) as TRes;
}

export const api = {
  render: (body: RenderRequest) => post<RenderRequest, RenderResponse>("/render", body),
  inspectRepo: (body: RepoInspectRequest) =>
    post<RepoInspectRequest, RepoInspectResponse>("/repo/inspect", body),
  randomCommits: (body: RandomCommitRequest) =>
    post<RandomCommitRequest, RandomCommitResponse>("/commits/random", body),
};
