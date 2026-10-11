export interface RecordApplicationActionState {
  ok: boolean;
  applicationId: string | null;
  code: string | null;
  message: string | null;
}

export const initialRecordApplicationActionState: RecordApplicationActionState = {
  ok: false,
  applicationId: null,
  code: null,
  message: null,
};
