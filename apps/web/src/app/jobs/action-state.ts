export interface JobStateActionResult {
  ok: boolean;
  code?: string;
}

export interface AddJobActionState {
  ok: boolean;
  jobId: string | null;
  status: 'inserted' | 'updated' | 'duplicate' | 'rejected' | null;
  code: string | null;
  message: string | null;
}

export const initialAddJobActionState: AddJobActionState = {
  ok: false,
  jobId: null,
  status: null,
  code: null,
  message: null,
};
